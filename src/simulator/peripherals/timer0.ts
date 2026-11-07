// Timer0: the 8-bit timer/counter TMR0 (PIC16F84A datasheet, section 5).
//
// Clock source: OPTION_REG.T0CS
//   0 = internal instruction clock (Fosc/4: one tick per instruction cycle)
//   1 = external clock: edges on the RA4/T0CKI pin; OPTION_REG.T0SE picks the edge
//       (0 = rising, 1 = falling)
//
// Prescaler: OPTION_REG.PSA
//   0 = assigned to Timer0: TMR0 counts every 2^(PS2:0 + 1) cycles / edges (1:2 ... 1:256)
//   1 = assigned to the watchdog: TMR0 counts every cycle / edge (1:1)
//
// Overflow (0xFF -> 0x00) sets INTCON.T0IF.
//
// Watch out: after reset OPTION_REG = 0xFF, so T0CS = 1 (external clock) and the
// program must clear T0CS before Timer0 counts instruction cycles.
//
// A write to TMR0 (MOVWF, CLRF, BSF, ...) clears the prescaler (if assigned to Timer0)
// and stops counting for 2 cycles: the next two instructions that read TMR0 see the
// value that was written (datasheet Figure 5-2).
//
// External clock: the RA4 pin level is checked once per instruction (it only changes
// between instructions, when the user drives the pin, or when the instruction writes
// PORTA: with RA4 as an output the program can clock Timer0 itself). The real chip
// delays an edge by ~2 oscillator periods to synchronize it; that is not simulated.
//
// Not simulated yet: the prescaler being shared with the watchdog.

import type { Memory } from "../memory.ts";

const TMR0 = 0x01;
const PORTA = 0x05;
const OPTION_REG = 0x81;
const INTCON = 0x0b;

const RA4 = 4;

// OPTION_REG bits
const T0CS = 5;
const T0SE = 4;
const PSA = 3;
const PS_MASK = 0x07;

// INTCON bits
const T0IF = 2;

export class Timer0 {
  private readonly memory: Memory;
  private prescaler = 0; // cycles / edges counted toward the next TMR0 increment (not readable)
  private inhibit = 0; // cycles left during which TMR0 does not count (after a write)
  private lastRa4 = 0; // RA4 pin level at the previous tick, to find edges

  constructor(memory: Memory) {
    this.memory = memory;
  }

  reset(): void {
    this.prescaler = 0;
    this.inhibit = 0;
    this.lastRa4 = this.ra4();
  }

  // The program wrote TMR0 (the value is already stored).
  // tick() runs after the instruction, so the 2 cycles include the writing instruction's
  // own cycle: that gives the datasheet timing (the next 2 reads see the written value).
  written(): void {
    if (((this.memory.file[OPTION_REG] >> PSA) & 1) === 0) this.prescaler = 0;
    this.inhibit = 2;
  }

  // Let instruction cycles pass (not called during SLEEP: the synchronizer needs the
  // instruction clock, so on the PIC16F84A Timer0 stops even with an external clock).
  tick(cycles: number): void {
    const option = this.memory.file[OPTION_REG];

    // Track RA4 in both modes, so switching to the external clock doesn't see a stale level
    const level = this.ra4();
    const previous = this.lastRa4;
    this.lastRa4 = level;

    if ((option >> T0CS) & 1) {
      // External clock: one count on the selected edge (an edge during the pause is lost)
      if (this.inhibit > 0) {
        this.inhibit = Math.max(0, this.inhibit - cycles);
        return;
      }
      const falling = (option >> T0SE) & 1;
      const edge = falling ? previous === 1 && level === 0 : previous === 0 && level === 1;
      if (edge) this.count(option);
      return;
    }

    // Internal clock: one cycle at a time, so a 2-cycle instruction can cross a prescaler step
    for (let i = 0; i < cycles; i++) {
      if (this.inhibit > 0) {
        this.inhibit -= 1; // just written: neither TMR0 nor the prescaler counts
        continue;
      }
      this.count(option);
    }
  }

  // One clock (cycle or edge) into Timer0: through the prescaler, then TMR0
  private count(option: number): void {
    if (((option >> PSA) & 1) === 0) {
      const ratio = 2 << (option & PS_MASK); // PS = 0 -> 1:2, PS = 7 -> 1:256
      this.prescaler += 1;
      if (this.prescaler < ratio) return;
      this.prescaler = 0;
    }

    const file = this.memory.file;
    const next = (file[TMR0] + 1) & 0xff;
    file[TMR0] = next;
    if (next === 0) file[INTCON] |= 1 << T0IF;
  }

  // RA4/T0CKI pin level (through pins.ts: external drive, open-drain output)
  private ra4(): number {
    return (this.memory.peek(PORTA) >> RA4) & 1;
  }
}
