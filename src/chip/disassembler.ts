// Disassembler: 14-bit word -> instruction text, e.g. 0x1683 -> "BSF 0x03, 5".
// Used by the Flash panel now and by the simulator later.
//
// Operands are shown as numbers (like MPLAB's program memory view), not names,
// because a 7-bit f can mean two registers (0x06 = PORTB in bank 0, TRISB in bank 1).

import { decodeInstruction } from "./instructions.ts";

function hex(value: number, digits: number): string {
  return `0x${value.toString(16).toUpperCase().padStart(digits, "0")}`;
}

export function disassemble(word: number): string {
  const instruction = decodeInstruction(word);
  if (!instruction) return `DW ${hex(word, 4)}`; // not a valid instruction

  const name = instruction.mnemonic;
  const f = word & 0x7f;

  switch (instruction.operands) {
    case "fd":
      return `${name} ${hex(f, 2)}, ${word & 0x80 ? "F" : "W"}`;
    case "f":
      return `${name} ${hex(f, 2)}`;
    case "fb":
      return `${name} ${hex(f, 2)}, ${(word >> 7) & 0x07}`;
    case "k8":
      return `${name} ${hex(word & 0xff, 2)}`;
    case "k11":
      return `${name} ${hex(word & 0x7ff, 3)}`;
    case "none":
      return name;
  }
}
