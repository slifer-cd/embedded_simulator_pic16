import { describe, expect, it } from "vite-plus/test";
import { Memory } from "../src/simulator/memory.ts";

const STATUS = 0x03;
const FSR = 0x04;
const RP0 = 0x20;

// A fresh memory; bank 1 selected when asked
function memory(bank1 = false): Memory {
  const m = new Memory();
  if (bank1) m.file[STATUS] |= RP0;
  return m;
}

describe("memory: reset values", () => {
  it("gives the special registers their power-on values", () => {
    const m = memory();
    expect(m.peek(STATUS)).toBe(0x18); // TO = PD = 1
    expect(m.peek(0x81)).toBe(0xff); // OPTION_REG
    expect(m.peek(0x85)).toBe(0x1f); // TRISA
    expect(m.peek(0x86)).toBe(0xff); // TRISB
    expect(m.peek(0x02)).toBe(0); // PCL
  });

  it("starts with blank flash (0x3FFF) and erased EEPROM (0xFF)", () => {
    const m = memory();
    expect(m.program[0]).toBe(0x3fff);
    expect(m.eeprom[63]).toBe(0xff);
  });
});

describe("memory: banks and mirrors", () => {
  it("reaches the same RAM byte from both banks", () => {
    const m = memory();
    m.write(0x20, 0x55);
    m.file[STATUS] |= RP0;
    expect(m.read(0x20)).toBe(0x55); // 0xA0 is the same byte as 0x20
  });

  it("mirrors STATUS, PCL, FSR, PCLATH and INTCON in both banks", () => {
    const m = memory(true);
    m.write(0x0b, 0x90); // INTCON from bank 1
    expect(m.peek(0x0b)).toBe(0x90);
    expect(m.peek(0x8b)).toBe(0x90);
  });

  it("keeps TMR0 / OPTION_REG and PORTB / TRISB apart", () => {
    const m = memory(true);
    m.write(0x01, 0x07); // bank 1: OPTION_REG
    expect(m.peek(0x81)).toBe(0x07);
    expect(m.peek(0x01)).toBe(0x00); // TMR0 untouched
    m.write(0x06, 0x00); // TRISB
    expect(m.peek(0x86)).toBe(0x00);
  });

  it("reads unimplemented addresses as 0 and ignores writes to them", () => {
    const m = memory();
    m.write(0x07, 0xff);
    m.write(0x50, 0xff);
    expect(m.read(0x07)).toBe(0);
    expect(m.read(0x50)).toBe(0);
  });
});

describe("memory: indirect addressing", () => {
  it("INDF reaches the address in FSR, with all 8 bits", () => {
    const m = memory();
    m.write(FSR, 0xa1); // bank 1 view of RAM 0x21
    m.write(0x00, 0x42);
    expect(m.peek(0x21)).toBe(0x42);
    expect(m.read(0x00)).toBe(0x42);
  });

  it("INDF through FSR = 0 (INDF itself) reads 0", () => {
    const m = memory();
    m.write(FSR, 0x00);
    expect(m.read(0x00)).toBe(0);
  });
});

describe("memory: bits that can't be written", () => {
  it("keeps STATUS.TO / PD when an instruction writes STATUS", () => {
    const m = memory();
    m.write(STATUS, 0x00);
    expect(m.peek(STATUS)).toBe(0x18);
    m.poke(STATUS, 0x00); // the CPU itself can change them
    expect(m.peek(STATUS)).toBe(0x00);
  });

  it("keeps only the implemented bits of PCLATH, TRISA, PORTA and EECON1", () => {
    const m = memory();
    m.write(0x0a, 0xff);
    expect(m.peek(0x0a)).toBe(0x1f);
    m.file[STATUS] |= RP0;
    m.write(0x05, 0xff); // TRISA
    expect(m.peek(0x85)).toBe(0x1f);
  });
});

describe("memory: ports", () => {
  it("reads PORTB as pin levels, while the latch is kept in file[]", () => {
    const m = memory();
    m.write(0x06, 0xff); // latch, but the pins are inputs
    m.pins.setDrive("b", 3, 1);
    expect(m.read(0x06)).toBe(0x08);
    expect(m.file[0x06]).toBe(0xff);
  });
});

describe("memory: resets", () => {
  it("power-on clears RAM; MCLR / WDT keep it and reset only some registers", () => {
    const m = memory();
    m.file[0x20] = 0x77;
    m.file[0x01] = 0x33; // TMR0
    m.file[0x0a] = 0x03; // PCLATH
    m.file[0x0b] = 0xff; // INTCON
    m.file[0x86] = 0x00; // TRISB
    m.file[STATUS] = 0x20 | 0x18 | 0x07; // RP0, TO, PD, Z DC C

    m.reset("mclr");
    expect(m.file[0x20]).toBe(0x77);
    expect(m.file[0x01]).toBe(0x33);
    expect(m.file[0x0a]).toBe(0x00);
    expect(m.file[0x0b]).toBe(0x01); // only RBIF kept
    expect(m.file[0x86]).toBe(0xff);
    expect(m.file[STATUS]).toBe(0x1f); // bank 0, the rest kept (the CPU sets TO / PD)

    m.reset();
    expect(m.file[0x20]).toBe(0);
  });
});

describe("memory: save / restore and the clock", () => {
  it("restores data memory, EEPROM and the pin drives", () => {
    const m = memory();
    m.file[0x30] = 1;
    m.pins.setDrive("a", 0, 1);
    const saved = m.save();
    m.file[0x30] = 2;
    m.eeprom[5] = 0;
    m.pins.setDrive("a", 0, null);
    m.restore(saved);
    expect(m.file[0x30]).toBe(1);
    expect(m.eeprom[5]).toBe(0xff);
    expect(m.pins.drives.a[0]).toBe(1);
  });

  it("turns milliseconds into instruction cycles at the clock", () => {
    const m = memory();
    expect(m.cyclesFor(4)).toBe(4000); // 4 MHz: 1 µs per cycle
    m.clockHz = 20_000_000;
    expect(m.cyclesFor(4)).toBe(20_000);
    m.clockHz = 32_768;
    expect(m.cyclesFor(4)).toBe(33);
  });
});
