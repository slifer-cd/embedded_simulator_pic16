// Watchdog timer (WDT), PIC16F84A datasheet section 6.8.
//
// The WDT has its own RC oscillator, so it keeps running in SLEEP. It is switched on
// by the WDTE bit of the configuration word (on by default: 0x3FFF), not by the program.
//
// Timeout period: 18 ms nominal (7-33 ms on a real chip, it depends on temperature and
// voltage). With OPTION_REG.PSA = 1 the prescaler is assigned to the WDT as a postscaler:
// the period is 18 ms x 2^(PS2:0) (1:1 ... 1:128, up to ~2.3 s).
// After any reset OPTION_REG = 0xFF: PSA = 1, 1:128, so the default timeout is ~2.3 s.
//
// A timeout during normal operation resets the chip (WDT reset, TO = 0); in SLEEP it
// wakes the chip up instead (TO = 0, PD = 0). The CPU decides which (see cpu.ts).
// CLRWDT and SLEEP clear the WDT and its postscaler; so does any reset.
//
// Simplification: the WDT postscaler and the Timer0 prescaler are kept as two counters;
// on the chip they are one counter, which matters only when PSA is switched while counting.

import type { Memory } from "../memory.ts";

const OPTION_REG = 0x81;
const PSA = 3;
const PS_MASK = 0x07;

// 18 ms at 4 MHz (1 µs per cycle). The clock selector (TODO #6) will compute this.
const PERIOD_CYCLES = 18_000;

export class Watchdog {
  private readonly memory: Memory;
  enabled = true; // configuration word WDTE (set by Memory.load)
  private count = 0; // cycles since the WDT was last cleared
  private postscaler = 0; // WDT periods counted toward a timeout (when PSA = 1)

  constructor(memory: Memory) {
    this.memory = memory;
  }

  // CLRWDT, SLEEP and any reset
  clear(): void {
    this.count = 0;
    this.postscaler = 0;
  }

  // Cycles until the next timeout (Infinity when the WDT is off)
  cyclesToTimeout(): number {
    if (!this.enabled) return Infinity;
    const option = this.memory.file[OPTION_REG];
    const ratio = (option >> PSA) & 1 ? 1 << (option & PS_MASK) : 1;
    const left = (ratio - this.postscaler - 1) * PERIOD_CYCLES + (PERIOD_CYCLES - this.count);
    return Math.max(1, left); // PS made smaller while counting: times out at the next period
  }

  // Let time pass, also in SLEEP. Returns true when the WDT timed out.
  tick(cycles: number): boolean {
    if (!this.enabled) return false;
    this.count += cycles;
    if (this.count < PERIOD_CYCLES) return false;
    this.count -= PERIOD_CYCLES;

    const option = this.memory.file[OPTION_REG];
    const ratio = (option >> PSA) & 1 ? 1 << (option & PS_MASK) : 1; // PS = 0 -> 1:1, 7 -> 1:128
    this.postscaler += 1;
    if (this.postscaler < ratio) return false;
    this.postscaler = 0;
    return true;
  }
}
