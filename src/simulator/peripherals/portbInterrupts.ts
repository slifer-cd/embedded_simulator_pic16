// PORTB interrupt sources (PIC16F84A datasheet, sections 4.2 and 6.8).
//
// RB0/INT: an edge on the RB0 pin sets INTCON.INTF. OPTION_REG.INTEDG picks the edge
//   (1 = rising, 0 = falling). The flag is set whatever INTE / GIE are; INTE + GIE decide
//   whether it causes an interrupt (see Cpu.interruptPending). The program must clear INTF.
//
// The pin LEVEL is used (through pins.ts), so it works when the user drives RB0 and also
// when RB0 is an output and the program toggles it.
// The level is checked once per instruction: an edge is only seen at the next Step / Run tick.
//
// RB4-RB7 change: each read of PORTB by an instruction stores the RB7:RB4 levels. When
//   an INPUT pin among RB7:RB4 no longer matches the stored level, RBIF is set (outputs
//   are left out). The mismatch stays until the program reads PORTB again, so an
//   interrupt routine must read PORTB BEFORE clearing RBIF, or RBIF is set again at once.
//   Simplification: only instructions that really read PORTB here (MOVF, BTFSx,
//   read-modify-write like BSF / XORWF) store the levels; the real chip also reads
//   in MOVWF / CLRF.

import type { Memory } from "../memory.ts";

const PORTB = 0x06;
const TRISB = 0x86;
const OPTION_REG = 0x81;
const INTCON = 0x0b;

const RB0 = 0;
const RB7_RB4 = 0xf0;
const INTEDG = 6; // OPTION_REG
const INTF = 1; // INTCON
const RBIF = 0; // INTCON

// Hidden state (for saving / restoring the whole chip, see Cpu.saveState)
export type PortBInterruptsState = { lastRb0: number; latchedHigh: number };

export class PortBInterrupts {
  private readonly memory: Memory;
  private lastRb0 = 0; // RB0 pin level at the previous tick, to find edges
  private latchedHigh = 0; // RB7:RB4 levels at the last PORTB read (bits 7-4)

  constructor(memory: Memory) {
    this.memory = memory;
  }

  reset(): void {
    const levels = this.memory.peek(PORTB);
    this.lastRb0 = (levels >> RB0) & 1;
    this.latchedHigh = levels & RB7_RB4; // start without a mismatch
  }

  // Fills "into" when given (no new objects: used by the history ring buffer)
  save(into: PortBInterruptsState = { lastRb0: 0, latchedHigh: 0 }): PortBInterruptsState {
    into.lastRb0 = this.lastRb0;
    into.latchedHigh = this.latchedHigh;
    return into;
  }

  restore(state: PortBInterruptsState): void {
    ({ lastRb0: this.lastRb0, latchedHigh: this.latchedHigh } = state);
  }

  // An instruction read PORTB (called from Memory.read, not from the UI's peek)
  portbRead(levels: number): void {
    this.latchedHigh = levels & RB7_RB4;
  }

  // Called once per instruction (not during SLEEP yet: waking up comes with the watchdog work)
  tick(): void {
    const file = this.memory.file;
    const levels = this.memory.peek(PORTB);

    // RB0/INT edge
    const level = (levels >> RB0) & 1;
    const previous = this.lastRb0;
    this.lastRb0 = level;
    const rising = (file[OPTION_REG] >> INTEDG) & 1;
    const edge = rising ? previous === 0 && level === 1 : previous === 1 && level === 0;
    if (edge) file[INTCON] |= 1 << INTF;

    // RB7:RB4 change on input pins (TRISB bit = 1)
    const inputs = file[TRISB] & RB7_RB4;
    if ((levels ^ this.latchedHigh) & inputs) file[INTCON] |= 1 << RBIF;
  }
}
