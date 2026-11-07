import { describe, expect, it } from "vite-plus/test";
import { Pins, pinStates, portLevels } from "../src/simulator/pins.ts";
import type { Drive, PinDrives } from "../src/simulator/pins.ts";

const PORTA = 0x05;
const PORTB = 0x06;
const OPTION_REG = 0x81;
const TRISA = 0x85;
const TRISB = 0x86;

// Data memory after reset: all pins inputs, PORTB pull-ups off (OPTION = 0xFF)
function memory(changes: Record<number, number> = {}): Uint8Array {
  const file = new Uint8Array(256);
  file[TRISA] = 0x1f;
  file[TRISB] = 0xff;
  file[OPTION_REG] = 0xff;
  for (const [address, value] of Object.entries(changes)) file[Number(address)] = value;
  return file;
}

function drives(a: Drive[] = [], b: Drive[] = []): PinDrives {
  const fill = (list: Drive[], n: number) => Array.from({ length: n }, (_, i) => list[i] ?? null);
  return { a: fill(a, 5), b: fill(b, 8) };
}

const pin = (file: Uint8Array, d: PinDrives, name: string) =>
  pinStates(file, d).find((p) => p.name === name)!;

describe("pins: inputs", () => {
  it("read what the outside world drives", () => {
    const d = drives([1], [0, 1]);
    expect(pin(memory(), d, "RA0")).toMatchObject({ output: false, level: 1, floating: false });
    expect(pin(memory(), d, "RB0").level).toBe(0);
    expect(pin(memory(), d, "RB1").level).toBe(1);
  });

  it("float (read 0) when nothing is connected", () => {
    expect(pin(memory(), drives(), "RB3")).toMatchObject({ level: 0, floating: true });
  });

  it("on PORTB are pulled up to 1 when NOT_RBPU = 0", () => {
    const file = memory({ [OPTION_REG]: 0x7f });
    expect(pin(file, drives(), "RB5")).toMatchObject({ level: 1, floating: false, pullUp: true });
    expect(pin(file, drives([], [0]), "RB0").level).toBe(0); // a drive wins over the pull-up
    expect(pin(file, drives(), "RA0").floating).toBe(true); // PORTA has no pull-ups
  });
});

describe("pins: outputs", () => {
  it("show the output latch and ignore the outside world", () => {
    const file = memory({ [TRISB]: 0x00, [PORTB]: 0b10 });
    expect(pin(file, drives([], [1, 0]), "RB0")).toMatchObject({ output: true, level: 0 });
    expect(pin(file, drives([], [1, 0]), "RB1").level).toBe(1);
  });

  it("RA4 is open drain: latch 0 pulls low, latch 1 lets the pin float", () => {
    const low = memory({ [TRISA]: 0x00, [PORTA]: 0x00 });
    expect(pin(low, drives([0, 0, 0, 0, 1]), "RA4")).toMatchObject({ level: 0, floating: false });

    const released = memory({ [TRISA]: 0x00, [PORTA]: 0x10 });
    expect(pin(released, drives(), "RA4")).toMatchObject({ level: 0, floating: true });
    expect(pin(released, drives([0, 0, 0, 0, 1]), "RA4").level).toBe(1); // pulled up outside
    expect(pin(memory({ [TRISA]: 0x00, [PORTA]: 0x01 }), drives(), "RA0").level).toBe(1); // RA0 isn't
  });
});

describe("pins: port levels and the Pins class", () => {
  it("combine the pin levels into PORTA / PORTB values", () => {
    // RB0-RB3 inputs (driven 1 0 1 0), RB4-RB7 outputs from the latch 0x50 (RB7's drive ignored)
    const file = memory({ [TRISB]: 0x0f, [PORTB]: 0x50 });
    expect(portLevels(file, drives([1, 0, 1], [1, 0, 1, 0, 0, 0, 0, 1]))).toEqual({
      a: 0b00101,
      b: 0b01010101,
    });
  });

  it("counts every drive change in version, and copies drives independently", () => {
    const pins = new Pins();
    const before = pins.version;
    pins.setDrive("b", 2, 1);
    expect(pins.version).toBe(before + 1);

    const copy = pins.copyDrives();
    pins.setDrive("b", 2, 0);
    expect(copy.b[2]).toBe(1);

    pins.restoreDrives(copy);
    expect(pins.drives.b[2]).toBe(1);
    expect(pins.version).toBe(before + 3);
  });
});
