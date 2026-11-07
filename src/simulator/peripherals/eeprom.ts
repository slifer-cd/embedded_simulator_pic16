// Data EEPROM controller: reads and writes the 64-byte data EEPROM through
// EEADR, EEDATA, EECON1 and EECON2 (PIC16F84A datasheet, section 3).
//
// Read:   EEADR = address;  BSF EECON1, RD   -> EEDATA = EEPROM[EEADR] right away
//
// Write:  EEADR = address;  EEDATA = value
//         BSF  EECON1, WREN          ; enable writes
//         MOVLW 0x55 / MOVWF EECON2  ; unlock sequence,
//         MOVLW 0xAA / MOVWF EECON2  ; exactly in this order
//         BSF  EECON1, WR            ; start the write
//   The write takes about 4 ms. Then WR is cleared and EEIF is set.
//
// WR and RD can only be SET by the program; the hardware clears them.

import type { Memory } from "../memory.ts";

// EECON1 bits
const RD = 0;
const WR = 1;
const WREN = 2;
const EEIF = 4;

const EEADR = 0x09;
const EEDATA = 0x08;
const EECON1 = 0x88;

const EEPROM_MASK = 0x3f; // 64 bytes: EEADR wraps

// Write time: typical 4 ms (4000 cycles at 4 MHz, 20,000 at 20 MHz)
const WRITE_MS = 4;

// Hidden state of the controller (for saving / restoring the whole chip, see Cpu.saveState)
export type EepromControllerState = {
  unlock: number;
  cyclesLeft: number;
  pendingAddress: number;
  pendingData: number;
};

export class EepromController {
  private readonly memory: Memory;
  private unlock = 0; // 0 = locked, 1 = got 0x55, 2 = got 0xAA (WR may now be set)
  private cyclesLeft = 0; // > 0 while a write is in progress
  private pendingAddress = 0;
  private pendingData = 0;

  constructor(memory: Memory) {
    this.memory = memory;
  }

  // Any reset stops a write in progress (the byte is not written).
  // Returns true when a write was cut off, so the caller can set WRERR.
  reset(): boolean {
    const interrupted = this.writing;
    this.unlock = 0;
    this.cyclesLeft = 0;
    return interrupted;
  }

  // Fills "into" when given (no new objects: used by the history ring buffer)
  save(
    into: EepromControllerState = { unlock: 0, cyclesLeft: 0, pendingAddress: 0, pendingData: 0 },
  ): EepromControllerState {
    into.unlock = this.unlock;
    into.cyclesLeft = this.cyclesLeft;
    into.pendingAddress = this.pendingAddress;
    into.pendingData = this.pendingData;
    return into;
  }

  restore(state: EepromControllerState): void {
    ({
      unlock: this.unlock,
      cyclesLeft: this.cyclesLeft,
      pendingAddress: this.pendingAddress,
      pendingData: this.pendingData,
    } = state);
  }

  get writing(): boolean {
    return this.cyclesLeft > 0;
  }

  // Cycles until the write in progress finishes (Infinity when none is running)
  cyclesToDone(): number {
    return this.writing ? this.cyclesLeft : Infinity;
  }

  // The program wrote to EECON2 (it has no storage: it only drives the unlock sequence)
  writeEecon2(value: number): void {
    if (value === 0x55) this.unlock = 1;
    else if (value === 0xaa && this.unlock === 1) this.unlock = 2;
    else this.unlock = 0;
  }

  // The program wrote to EECON1. Returns the value EECON1 really gets.
  writeEecon1(oldValue: number, newValue: number): number {
    let value = newValue;

    // RD: setting it reads the byte at once; it never stays set
    if (newValue & (1 << RD)) {
      const address = this.memory.file[EEADR] & EEPROM_MASK;
      this.memory.file[EEDATA] = this.memory.eeprom[address];
    }
    value &= ~(1 << RD);

    // WR: cannot be cleared by the program while a write is running
    const wrWasSet = (oldValue >> WR) & 1;
    const wrRequested = (newValue >> WR) & 1;
    if (wrWasSet) {
      value |= 1 << WR;
    } else if (wrRequested) {
      const enabled = (newValue >> WREN) & 1;
      if (enabled && this.unlock === 2) {
        // Start the write: latch address and data now
        this.pendingAddress = this.memory.file[EEADR] & EEPROM_MASK;
        this.pendingData = this.memory.file[EEDATA];
        this.cyclesLeft = this.memory.cyclesFor(WRITE_MS);
      } else {
        value &= ~(1 << WR); // not unlocked or WREN = 0: the write does not start
      }
      this.unlock = 0; // the sequence must be repeated for every byte
    }

    return value;
  }

  // Let time pass. Returns true when a write finished during these cycles.
  tick(cycles: number): boolean {
    if (this.cyclesLeft <= 0) return false;
    this.cyclesLeft -= cycles;
    if (this.cyclesLeft > 0) return false;

    this.cyclesLeft = 0;
    this.memory.eeprom[this.pendingAddress] = this.pendingData;
    const eecon1 = this.memory.file[EECON1];
    this.memory.file[EECON1] = (eecon1 & ~(1 << WR)) | (1 << EEIF);
    return true;
  }
}
