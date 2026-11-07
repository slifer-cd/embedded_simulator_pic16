// CPU: fetch / decode / execute for the 35 PIC16F84A instructions.
//
// Timing follows the 2-stage pipeline: every instruction takes 1 cycle, plus 1 when the
// PC changes (the prefetched instruction is thrown away and a NOP runs instead):
//   - GOTO, CALL, RETURN, RETLW, RETFIE (already 2 in the instruction table)
//   - a skip that is taken (DECFSZ, INCFSZ, BTFSC, BTFSS)
//   - a write to PCL (e.g. ADDWF PCL, F for lookup tables)
//
// Not yet simulated: Timer0, interrupts, watchdog, EEPROM writes, pin levels.

import { MEMORY } from "../chip/config.ts";
import { decodeInstruction } from "../chip/instructions.ts";
import type { Instruction } from "../chip/instructions.ts";
import { Memory, PCL, PCLATH, STATUS } from "./memory.ts";
import { Stack } from "./stack.ts";

const PC_MASK = 0x1fff; // 13-bit program counter

// STATUS bits
const C = 0;
const DC = 1;
const Z = 2;
const NOT_PD = 3;
const NOT_TO = 4;

const INTCON = 0x0b;
const GIE = 7;

export type StepResult = {
  address: number; // address of the instruction that ran
  word: number;
  instruction: Instruction | undefined; // undefined = not a valid instruction (ran as NOP)
  cycles: number; // cycles this instruction took
  warnings: string[]; // e.g. stack overflow
  endlessLoop: boolean; // a GOTO that jumped to itself ("GOTO $"): the program is "finished"
};

// A copy of the CPU state at one moment, for the UI (the Cpu object itself keeps changing)
export type CpuSnapshot = {
  pc: number;
  w: number;
  cycles: number;
  sleeping: boolean;
  file: Uint8Array; // data memory by canonical address
  stack: number[]; // valid return addresses, newest first
};

export class Cpu {
  readonly memory = new Memory();
  readonly stack = new Stack();
  w = 0;
  pc = 0; // 13 bits; the low 8 bits are mirrored in PCL
  cycles = 0; // total instruction cycles since reset
  sleeping = false;

  // Load an assembled program and reset
  load(program: number[], eeprom: number[]): void {
    this.memory.load(program, eeprom);
    this.reset();
  }

  // Power-on reset (program memory and EEPROM are kept)
  reset(): void {
    this.memory.reset();
    this.stack.reset();
    this.w = 0;
    this.setPc(MEMORY.RESET_VECTOR);
    this.cycles = 0;
    this.sleeping = false;
  }

  snapshot(): CpuSnapshot {
    return {
      pc: this.pc,
      w: this.w,
      cycles: this.cycles,
      sleeping: this.sleeping,
      file: this.memory.file.slice(),
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
      // Nothing wakes the chip yet (watchdog / interrupts come later): time just passes
      this.cycles += 1;
      return { address, word, instruction, cycles: 1, warnings: ["Sleeping."], endlessLoop: false };
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

    this.cycles += cycles;
    const endlessLoop = instruction?.mnemonic === "GOTO" && this.pc === address;
    return { address, word, instruction, cycles, warnings, endlessLoop };
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
        // Watchdog timer is not simulated yet; only the status bits
        this.setFlag(NOT_TO, true);
        this.setFlag(NOT_PD, true);
        break;
      case "SLEEP":
        this.setFlag(NOT_TO, true);
        this.setFlag(NOT_PD, false);
        this.sleeping = true;
        break;
    }

    return extra;
  }
}
