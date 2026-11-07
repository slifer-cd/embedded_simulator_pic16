// Simulator memory: program flash, data memory (RAM + special registers) and data EEPROM.
//
// Data memory has 256 addresses (0x00-0xFF) but far fewer physical locations:
//   - 68 RAM bytes at 0x0C-0x4F, also reachable at 0x8C-0xCF (same bytes)
//   - special registers; some reachable from both banks (STATUS at 0x03 and 0x83)
//   - unimplemented addresses: read as 0, writes are ignored
//
// Every address is first turned into its "canonical" address (the bank 0 address
// for things reachable from both banks), and the value lives at file[canonical].

import { decodeConfig, MEMORY } from "../chip/config.ts";
import { GPR_END, GPR_START, REGISTER_BY_NAME, REGISTERS } from "../chip/registers.ts";
import { EepromController } from "./peripherals/eeprom.ts";
import { PortBInterrupts } from "./peripherals/portbInterrupts.ts";
import { Timer0 } from "./peripherals/timer0.ts";
import { Watchdog } from "./peripherals/watchdog.ts";
import { Pins, portLevels } from "./pins.ts";

const address = (name: string) => REGISTER_BY_NAME.get(name)!.address;

export const INDF = address("INDF");
export const PCL = address("PCL");
const TMR0 = address("TMR0");
export const STATUS = address("STATUS");
export const FSR = address("FSR");
export const PCLATH = address("PCLATH");
const EECON1 = address("EECON1");
const INTCON = address("INTCON");
const PORTA = address("PORTA");
const PORTB = address("PORTB");
const EECON2 = address("EECON2");

const RP0_BIT = 5;

// canonical[address] = where the value is stored, or null if nothing is there
const canonical: (number | null)[] = Array.from({ length: 256 }, () => null);
for (const reg of REGISTERS) {
  canonical[reg.address] = reg.address;
  if (reg.mirrored) canonical[reg.address | 0x80] = reg.address;
}
for (let a = GPR_START; a <= GPR_END; a++) {
  canonical[a] = a;
  canonical[a | 0x80] = a;
}

// Registers with fewer than 8 bits: unimplemented bits always read as 0
const IMPLEMENTED_BITS = new Map<number, number>([
  [address("PORTA"), 0x1f],
  [address("TRISA"), 0x1f],
  [PCLATH, 0x1f],
  [address("EECON1"), 0x1f],
]);

// Bits that instructions cannot change (STATUS: NOT_TO, NOT_PD)
const READ_ONLY_BITS = new Map<number, number>([[STATUS, 0x18]]);

// The ways the chip can be reset (datasheet section 6.3).
//   power-on: the power is switched on (here: Assemble / the Reset button)
//   mclr:     the MCLR pin is pulled low
//   wdt:      the watchdog timed out during normal operation (in SLEEP it wakes up instead)
export type ResetKind = "power-on" | "mclr" | "wdt";

// MCLR / WDT reset: these registers get their power-on value again;
// all others (TMR0, FSR, PORTA/PORTB latches, EEDATA, EEADR, RAM) keep their value.
const RESET_AGAIN = ["PCL", "PCLATH", "OPTION_REG", "TRISA", "TRISB"].map((name) =>
  REGISTER_BY_NAME.get(name)!,
);

const WRERR_BIT = 3; // EECON1: a write was cut off by a reset
const RBIF_BIT = 0; // INTCON

export class Memory {
  readonly program = new Uint16Array(MEMORY.PROGRAM_SIZE); // flash, 14-bit words
  readonly eeprom = new Uint8Array(MEMORY.EEPROM_SIZE); // data EEPROM
  readonly file = new Uint8Array(256); // data memory, indexed by canonical address
  readonly eepromController = new EepromController(this); // EECON1 / EECON2 behaviour
  readonly timer0 = new Timer0(this); // TMR0 counting and prescaler
  readonly portbInterrupts = new PortBInterrupts(this); // RB0/INT edge, RB7:RB4 change
  readonly watchdog = new Watchdog(this); // WDT timeout (on/off from the config word)
  readonly pins = new Pins(); // external pin drives (the outside world)

  constructor() {
    this.program.fill(MEMORY.WORD_MASK); // blank flash = 0x3FFF
    this.eeprom.fill(0xff); // erased EEPROM = 0xFF
    this.reset();
  }

  // Load an assembled program (from AssemblyResult.program / .eeprom / .config)
  load(program: number[], eeprom: number[], config: number): void {
    this.program.set(program.map((word) => word & MEMORY.WORD_MASK));
    this.eeprom.set(eeprom.map((byte) => byte & 0xff));
    this.watchdog.enabled = decodeConfig(config).watchdog;
  }

  // Reset the data memory and the peripherals (datasheet Table 6-4).
  // STATUS.NOT_TO / NOT_PD depend on the reset and on SLEEP: the CPU sets them.
  reset(kind: ResetKind = "power-on"): void {
    const writeCutOff = this.eepromController.reset();

    if (kind === "power-on") {
      // Every register gets its reset value, RAM is cleared.
      // (On the real chip RAM is unknown after power-on; 0 keeps the simulation repeatable.)
      this.file.fill(0);
      for (const reg of REGISTERS) this.file[reg.address] = reg.resetValue;
    } else {
      const file = this.file;
      for (const reg of RESET_AGAIN) file[reg.address] = reg.resetValue;
      file[STATUS] &= 0x1f; // IRP, RP1, RP0 = 0 (bank 0); TO, PD, Z, DC, C kept
      file[INTCON] &= 1 << RBIF_BIT; // all 0 except RBIF
      // EECON1: only WRERR is kept, and it is set when the reset cut off a write
      const wrerr = writeCutOff ? 1 << WRERR_BIT : file[EECON1] & (1 << WRERR_BIT);
      file[EECON1] = wrerr;
    }

    this.timer0.reset(); // also clears the prescaler
    this.portbInterrupts.reset();
    this.watchdog.clear();
  }

  // ---------- Addressing ----------

  // Selected bank (STATUS.RP0). RP1 is unused on the PIC16F84A.
  get bank(): number {
    return (this.file[STATUS] >> RP0_BIT) & 1;
  }

  // The 8-bit address an instruction's 7-bit f really accesses:
  //   direct:   RP0 + f
  //   indirect: f = INDF (0x00) -> the address in FSR (all 8 bits, RP0 not used)
  effectiveAddress(f: number): number {
    const direct = (this.bank << 7) | (f & 0x7f);
    return canonical[direct] === INDF ? this.file[FSR] : direct;
  }

  // Canonical address an instruction's f writes to, or null (unimplemented / INDF -> INDF).
  // The CPU uses it to notice writes to PCL (which change the program counter).
  target(f: number): number | null {
    const resolved = canonical[this.effectiveAddress(f)];
    return resolved === INDF ? null : resolved;
  }

  // ---------- Instruction access (f = 7 bits from the instruction) ----------

  read(f: number): number {
    const address8 = this.effectiveAddress(f);
    const value = this.peek(address8);
    // Reading PORTB stores the RB7:RB4 levels for the change interrupt (see portbInterrupts.ts)
    if (canonical[address8] === PORTB) this.portbInterrupts.portbRead(value);
    return value;
  }

  write(f: number, value: number): void {
    const where = this.target(f);
    if (where === null) return;

    // EEPROM control registers have special behaviour (see peripherals/eeprom.ts)
    if (where === EECON2) {
      this.eepromController.writeEecon2(value & 0xff); // no storage: unlock sequence only
      return;
    }
    if (where === EECON1) {
      const old = this.file[EECON1];
      this.file[EECON1] = this.eepromController.writeEecon1(old, value & 0xff) & 0x1f;
      return;
    }

    const readOnly = READ_ONLY_BITS.get(where) ?? 0;
    const merged = (value & ~readOnly) | (this.file[where] & readOnly);
    this.file[where] = merged & (IMPLEMENTED_BITS.get(where) ?? 0xff);

    // A write to TMR0 clears the prescaler and pauses Timer0 (see peripherals/timer0.ts)
    if (where === TMR0) this.timer0.written();
  }

  // ---------- Direct access by full 8-bit address (UI and CPU internals) ----------

  // Read without INDF redirection. Unimplemented addresses, INDF and EECON2 read as 0.
  // PORTA / PORTB return the pin levels; their output latches stay in file[] (see pins.ts).
  peek(address8: number): number {
    const where = canonical[address8 & 0xff];
    if (where === null || where === INDF || where === EECON2) return 0;
    if (where === PORTA) return portLevels(this.file, this.pins.drives).a;
    if (where === PORTB) return portLevels(this.file, this.pins.drives).b;
    return this.file[where];
  }

  // Write without INDF redirection or read-only bits (e.g. the CPU setting NOT_TO / NOT_PD).
  poke(address8: number, value: number): void {
    const where = canonical[address8 & 0xff];
    if (where === null || where === INDF || where === EECON2) return;
    this.file[where] = value & 0xff & (IMPLEMENTED_BITS.get(where) ?? 0xff);
  }
}
