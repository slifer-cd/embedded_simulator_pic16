import { describe, expect, it } from "vite-plus/test";
import { Memory } from "../src/simulator/memory.ts";

// Register access the way a program does it (instruction f + bank bit)
const STATUS = 0x03;
const EEDATA = 0x08; // bank 0
const EEADR = 0x09; // bank 0
const EECON1 = 0x08; // bank 1
const EECON2 = 0x09; // bank 1

const RD = 0x01;
const WR = 0x02;
const WREN = 0x04;
const WRERR = 0x08;
const EEIF = 0x10;

function bank(m: Memory, n: 0 | 1) {
  m.file[STATUS] = n ? m.file[STATUS] | 0x20 : m.file[STATUS] & ~0x20;
}

// The datasheet write sequence; "unlock" = false leaves out 0x55 / 0xAA
function startWrite(m: Memory, address: number, data: number, unlock = true) {
  bank(m, 0);
  m.write(EEADR, address);
  m.write(EEDATA, data);
  bank(m, 1);
  m.write(EECON1, WREN);
  if (unlock) {
    m.write(EECON2, 0x55);
    m.write(EECON2, 0xaa);
  }
  m.write(EECON1, WREN | WR);
}

const eecon1 = (m: Memory) => m.peek(0x88);

describe("eeprom: read", () => {
  it("copies the byte at EEADR into EEDATA at once, and RD clears itself", () => {
    const m = new Memory();
    m.eeprom[0x12] = 0xab;
    m.write(EEADR, 0x12);
    bank(m, 1);
    m.write(EECON1, RD);
    expect(m.peek(0x08)).toBe(0xab);
    expect(eecon1(m) & RD).toBe(0);
  });

  it("uses only 6 address bits (64 bytes)", () => {
    const m = new Memory();
    m.eeprom[0x05] = 0x5a;
    m.write(EEADR, 0x45);
    bank(m, 1);
    m.write(EECON1, RD);
    expect(m.peek(0x08)).toBe(0x5a);
  });
});

describe("eeprom: write", () => {
  it("writes after 4 ms, then clears WR and sets EEIF", () => {
    const m = new Memory();
    startWrite(m, 0x03, 0x99);
    expect(eecon1(m) & WR).toBe(WR);
    expect(m.eepromController.writing).toBe(true);

    expect(m.eepromController.tick(3999)).toBe(false);
    expect(m.eeprom[0x03]).toBe(0xff); // not yet
    expect(m.eepromController.tick(1)).toBe(true);
    expect(m.eeprom[0x03]).toBe(0x99);
    expect(eecon1(m) & (WR | EEIF)).toBe(EEIF);
  });

  it("does not start without the 0x55 / 0xAA unlock sequence", () => {
    const m = new Memory();
    startWrite(m, 0x03, 0x99, false);
    expect(eecon1(m) & WR).toBe(0);
    expect(m.eepromController.writing).toBe(false);
  });

  it("does not start with 0xAA before 0x55", () => {
    const m = new Memory();
    bank(m, 1);
    m.write(EECON1, WREN);
    m.write(EECON2, 0xaa);
    m.write(EECON2, 0x55);
    m.write(EECON1, WREN | WR);
    expect(m.eepromController.writing).toBe(false);
  });

  it("does not start when WREN = 0", () => {
    const m = new Memory();
    bank(m, 1);
    m.write(EECON2, 0x55);
    m.write(EECON2, 0xaa);
    m.write(EECON1, WR);
    expect(m.eepromController.writing).toBe(false);
  });

  it("needs the unlock sequence again for the next byte", () => {
    const m = new Memory();
    startWrite(m, 0, 1);
    m.eepromController.tick(4000);
    m.write(EECON1, WREN | WR); // no 0x55 / 0xAA this time
    expect(m.eepromController.writing).toBe(false);
  });

  it("keeps WR set while the program tries to clear it", () => {
    const m = new Memory();
    startWrite(m, 0, 1);
    m.write(EECON1, WREN);
    expect(eecon1(m) & WR).toBe(WR);
  });

  it("takes 4 ms at any clock", () => {
    const m = new Memory();
    m.clockHz = 20_000_000;
    startWrite(m, 0, 1);
    expect(m.eepromController.cyclesToDone()).toBe(20_000);
  });

  it("sets WRERR when a reset cuts the write off, and the byte is not written", () => {
    const m = new Memory();
    startWrite(m, 0x07, 0x42);
    m.reset("mclr");
    expect(m.eepromController.writing).toBe(false);
    expect(eecon1(m) & WRERR).toBe(WRERR);
    expect(m.eeprom[0x07]).toBe(0xff);
  });
});
