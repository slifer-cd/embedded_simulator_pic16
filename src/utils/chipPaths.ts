// Which buses of the block diagram (ChipView) the last step used, so they can light up.
//
// Worked out from the instruction and its operands, the way the datasheet describes them:
//   fetch:        PC -> Flash -> Program Bus -> Instruction Register
//   read f:       Direct (or Indirect via FSR) Addr -> Addr Mux -> RAM -> Data Bus -> MUX -> ALU
//   literal k:    Instruction Register -> MUX -> ALU
//   W as input:   W -> ALU
//   result to W:  ALU -> W
//   result to f:  ALU -> Data Bus -> the register
//   CALL / RETURN / interrupt: PC <-> Stack
// "f" is resolved to the register it really means (bank from RP0, INDF -> FSR), so e.g.
// MOVWF FSR lights the FSR bus, not the RAM bus. It's a picture of the data flow, not a
// cycle-exact model of the chip's internal timing.

import { decodeInstruction } from "../chip/instructions.ts";
import type { CpuSnapshot } from "../simulator/cpu.ts";
import { STEP_EVENT } from "../simulator/history.ts";
import type { HistoryEntry } from "../simulator/history.ts";

export type BusId =
  | "pc-flash"
  | "program-bus"
  | "pc-stack"
  | "databus" // the trunk
  | "databus-pc" // branch to the PC (PCL / PCLATH)
  | "databus-io" // branch to the I/O ports (PORTA / PORTB / TRISA / TRISB)
  | "databus-ram"
  | "direct-addr"
  | "indirect-addr"
  | "ram-addr"
  | "databus-fsr"
  | "databus-status" // the line from the data bus to STATUS and TMR0
  | "eedata"
  | "eeadr"
  | "eedata-eeprom"
  | "eeadr-eeprom"
  | "literal"
  | "databus-mux"
  | "mux-alu"
  | "w-alu"
  | "alu-w"
  | "alu-databus";

const STATUS = 0x03;
const FSR = 0x04;
const EEDATA = 0x08;

// Byte instructions with a destination bit d (0 = W, 1 = f)
const F_TO_D = new Set([
  "ADDWF",
  "ANDWF",
  "COMF",
  "DECF",
  "DECFSZ",
  "INCF",
  "INCFSZ",
  "IORWF",
  "MOVF",
  "RLF",
  "RRF",
  "SUBWF",
  "SWAPF",
  "XORWF",
]);
const READ_F = new Set([...F_TO_D, "BCF", "BSF", "BTFSC", "BTFSS"]);
const WRITE_F = new Set(["MOVWF", "CLRF", "BCF", "BSF"]); // always write f
const W_IN = new Set(["ADDWF", "ANDWF", "IORWF", "SUBWF", "XORWF", "MOVWF"]);
const LITERAL = new Set(["MOVLW", "ADDLW", "ANDLW", "IORLW", "SUBLW", "XORLW", "RETLW"]);
const LITERAL_W_IN = new Set(["ADDLW", "ANDLW", "IORLW", "SUBLW", "XORLW"]);
const STACK = new Set(["CALL", "RETURN", "RETLW", "RETFIE"]);

// The buses between the data bus and register f (also the address path for RAM)
function registerPath(f: number, before: CpuSnapshot): BusId[] {
  const indirect = f === 0; // INDF: the address is in FSR
  const address = indirect ? before.file[FSR] : (((before.file[STATUS] >> 5) & 1) << 7) | f;
  const low = address & 0x7f;
  const bank1 = address >= 0x80;

  if (low >= 0x0c && low <= 0x4f) {
    return ["databus-ram", indirect ? "indirect-addr" : "direct-addr", "ram-addr"];
  }
  if (low === STATUS || (low === 0x01 && !bank1)) return ["databus-status"]; // STATUS, TMR0
  if (low === FSR) return ["databus-fsr"];
  if (low === EEDATA && !bank1) return ["eedata"];
  if (low === 0x09 && !bank1) return ["eeadr"];
  if (low === 0x02 || low === 0x0a) return ["databus-pc"]; // PCL, PCLATH
  if (low === 0x05 || low === 0x06) return ["databus-io"]; // PORTA/B (bank 0), TRISA/B (bank 1)
  return []; // OPTION, INTCON, EECON1: just the data bus
}

export function activeBuses(
  step: HistoryEntry | null, // the last step (newest History entry)
  before: CpuSnapshot | null,
  after: CpuSnapshot | null,
): ReadonlySet<BusId> {
  const buses = new Set<BusId>();
  if (!step || !before || !after) return buses;
  if (step.events & STEP_EVENT.interrupt) buses.add("pc-stack");
  if (step.events & STEP_EVENT.asleep) return buses; // no instruction ran

  const instruction = decodeInstruction(step.word);
  if (!instruction) return buses;
  const m = instruction.mnemonic;
  const f = step.word & 0x7f;
  const d = (step.word >> 7) & 1;

  buses.add("pc-flash").add("program-bus"); // fetch

  if (READ_F.has(m)) {
    for (const bus of registerPath(f, before)) buses.add(bus);
    buses.add("databus").add("databus-mux").add("mux-alu");
  }
  if (W_IN.has(m) || LITERAL_W_IN.has(m)) buses.add("w-alu");
  if (LITERAL.has(m)) buses.add("literal").add("mux-alu");

  const toF = WRITE_F.has(m) || (F_TO_D.has(m) && d === 1);
  const toW = (F_TO_D.has(m) && d === 0) || LITERAL.has(m) || m === "CLRW";
  if (toW) buses.add("alu-w");
  if (toF) {
    buses.add("alu-databus").add("databus");
    for (const bus of registerPath(f, before)) buses.add(bus);
  }

  if (STACK.has(m)) buses.add("pc-stack");

  // Side effects the instruction itself doesn't name
  if (before.file[STATUS] !== after.file[STATUS]) buses.add("databus-status"); // flags
  const eepromChanged = before.eeprom.some((byte, i) => byte !== after.eeprom[i]);
  const eedataLoaded = before.file[EEDATA] !== after.file[EEDATA] && !toF; // a read (RD)
  if (eepromChanged || eedataLoaded) buses.add("eedata-eeprom").add("eeadr-eeprom");

  return buses;
}
