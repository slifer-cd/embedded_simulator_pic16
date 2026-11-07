import { describe, expect, it } from "vite-plus/test";
import { assemble } from "../src/assembler/assembler.ts";
import { Cpu } from "../src/simulator/cpu.ts";
import type { StepResult } from "../src/simulator/cpu.ts";

// Assemble a program (lines already indented) and load it. The watchdog is off unless
// the test asks for another config.
function load(body: string, config = "_WDT_OFF"): Cpu {
  const result = assemble(`        __CONFIG ${config}\n${body}\n        END`);
  if (!result.success) throw new Error(JSON.stringify(result.messages));
  const cpu = new Cpu();
  cpu.load(result.program, result.eeprom, result.config);
  return cpu;
}

// Run n steps; returns the last step's result
function run(cpu: Cpu, n: number): StepResult {
  let last!: StepResult;
  for (let i = 0; i < n; i++) last = cpu.step();
  return last;
}

// Run until the PC reaches an address (or give up)
function runTo(cpu: Cpu, address: number, limit = 100_000): void {
  for (let i = 0; i < limit && cpu.pc !== address; i++) cpu.step();
  if (cpu.pc !== address) throw new Error(`PC never reached 0x${address.toString(16)}`);
}

const STATUS = 0x03;
const INTCON = 0x0b;
const flags = (cpu: Cpu) => {
  const s = cpu.memory.peek(STATUS);
  return { C: s & 1, DC: (s >> 1) & 1, Z: (s >> 2) & 1, PD: (s >> 3) & 1, TO: (s >> 4) & 1 };
};
const ram = (cpu: Cpu, address: number) => cpu.memory.peek(address);

describe("cpu: arithmetic and flags", () => {
  it("ADDLW sets C, DC and Z", () => {
    const cpu = load(
      "        MOVLW 0xF0\n        ADDLW 0x20\n        MOVLW 0x0F\n        ADDLW 0x01",
    );
    run(cpu, 2);
    expect(cpu.w).toBe(0x10);
    expect(flags(cpu)).toMatchObject({ C: 1, DC: 0, Z: 0 });
    run(cpu, 2);
    expect(cpu.w).toBe(0x10);
    expect(flags(cpu)).toMatchObject({ C: 0, DC: 1, Z: 0 });
  });

  it("ADDLW to 0x100 gives 0 with Z = C = DC = 1", () => {
    const cpu = load("        MOVLW 0xFF\n        ADDLW 0x01");
    run(cpu, 2);
    expect(cpu.w).toBe(0);
    expect(flags(cpu)).toMatchObject({ C: 1, DC: 1, Z: 1 });
  });

  it("SUBLW computes k - W, and C = 1 means no borrow", () => {
    const cpu = load(
      "        MOVLW 5\n        SUBLW 3\n        MOVLW 3\n        SUBLW 5\n        MOVLW 7\n        SUBLW 7",
    );
    run(cpu, 2);
    expect(cpu.w).toBe(0xfe);
    expect(flags(cpu)).toMatchObject({ C: 0, Z: 0 });
    run(cpu, 2);
    expect(cpu.w).toBe(2);
    expect(flags(cpu)).toMatchObject({ C: 1, Z: 0 });
    run(cpu, 2);
    expect(flags(cpu)).toMatchObject({ C: 1, Z: 1 });
  });

  it("SUBWF computes f - W into W or f", () => {
    const cpu = load(
      "        MOVLW 9\n        MOVWF 0x20\n        MOVLW 4\n        SUBWF 0x20, W\n        SUBWF 0x20, F",
    );
    run(cpu, 4);
    expect(cpu.w).toBe(5);
    expect(ram(cpu, 0x20)).toBe(9);
    run(cpu, 1); // W is 5 now: 9 - 5
    expect(ram(cpu, 0x20)).toBe(4);
  });

  it("ADDWF stores in W (d = 0) or in the register (d = 1)", () => {
    const cpu = load(
      "        MOVLW 2\n        MOVWF 0x21\n        ADDWF 0x21, W\n        ADDWF 0x21, F",
    );
    run(cpu, 3);
    expect([cpu.w, ram(cpu, 0x21)]).toEqual([4, 2]);
    run(cpu, 1);
    expect([cpu.w, ram(cpu, 0x21)]).toEqual([4, 6]);
  });

  it("INCF / DECF wrap around and set Z", () => {
    const cpu = load(
      "        MOVLW 0xFF\n        MOVWF 0x22\n        INCF 0x22, F\n        DECF 0x22, F",
    );
    run(cpu, 3);
    expect(ram(cpu, 0x22)).toBe(0);
    expect(flags(cpu).Z).toBe(1);
    run(cpu, 1);
    expect(ram(cpu, 0x22)).toBe(0xff);
    expect(flags(cpu).Z).toBe(0);
  });

  it("sets the flags AFTER storing: CLRF STATUS leaves Z = 1", () => {
    const cpu = load("        BSF STATUS, C\n        CLRF STATUS");
    run(cpu, 2);
    expect(ram(cpu, STATUS)).toBe(0x1c); // TO, PD (read-only) and Z
  });
});

describe("cpu: logic, moves and rotates", () => {
  it("ANDLW / IORLW / XORLW / COMF / MOVF set Z", () => {
    const cpu = load(
      "        MOVLW 0x0F\n        ANDLW 0xF0\n        IORLW 0x81\n        XORLW 0x81\n        MOVWF 0x20\n        COMF 0x20, W\n        MOVF 0x20, F",
    );
    run(cpu, 2);
    expect([cpu.w, flags(cpu).Z]).toEqual([0, 1]);
    run(cpu, 1);
    expect([cpu.w, flags(cpu).Z]).toEqual([0x81, 0]);
    run(cpu, 1);
    expect([cpu.w, flags(cpu).Z]).toEqual([0, 1]);
    run(cpu, 2);
    expect([cpu.w, flags(cpu).Z]).toEqual([0xff, 0]);
    run(cpu, 1);
    expect(flags(cpu).Z).toBe(1); // MOVF f, F: tests the register for zero
  });

  it("RLF / RRF rotate through the carry", () => {
    const cpu = load(
      "        MOVLW 0x81\n        MOVWF 0x20\n        BCF STATUS, C\n        RLF 0x20, F\n        RRF 0x20, F\n        RRF 0x20, F",
    );
    run(cpu, 4);
    expect(ram(cpu, 0x20)).toBe(0x02);
    expect(flags(cpu).C).toBe(1); // bit 7 went into C
    run(cpu, 1);
    expect(ram(cpu, 0x20)).toBe(0x81); // C came back into bit 7
    expect(flags(cpu).C).toBe(0);
    run(cpu, 1);
    expect(ram(cpu, 0x20)).toBe(0x40);
    expect(flags(cpu).C).toBe(1);
  });

  it("SWAPF swaps the nibbles without touching the flags", () => {
    const cpu = load(
      "        MOVLW 0x3C\n        MOVWF 0x20\n        BSF STATUS, Z\n        SWAPF 0x20, W",
    );
    run(cpu, 4);
    expect(cpu.w).toBe(0xc3);
    expect(flags(cpu).Z).toBe(1);
  });

  it("BSF / BCF change one bit", () => {
    const cpu = load("        BSF 0x20, 7\n        BSF 0x20, 0\n        BCF 0x20, 7");
    run(cpu, 3);
    expect(ram(cpu, 0x20)).toBe(0x01);
  });
});

describe("cpu: jumps, skips and the stack", () => {
  it("GOTO takes 2 cycles", () => {
    const cpu = load("        GOTO skip\n        NOP\nskip    NOP");
    const step = run(cpu, 1);
    expect(cpu.pc).toBe(2);
    expect(step.cycles).toBe(2);
  });

  it("CALL pushes the return address; RETURN and RETLW pop it", () => {
    const cpu = load(
      "        CALL sub\n        CALL table\n        GOTO $\nsub     RETURN\ntable   RETLW 0x42",
    );
    run(cpu, 1);
    expect(cpu.pc).toBe(3);
    expect(cpu.stack.entries()).toEqual([1]);
    const ret = run(cpu, 1);
    expect([cpu.pc, ret.cycles]).toEqual([1, 2]);
    run(cpu, 2);
    expect([cpu.pc, cpu.w, cpu.stack.depth]).toEqual([2, 0x42, 0]);
  });

  it("takes the upper GOTO / CALL bits from PCLATH<4:3>", () => {
    const cpu = load("        MOVLW 0x08\n        MOVWF PCLATH\n        GOTO 0x005");
    run(cpu, 3);
    expect(cpu.pc).toBe(0x805);
  });

  it("DECFSZ skips the next instruction at 0 (2 cycles), else 1 cycle", () => {
    const cpu = load(
      "        MOVLW 2\n        MOVWF 0x20\nloop    DECFSZ 0x20, F\n        GOTO loop\n        NOP",
    );
    run(cpu, 2);
    expect(run(cpu, 1).cycles).toBe(1); // 2 -> 1: no skip
    expect(cpu.pc).toBe(3);
    run(cpu, 1); // GOTO loop
    const skip = run(cpu, 1); // 1 -> 0: skip
    expect([cpu.pc, skip.cycles]).toEqual([4, 2]);
  });

  it("BTFSS / BTFSC skip on a set / clear bit", () => {
    const cpu = load(
      "        BSF 0x20, 3\n        BTFSS 0x20, 3\n        NOP\n        BTFSC 0x20, 3\n        NOP",
    );
    run(cpu, 2);
    expect(cpu.pc).toBe(3); // skipped the NOP
    run(cpu, 1);
    expect(cpu.pc).toBe(4); // bit set: no skip
  });

  it("ADDWF PCL, F jumps into a table (computed goto) with 1 extra cycle", () => {
    const cpu = load(
      "        MOVLW 2\n        CALL table\n        GOTO $\ntable   ADDWF PCL, F\n        RETLW 0x10\n        RETLW 0x11\n        RETLW 0x12",
    );
    run(cpu, 2);
    const jump = run(cpu, 1);
    expect(jump.cycles).toBe(2);
    expect(cpu.pc).toBe(6); // PC was already 4 (the next instruction) + 2
    run(cpu, 1);
    expect(cpu.w).toBe(0x12);
  });

  it("warns on a 9th nested CALL (overflow) and on RETURN with an empty stack (underflow)", () => {
    const calls = Array.from({ length: 9 }, (_, i) => `l${i}      CALL l${i + 1}`).join("\n");
    const cpu = load(`${calls}\nl9      NOP`);
    for (let i = 0; i < 8; i++) expect(cpu.step().warnings).toEqual([]);
    expect(cpu.step().warnings[0]).toMatch(/Stack overflow/);

    const empty = load("        RETURN");
    expect(empty.step().warnings[0]).toMatch(/Stack underflow/);
  });

  it("runs an invalid word as a NOP, with a warning", () => {
    const cpu = load("        NOP\n        NOP");
    cpu.memory.program[0] = 0x0001;
    const step = cpu.step();
    expect(step.instruction).toBeUndefined();
    expect(step.warnings[0]).toMatch(/Invalid instruction/);
    expect(cpu.pc).toBe(1);
  });

  it("reports GOTO $ as the end of the program, unless an interrupt can still come", () => {
    expect(run(load("        GOTO $"), 1).endlessLoop).toBe(true);
    const waiting = load("        MOVLW 0xA0\n        MOVWF INTCON\n        GOTO $");
    expect(run(waiting, 3).endlessLoop).toBe(false);
  });
});

describe("cpu: banks and indirect addressing", () => {
  it("RP0 selects bank 1 (TRISB) or bank 0 (PORTB)", () => {
    const cpu = load(
      "        BSF STATUS, RP0\n        CLRF TRISB\n        BCF STATUS, RP0\n        MOVLW 0xAA\n        MOVWF PORTB",
    );
    run(cpu, 5);
    expect(ram(cpu, 0x86)).toBe(0x00);
    expect(ram(cpu, 0x06)).toBe(0xaa); // pins are outputs now, so they show the latch
  });

  it("INDF / FSR reach RAM indirectly", () => {
    const cpu = load(
      "        MOVLW 0x30\n        MOVWF FSR\n        MOVLW 0x5A\n        MOVWF INDF\n        INCF FSR, F\n        MOVWF INDF",
    );
    run(cpu, 6);
    expect([ram(cpu, 0x30), ram(cpu, 0x31)]).toEqual([0x5a, 0x5a]);
  });
});

describe("cpu: Timer0", () => {
  const internal1to1 =
    "        BSF STATUS, RP0\n        MOVLW 0xD8\n        MOVWF OPTION_REG\n        BCF STATUS, RP0";

  it("counts instruction cycles (T0CS = 0) and sets T0IF on overflow", () => {
    const cpu = load(`${internal1to1}\n        MOVLW 0xFE\n        MOVWF TMR0\nloop    GOTO loop`);
    run(cpu, 6);
    expect(ram(cpu, 0x01)).toBe(0xfe); // still paused after the write
    run(cpu, 2);
    expect(ram(cpu, 0x01)).toBeLessThanOrEqual(0x03);
    expect(ram(cpu, INTCON) & 0x04).toBe(0x04);
  });

  // Figure 5-2: after MOVWF TMR0 the 1st and 2nd instruction read the written value,
  // the 3rd reads it + 1
  it("pauses 2 cycles after a write (Figure 5-2)", () => {
    const cpu = load(
      `${internal1to1}\n        MOVLW 0x10\n        MOVWF TMR0\n        MOVF TMR0, W\n        MOVWF 0x20\n        MOVF TMR0, W`,
    );
    run(cpu, 7); // ... MOVWF TMR0, MOVF TMR0, W (1st after the write)
    expect(cpu.w).toBe(0x10);
    run(cpu, 2); // MOVWF 0x20 (2nd), MOVF TMR0, W (3rd)
    expect(cpu.w).toBe(0x11);
  });

  it("uses the prescaler when PSA = 0 (here 1:4)", () => {
    const cpu = load(
      "        BSF STATUS, RP0\n        MOVLW 0xD1\n        MOVWF OPTION_REG\n        BCF STATUS, RP0\n        CLRF TMR0\nloop    GOTO loop",
    );
    runTo(cpu, 5);
    const start = cpu.cycles;
    for (let i = 0; i < 100; i++) cpu.step();
    const counted = ram(cpu, 0x01);
    expect(counted).toBe(Math.floor((cpu.cycles - start - 2) / 4)); // 2 paused cycles, then 1 per 4
  });

  it("counts RA4 edges with T0CS = 1 (after reset: falling edge, 1:1)", () => {
    const cpu = load("loop    GOTO loop");
    for (let i = 0; i < 3; i++) {
      cpu.memory.pins.setDrive("a", 4, 1);
      cpu.step();
      cpu.memory.pins.setDrive("a", 4, 0);
      cpu.step();
    }
    expect(ram(cpu, 0x01)).toBe(3);
  });
});

describe("cpu: interrupts", () => {
  it("TMR0 overflow: pushes the PC, clears GIE, jumps to 0x004; RETFIE returns and sets GIE", () => {
    const cpu = load(
      "        GOTO main\n        ORG 4\n        BCF INTCON, T0IF\n        RETFIE\nmain    BSF STATUS, RP0\n        MOVLW 0xD8\n        MOVWF OPTION_REG\n        BCF STATUS, RP0\n        MOVLW 0xFF\n        MOVWF TMR0\n        MOVLW 0xA0\n        MOVWF INTCON\nloop    GOTO loop",
    );
    let step!: StepResult;
    for (let i = 0; i < 100 && !step?.interrupt; i++) step = cpu.step();
    expect(step.interrupt).toBe(true);
    expect(cpu.pc).toBe(4);
    expect(ram(cpu, INTCON) & 0x80).toBe(0);
    expect(cpu.stack.depth).toBe(1);
    run(cpu, 2);
    expect(ram(cpu, INTCON) & 0x80).toBe(0x80);
    expect(cpu.stack.depth).toBe(0);
  });

  it("RB0/INT: an edge sets INTF even with GIE = 0", () => {
    const cpu = load("loop    GOTO loop");
    cpu.memory.pins.setDrive("b", 0, 0);
    cpu.step();
    cpu.memory.pins.setDrive("b", 0, 1); // rising edge (INTEDG = 1 after reset)
    const step = cpu.step();
    expect(ram(cpu, INTCON) & 0x02).toBe(0x02);
    expect(step.interrupt).toBe(false);
  });

  it("RB4-RB7 change: RBIF until PORTB is read and the flag cleared", () => {
    const cpu = load(
      "        MOVF PORTB, W\nloop    GOTO loop\n        ORG 0x10\nclear   MOVF PORTB, W\n        BCF INTCON, RBIF\n        GOTO loop",
    );
    run(cpu, 1);
    cpu.memory.pins.setDrive("b", 6, 1);
    run(cpu, 1);
    expect(ram(cpu, INTCON) & 0x01).toBe(0x01);
    cpu.pc = 0x10; // run the clearing code
    run(cpu, 3);
    expect(ram(cpu, INTCON) & 0x01).toBe(0);
  });
});

describe("cpu: SLEEP, watchdog and resets", () => {
  it("SLEEP: TO = 1, PD = 0; the WDT wakes it (TO = 0, PD = 0) and it goes on after SLEEP", () => {
    const cpu = load("        SLEEP\n        MOVLW 0x22\n        GOTO $", "_WDT_ON");
    run(cpu, 1);
    expect(cpu.sleeping).toBe(true);
    expect(flags(cpu)).toMatchObject({ TO: 1, PD: 0 });
    let step!: StepResult;
    for (let i = 0; i < 10_000 && cpu.sleeping; i++) step = cpu.step();
    expect(step.wakeUp).toBe("watchdog");
    expect(flags(cpu)).toMatchObject({ TO: 0, PD: 0 });
    // 18 ms x 128 after reset (PSA = 1, PS = 111), counted from SLEEP's own cycle (it clears the WDT)
    expect(cpu.cycles).toBe(2_304_000);
    run(cpu, 1);
    expect(cpu.w).toBe(0x22);
  });

  it("stops in SLEEP when nothing can wake the CPU", () => {
    const cpu = load("        SLEEP");
    run(cpu, 1);
    expect(cpu.canWake).toBe(false);
  });

  it("an enabled RB0/INT wakes it even with GIE = 0, then it goes on after SLEEP", () => {
    const cpu = load("        BSF INTCON, INTE\n        SLEEP\n        MOVLW 0x33\n        GOTO $");
    run(cpu, 2);
    expect(cpu.canWake).toBe(true);
    cpu.memory.pins.setDrive("b", 0, 1);
    expect(cpu.step().wakeUp).toBe("interrupt");
    run(cpu, 1);
    expect(cpu.w).toBe(0x33);
    expect(cpu.pc).toBe(3); // no jump to 0x004: GIE = 0
  });

  it("the WDT resets a program that never runs CLRWDT (TO = 0, PD = 1)", () => {
    const cpu = load(
      "        BSF STATUS, RP0\n        MOVLW 0x08\n        MOVWF OPTION_REG\nloop    GOTO loop",
      "_WDT_ON",
    );
    let step!: StepResult;
    for (let i = 0; i < 20_000 && !step?.watchdogReset; i++) step = cpu.step();
    expect(step.watchdogReset).toBe(true);
    // PSA = 1, PS = 000: 18 ms = 18,000 cycles at 4 MHz; cycle 18,000 falls inside a 2-cycle GOTO
    expect(cpu.cycles).toBe(18_001);
    expect(cpu.pc).toBe(0);
    expect(flags(cpu)).toMatchObject({ TO: 0, PD: 1 });
  });

  it("CLRWDT keeps the WDT from timing out; _WDT_OFF turns it off", () => {
    const cleared = load(
      "        BSF STATUS, RP0\n        MOVLW 0x08\n        MOVWF OPTION_REG\nloop    CLRWDT\n        GOTO loop",
      "_WDT_ON",
    );
    const off = load(
      "        BSF STATUS, RP0\n        MOVLW 0x08\n        MOVWF OPTION_REG\nloop    GOTO loop",
    );
    for (let i = 0; i < 30_000; i++) {
      expect(cleared.step().watchdogReset).toBe(false);
      expect(off.step().watchdogReset).toBe(false);
    }
  });

  it("resets: power-on clears W and cycles; MCLR / WDT keep them and set TO / PD", () => {
    const cpu = load("        MOVLW 0x5A\n        MOVWF 0x20\n        SLEEP");
    run(cpu, 3);
    cpu.reset("mclr"); // during SLEEP
    expect([cpu.pc, cpu.w, ram(cpu, 0x20), cpu.sleeping]).toEqual([0, 0x5a, 0x5a, false]);
    expect(flags(cpu)).toMatchObject({ TO: 1, PD: 0 });
    expect(cpu.cycles).toBeGreaterThan(0);

    cpu.reset("wdt");
    expect(flags(cpu)).toMatchObject({ TO: 0, PD: 1 });

    cpu.reset();
    expect([cpu.w, cpu.cycles, ram(cpu, 0x20)]).toEqual([0, 0, 0]);
    expect(flags(cpu)).toMatchObject({ TO: 1, PD: 1 });
  });
});

describe("cpu: save / restore", () => {
  it("restoring a state and running on gives exactly the same steps", () => {
    const cpu = load(
      "        GOTO main\n        ORG 4\n        INCF 0x20, F\n        BCF INTCON, T0IF\n        RETFIE\nmain    BSF STATUS, RP0\n        MOVLW 0xD0\n        MOVWF OPTION_REG\n        BCF STATUS, RP0\n        MOVLW 0xA0\n        MOVWF INTCON\nloop    MOVF TMR0, W\n        GOTO loop",
    );
    run(cpu, 37);
    const saved = cpu.saveState();
    const trace = () =>
      Array.from({ length: 2000 }, () => {
        const s = cpu.step();
        return `${s.address} ${cpu.w} ${cpu.cycles} ${s.interrupt}`;
      });
    const first = trace();
    cpu.restoreState(saved);
    expect(trace()).toEqual(first);
    expect(ram(cpu, 0x20)).toBeGreaterThan(0); // interrupts did happen
  });
});
