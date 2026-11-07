// I/O pins: PORTA (RA0-RA4) and PORTB (RB0-RB7).
//
// - Writing PORTx goes to the output LATCH (stored in data memory).
// - Reading PORTx returns the real PIN LEVELS (computed here).
// - Output pin (TRIS bit = 0): level = latch bit.
// - Input pin  (TRIS bit = 1): level = what the outside world drives ("drive").
//   Nothing connected = floating: reads 0 here, except PORTB with weak pull-ups on
//   (OPTION_REG.NOT_RBPU = 0), which pull inputs up to 1.
// - RA4 is open-drain: as an output it can only pull LOW; latch 1 = floating.

export type Drive = 0 | 1 | null; // external level on a pin, null = nothing connected

export type PinDrives = { a: Drive[]; b: Drive[] };

export type PinState = {
  name: string; // "RB0"
  label: string; // "RB0/INT"
  number: number; // pin number on the 18-pin package
  port: "a" | "b";
  bit: number;
  output: boolean; // TRIS bit = 0
  latch: number; // output latch bit
  level: number; // what the program reads (0 / 1)
  floating: boolean; // nothing drives the pin (level is not really defined)
  pullUp: boolean; // PORTB weak pull-up is active on this pin
  drive: Drive; // external drive set by the user
};

const PORTA = 0x05;
const PORTB = 0x06;
const TRISA = 0x85;
const TRISB = 0x86;
const OPTION_REG = 0x81;
const NOT_RBPU = 7;

// Pin numbers and full names on the PIC16F84A 18-pin package
const PINS_A = [
  { name: "RA0", label: "RA0", number: 17 },
  { name: "RA1", label: "RA1", number: 18 },
  { name: "RA2", label: "RA2", number: 1 },
  { name: "RA3", label: "RA3", number: 2 },
  { name: "RA4", label: "RA4/T0CKI", number: 3 },
];
const PINS_B = [
  { name: "RB0", label: "RB0/INT", number: 6 },
  { name: "RB1", label: "RB1", number: 7 },
  { name: "RB2", label: "RB2", number: 8 },
  { name: "RB3", label: "RB3", number: 9 },
  { name: "RB4", label: "RB4", number: 10 },
  { name: "RB5", label: "RB5", number: 11 },
  { name: "RB6", label: "RB6", number: 12 },
  { name: "RB7", label: "RB7", number: 13 },
];

// State of every pin, computed from data memory (latches, TRIS, OPTION) and the external drives
export function pinStates(file: ArrayLike<number>, drives: PinDrives): PinState[] {
  const pullUpsOn = ((file[OPTION_REG] >> NOT_RBPU) & 1) === 0;
  const states: PinState[] = [];

  PINS_A.forEach((pin, bit) => {
    const output = ((file[TRISA] >> bit) & 1) === 0;
    const latch = (file[PORTA] >> bit) & 1;
    const drive = drives.a[bit];
    // RA4 open-drain: as an output it only drives low
    const drivenByChip = output && !(bit === 4 && latch === 1);
    const floating = !drivenByChip && drive === null;
    const level = drivenByChip ? latch : (drive ?? 0);
    states.push({ ...pin, port: "a", bit, output, latch, level, floating, pullUp: false, drive });
  });

  PINS_B.forEach((pin, bit) => {
    const output = ((file[TRISB] >> bit) & 1) === 0;
    const latch = (file[PORTB] >> bit) & 1;
    const drive = drives.b[bit];
    const pullUp = !output && pullUpsOn;
    const floating = !output && drive === null && !pullUp;
    const level = output ? latch : (drive ?? (pullUp ? 1 : 0));
    states.push({ ...pin, port: "b", bit, output, latch, level, floating, pullUp, drive });
  });

  return states;
}

// What reading PORTA / PORTB returns
export function portLevels(file: ArrayLike<number>, drives: PinDrives): { a: number; b: number } {
  let a = 0;
  let b = 0;
  for (const pin of pinStates(file, drives)) {
    if (pin.port === "a") a |= pin.level << pin.bit;
    else b |= pin.level << pin.bit;
  }
  return { a, b };
}

// External drives set by the user (the "outside world"). They stay across a CPU reset.
export class Pins {
  readonly drives: PinDrives = {
    a: Array.from({ length: 5 }, () => null),
    b: Array.from({ length: 8 }, () => null),
  };

  setDrive(port: "a" | "b", bit: number, drive: Drive): void {
    this.drives[port][bit] = drive;
  }

  // Fills "into" when given (no new arrays: used by the history ring buffer)
  copyDrives(into?: PinDrives): PinDrives {
    if (!into) return { a: [...this.drives.a], b: [...this.drives.b] };
    for (let i = 0; i < this.drives.a.length; i++) into.a[i] = this.drives.a[i];
    for (let i = 0; i < this.drives.b.length; i++) into.b[i] = this.drives.b[i];
    return into;
  }

  restoreDrives(drives: PinDrives): void {
    for (let i = 0; i < drives.a.length; i++) this.drives.a[i] = drives.a[i];
    for (let i = 0; i < drives.b.length; i++) this.drives.b[i] = drives.b[i];
  }
}
