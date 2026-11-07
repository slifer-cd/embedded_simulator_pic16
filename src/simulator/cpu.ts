// CPU: fetch / decode / execute for the 35 PIC16F84A instructions.
//
// Timing follows the 2-stage pipeline: every instruction takes 1 cycle, plus 1 when the
// PC changes (the prefetched instruction is thrown away and a NOP runs instead):
//   - GOTO, CALL, RETURN, RETLW, RETFIE (already 2 in the instruction table)
//   - a skip that is taken (DECFSZ, INCFSZ, BTFSC, BTFSS)
//   - a write to PCL (e.g. ADDWF PCL, F for lookup tables)
//
// Interrupts: after each instruction, if GIE = 1 and a source has its enable bit and
// its flag set, the CPU pushes the PC (the return address), clears GIE (so the routine
// is not interrupted again) and jumps to 0x0004. That costs 2 cycles here, like a CALL
// (the real chip needs 3-4 cycles of latency). RETFIE pops the PC and sets GIE again.
// Sources so far: TMR0 overflow (T0IE / T0IF), RB0/INT edge (INTE / INTF),
// RB7:RB4 change (RBIE / RBIF), EEPROM write complete (EEIE in INTCON / EEIF in EECON1).
//
// Watchdog (peripherals/watchdog.ts): a timeout resets the chip (WDT reset), or wakes it
// up when it is in SLEEP: then it goes on with the instruction after SLEEP.
//
// SLEEP wake-up by an interrupt: RB0/INT, RB7:RB4 change or EEPROM write complete wake
// the chip when that source's enable bit and flag are set, WHATEVER GIE is (Timer0 can't:
// it stops in SLEEP). The chip runs the instruction after SLEEP; then, if GIE = 1, the
// normal interrupt check jumps to 0x0004. If such an interrupt is already waiting when
// SLEEP executes, SLEEP works like a NOP (no sleep; WDT, TO and PD are not touched).
// Not simulated: the oscillator start-up time after a wake-up (1024 clocks for XT/LP/HS).

import { MEMORY } from "../chip/config.ts";
import { decodeInstruction } from "../chip/instructions.ts";
import type { Instruction } from "../chip/instructions.ts";
import { Memory, PCL, PCLATH, STATUS } from "./memory.ts";
import type { MemoryState, ResetKind } from "./memory.ts";
import { Stack } from "./stack.ts";
import type { StackState } from "./stack.ts";
import type { PinDrives } from "./pins.ts";

const PC_MASK = 0x1fff; // 13-bit program counter

// STATUS bits
const C = 0;
const DC = 1;
const Z = 2;
const NOT_PD = 3;
const NOT_TO = 4;

const INTCON = 0x0b;
// INTCON bits
const GIE = 7;
const EEIE = 6;
const T0IE = 5;
const INTE = 4;
const RBIE = 3;
const T0IF = 2;
const INTF = 1;
const RBIF = 0;
const EECON1 = 0x88;
const EEIF = 4; // EECON1 bit: the only interrupt flag that is not in INTCON

const ENABLE_BITS = 0x78; // EEIE, T0IE, INTE, RBIE (bits 6-3)

// In SLEEP one step lets up to this many cycles pass (1 ms at 4 MHz), so a 2.3 s watchdog
// wake-up doesn't take millions of steps. It never jumps past an event (WDT timeout, end of
// an EEPROM write), so those still happen on the exact cycle.
const SLEEP_STEP_CYCLES = 1000;

const INTERRUPT_CYCLES = 2; // jump to the interrupt vector (see the comment at the top)

export type StepResult = {
  address: number; // address of the instruction that ran
  word: number;
  instruction: Instruction | undefined; // undefined = not a valid instruction (ran as NOP)
  cycles: number; // cycles this instruction took (+ the interrupt jump, if one happened)
  warnings: string[]; // e.g. stack overflow
  interrupt: boolean; // an interrupt happened after the instruction: PC = 0x0004
  watchdogReset: boolean; // the WDT timed out while running: the chip was reset
  wakeUp: "watchdog" | "interrupt" | null; // the CPU left SLEEP during this step
  endlessLoop: boolean; // "GOTO $" with no interrupt that could get it out: the program is "finished"
};

// A copy of the CPU state at one moment, for the UI (the Cpu object itself keeps changing)
export type CpuSnapshot = {
  pc: number;
  w: number;
  cycles: number;
  sleeping: boolean;
  file: Uint8Array; // data memory by canonical address (PORTA / PORTB = output latches)
  drives: PinDrives; // external pin drives, to compute pin levels (see pins.ts)
  eeprom: Uint8Array; // data EEPROM (64 bytes)
  stack: number[]; // valid return addresses, newest first
};

// The complete chip state at one moment, including hidden counters (prescaler, watchdog,
// EEPROM write in progress, ...): restoring it and running on gives exactly the same result.
// Used for stepping back. (CpuSnapshot is the smaller copy the UI shows.)
export type CpuState = {
  w: number;
  pc: number;
  cycles: number;
  sleeping: boolean;
  memory: MemoryState;
  stack: StackState;
};

export class Cpu {
  readonly memory = new Memory();
  readonly stack = new Stack();
  w = 0;
  pc = 0; // 13 bits; the low 8 bits are mirrored in PCL
  cycles = 0; // total instruction cycles since reset
  sleeping = false;

  // Load an assembled program (config = configuration word, e.g. watchdog on/off) and reset
  load(program: number[], eeprom: number[], config: number): void {
    this.memory.load(program, eeprom, config);
    this.reset();
  }

  // Reset the chip (program memory and EEPROM are kept). The program starts again at 0x0000.
  //
  // STATUS.NOT_TO / NOT_PD tell the program what happened (datasheet Table 6-2):
  //   power-on                     TO = 1  PD = 1
  //   MCLR, normal operation       unchanged
  //   MCLR during SLEEP            TO = 1  PD = 0
  //   WDT reset, normal operation  TO = 0  PD = 1
  // (A WDT timeout in SLEEP is a wake-up, not a reset: TO = 0, PD = 0, see the watchdog.)
  reset(kind: ResetKind = "power-on"): void {
    const wasSleeping = this.sleeping;
    this.memory.reset(kind);
    this.stack.reset();
    this.setPc(MEMORY.RESET_VECTOR);
    this.sleeping = false;

    if (kind === "power-on") {
      this.w = 0; // unknown on the real chip
      this.cycles = 0; // MCLR / WDT resets keep W and the cycle count: time goes on
    } else if (kind === "mclr") {
      if (wasSleeping) {
        this.setFlag(NOT_TO, true);
        this.setFlag(NOT_PD, false);
      }
    } else {
      this.setFlag(NOT_TO, false);
      this.setFlag(NOT_PD, true);
    }
  }

  // Fills "into" when given: no new objects, so the history can save every step cheaply
  saveState(into?: CpuState): CpuState {
    if (!into) {
      return {
        w: this.w,
        pc: this.pc,
        cycles: this.cycles,
        sleeping: this.sleeping,
        memory: this.memory.save(),
        stack: this.stack.save(),
      };
    }
    into.w = this.w;
    into.pc = this.pc;
    into.cycles = this.cycles;
    into.sleeping = this.sleeping;
    this.memory.save(into.memory);
    this.stack.save(into.stack);
    return into;
  }

  restoreState(state: CpuState): void {
    this.w = state.w;
    this.pc = state.pc;
    this.cycles = state.cycles;
    this.sleeping = state.sleeping;
    this.memory.restore(state.memory);
    this.stack.restore(state.stack);
  }

  snapshot(): CpuSnapshot {
    return {
      pc: this.pc,
      w: this.w,
      cycles: this.cycles,
      sleeping: this.sleeping,
      file: this.memory.file.slice(),
      drives: this.memory.pins.copyDrives(),
      eeprom: this.memory.eeprom.slice(),
      stack: this.stack.entries(),
    };
  }

  // ---------- Helpers ----------

  private setPc(value: number): void {
    this.pc = value & PC_MASK;
    this.memory.poke(PCL, this.pc & 0xff);
  }

  private flag(bit: number): number {
    return (this.memory.peek(STATUS) >> bit) & 1;
  }

  private setFlag(bit: number, on: boolean): void {
    const status = this.memory.peek(STATUS);
    this.memory.poke(STATUS, on ? status | (1 << bit) : status & ~(1 << bit));
  }

  private setZ(result: number): void {
    this.setFlag(Z, (result & 0xff) === 0);
  }

  // ---------- Execution ----------

  step(): StepResult {
    const address = this.pc;
    const word = this.memory.program[address % MEMORY.PROGRAM_SIZE];
    const instruction = decodeInstruction(word);
    const warnings: string[] = [];

    if (this.sleeping) {
      // The instruction clock is stopped: Timer0 waits. The EEPROM write, the watchdog
      // (own RC oscillator) and the PORTB pins (INT edge, RB change) keep working.
      const mem = this.memory;
      const elapsed = Math.min(
        SLEEP_STEP_CYCLES,
        mem.watchdog.cyclesToTimeout(),
        mem.eepromController.cyclesToDone(),
      );
      this.cycles += elapsed;
      mem.eepromController.tick(elapsed);
      mem.portbInterrupts.tick();
      const timeout = mem.watchdog.tick(elapsed);

      // The PC already points to the instruction after SLEEP: that runs next
      let wakeUp: StepResult["wakeUp"] = null;
      if (timeout) {
        wakeUp = "watchdog"; // TO = 0, PD = 0
        this.setFlag(NOT_TO, false);
        this.setFlag(NOT_PD, false);
      } else if (this.wakeUpRequested()) {
        wakeUp = "interrupt"; // TO = 1, PD = 0 (as SLEEP left them)
      }
      if (wakeUp) this.sleeping = false;

      return {
        address,
        word,
        instruction,
        cycles: elapsed,
        warnings,
        interrupt: false,
        watchdogReset: false,
        wakeUp,
        endlessLoop: false,
      };
    }

    // Fetch: the PC already points to the next instruction while this one executes
    // (so ADDWF PCL, F adds to the address of the NEXT instruction, like the real chip)
    this.setPc(address + 1);

    let cycles = instruction ? instruction.cycles : 1;

    if (!instruction) {
      warnings.push(`Invalid instruction 0x${word.toString(16).toUpperCase()} executed as NOP.`);
    } else {
      const extra = this.execute(instruction, word, warnings);
      cycles += extra;
    }

    let timeout = this.passTime(cycles);

    // Interrupt check, after the instruction (and after the peripherals set their flags)
    const interrupt = !timeout && this.interruptPending();
    if (interrupt) {
      const { overflow } = this.stack.push(this.pc); // pc = the next instruction: return there
      if (overflow) warnings.push("Stack overflow: the oldest return address was lost.");
      const intcon = this.memory.peek(INTCON);
      this.memory.poke(INTCON, intcon & ~(1 << GIE));
      this.setPc(MEMORY.INTERRUPT_VECTOR);
      timeout = this.passTime(INTERRUPT_CYCLES) || timeout;
      cycles += INTERRUPT_CYCLES;
    }

    // Watchdog timeout while running: WDT reset, the program starts again at 0x0000
    if (timeout) this.reset("wdt");

    // GOTO $ only ends the program when no interrupt can get it out of the loop
    // (with interrupts on it is the usual "wait for interrupts" loop)
    const endlessLoop =
      !timeout &&
      instruction?.mnemonic === "GOTO" &&
      this.pc === address &&
      !this.interruptsEnabled();
    return {
      address,
      word,
      instruction,
      cycles,
      warnings,
      interrupt,
      watchdogReset: timeout,
      wakeUp: null,
      endlessLoop,
    };
  }

  // The instruction the next step runs (undefined = not a valid instruction)
  get nextInstruction(): Instruction | undefined {
    return decodeInstruction(this.memory.program[this.pc % MEMORY.PROGRAM_SIZE]);
  }

  // Oscillator frequency (see Memory.clockHz). Changing it doesn't reset anything.
  get clockHz(): number {
    return this.memory.clockHz;
  }

  setClock(hz: number): void {
    this.memory.clockHz = hz;
  }

  // Something can end SLEEP (so Run should keep going while the CPU sleeps):
  // the watchdog, or an enabled INT / RB change / EEPROM interrupt
  get canWake(): boolean {
    const intcon = this.memory.peek(INTCON);
    const wakeSources = (1 << INTE) | (1 << RBIE) | (1 << EEIE);
    return this.memory.watchdog.enabled || (intcon & wakeSources) !== 0;
  }

  // Cycles pass (not called during SLEEP: the instruction clock stops).
  // Returns true when the watchdog timed out.
  private passTime(cycles: number): boolean {
    this.cycles += cycles;
    this.memory.eepromController.tick(cycles); // EEPROM write in progress finishes after ~4 ms
    this.memory.timer0.tick(cycles);
    this.memory.portbInterrupts.tick();
    return this.memory.watchdog.tick(cycles);
  }

  // GIE = 1 and at least one source is enabled: an interrupt can still come.
  private interruptsEnabled(): boolean {
    const intcon = this.memory.peek(INTCON);
    return ((intcon >> GIE) & 1) === 1 && (intcon & ENABLE_BITS) !== 0;
  }

  // GIE = 1 and some source has its enable bit and its flag set
  private interruptPending(): boolean {
    const intcon = this.memory.peek(INTCON);
    if (((intcon >> GIE) & 1) === 0) return false;
    const tmr0 = (intcon >> T0IE) & (intcon >> T0IF) & 1;
    return tmr0 === 1 || this.wakeUpRequested();
  }

  // A source that can wake the chip from SLEEP has its enable bit and flag set (GIE not needed)
  private wakeUpRequested(): boolean {
    const intcon = this.memory.peek(INTCON);
    const int = (intcon >> INTE) & (intcon >> INTF) & 1;
    const rbChange = (intcon >> RBIE) & (intcon >> RBIF) & 1;
    const eeprom = (intcon >> EEIE) & (this.memory.peek(EECON1) >> EEIF) & 1;
    return (int | rbChange | eeprom) === 1;
  }

  // Runs one instruction; returns the extra cycles (taken skip / PCL write)
  private execute(instruction: Instruction, word: number, warnings: string[]): number {
    const mem = this.memory;
    const f = word & 0x7f;
    const d = (word >> 7) & 1; // 0 = W, 1 = f
    const b = (word >> 7) & 0x07;
    const k = word & 0xff;
    let extra = 0;

    // Store the result of an "f, d" instruction (W or the register).
    // Writing PCL changes the program counter: PC = PCLATH : PCL, and costs 1 cycle.
    const writeFile = (value: number) => {
      const writesPcl = mem.target(f) === PCL;
      mem.write(f, value & 0xff);
      if (writesPcl) {
        this.pc = ((mem.peek(PCLATH) << 8) | mem.peek(PCL)) & PC_MASK;
        extra += 1;
      }
    };
    const store = (value: number) => {
      if (d === 0) this.w = value & 0xff;
      else writeFile(value);
    };

    // Taken skip: jump over the next instruction (it runs as a NOP: +1 cycle)
    const skip = () => {
      this.setPc(this.pc + 1);
      extra += 1;
    };

    // GOTO / CALL target: 11 bits from the instruction + PCLATH<4:3>
    const jumpTarget = () => ((mem.peek(PCLATH) & 0x18) << 8) | (word & 0x7ff);

    const returnFromStack = () => {
      const { address, underflow } = this.stack.pop();
      if (underflow) warnings.push("Stack underflow: return address is not valid.");
      this.setPc(address);
    };

    // Flags are set AFTER the result is stored: when STATUS is the destination,
    // the flag bits win (like the real chip).
    switch (instruction.mnemonic) {
      // ---------- Byte-oriented ----------
      case "ADDWF": {
        const value = mem.read(f);
        const w = this.w; // keep W: store() may overwrite it (d = 0)
        const result = value + w;
        store(result);
        this.setFlag(C, result > 0xff);
        this.setFlag(DC, (value & 0x0f) + (w & 0x0f) > 0x0f);
        this.setZ(result);
        break;
      }
      case "SUBWF": {
        // f - W; C = 1 means no borrow
        const value = mem.read(f);
        const w = this.w;
        const result = value - w;
        store(result);
        this.setFlag(C, result >= 0);
        this.setFlag(DC, (value & 0x0f) >= (w & 0x0f));
        this.setZ(result);
        break;
      }
      case "ANDWF": {
        const result = mem.read(f) & this.w;
        store(result);
        this.setZ(result);
        break;
      }
      case "IORWF": {
        const result = mem.read(f) | this.w;
        store(result);
        this.setZ(result);
        break;
      }
      case "XORWF": {
        const result = mem.read(f) ^ this.w;
        store(result);
        this.setZ(result);
        break;
      }
      case "CLRF":
        writeFile(0);
        this.setFlag(Z, true);
        break;
      case "CLRW":
        this.w = 0;
        this.setFlag(Z, true);
        break;
      case "COMF": {
        const result = ~mem.read(f) & 0xff;
        store(result);
        this.setZ(result);
        break;
      }
      case "DECF": {
        const result = (mem.read(f) - 1) & 0xff;
        store(result);
        this.setZ(result);
        break;
      }
      case "INCF": {
        const result = (mem.read(f) + 1) & 0xff;
        store(result);
        this.setZ(result);
        break;
      }
      case "DECFSZ": {
        const result = (mem.read(f) - 1) & 0xff;
        store(result);
        if (result === 0) skip();
        break;
      }
      case "INCFSZ": {
        const result = (mem.read(f) + 1) & 0xff;
        store(result);
        if (result === 0) skip();
        break;
      }
      case "MOVF": {
        const result = mem.read(f);
        store(result);
        this.setZ(result);
        break;
      }
      case "MOVWF":
        writeFile(this.w);
        break;
      case "NOP":
        break;
      case "RLF": {
        const value = mem.read(f);
        const result = ((value << 1) | this.flag(C)) & 0xff;
        store(result);
        this.setFlag(C, (value & 0x80) !== 0);
        break;
      }
      case "RRF": {
        const value = mem.read(f);
        const result = (value >> 1) | (this.flag(C) << 7);
        store(result);
        this.setFlag(C, (value & 0x01) !== 0);
        break;
      }
      case "SWAPF": {
        const value = mem.read(f);
        store(((value & 0x0f) << 4) | (value >> 4));
        break;
      }

      // ---------- Bit-oriented (read-modify-write) ----------
      case "BCF":
        writeFile(mem.read(f) & ~(1 << b));
        break;
      case "BSF":
        writeFile(mem.read(f) | (1 << b));
        break;
      case "BTFSC":
        if ((mem.read(f) & (1 << b)) === 0) skip();
        break;
      case "BTFSS":
        if ((mem.read(f) & (1 << b)) !== 0) skip();
        break;

      // ---------- Literal ----------
      case "ADDLW": {
        const result = k + this.w;
        this.setFlag(C, result > 0xff);
        this.setFlag(DC, (k & 0x0f) + (this.w & 0x0f) > 0x0f);
        this.w = result & 0xff;
        this.setZ(result);
        break;
      }
      case "SUBLW": {
        // k - W; C = 1 means no borrow
        const result = k - this.w;
        this.setFlag(C, result >= 0);
        this.setFlag(DC, (k & 0x0f) >= (this.w & 0x0f));
        this.w = result & 0xff;
        this.setZ(result);
        break;
      }
      case "ANDLW":
        this.w &= k;
        this.setZ(this.w);
        break;
      case "IORLW":
        this.w |= k;
        this.setZ(this.w);
        break;
      case "XORLW":
        this.w ^= k;
        this.setZ(this.w);
        break;
      case "MOVLW":
        this.w = k;
        break;

      // ---------- Control ----------
      case "GOTO":
        this.setPc(jumpTarget());
        break;
      case "CALL": {
        const { overflow } = this.stack.push(this.pc); // pc already = return address
        if (overflow) warnings.push("Stack overflow: the oldest return address was lost.");
        this.setPc(jumpTarget());
        break;
      }
      case "RETURN":
        returnFromStack();
        break;
      case "RETLW":
        this.w = k;
        returnFromStack();
        break;
      case "RETFIE":
        returnFromStack();
        mem.poke(INTCON, mem.peek(INTCON) | (1 << GIE));
        break;
      case "CLRWDT":
        mem.watchdog.clear(); // WDT and its postscaler = 0
        this.setFlag(NOT_TO, true);
        this.setFlag(NOT_PD, true);
        break;
      case "SLEEP":
        if (this.wakeUpRequested()) break; // a wake-up interrupt is already waiting: NOP
        mem.watchdog.clear();
        this.setFlag(NOT_TO, true);
        this.setFlag(NOT_PD, false);
        this.sleeping = true;
        break;
    }

    return extra;
  }
}
