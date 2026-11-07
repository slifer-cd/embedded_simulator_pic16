// PIC16F84A instruction set (35 instructions), from the datasheet table.
//
// Every instruction is a 14-bit word:
//   opcode = the fixed bits, with all operand / "x" (don't care) bits set to 0
//   mask   = 1 for every fixed bit, 0 for operand / "x" bits
// A word belongs to an instruction when (word & mask) === opcode.

// Operand formats:
//   "fd"   -> f, d   (7-bit file register, 1-bit destination: 0 = W, 1 = f)
//   "f"    -> f      (7-bit file register)
//   "fb"   -> f, b   (7-bit file register, 3-bit bit number)
//   "k8"   -> k      (8-bit literal)
//   "k11"  -> k      (11-bit address, for CALL / GOTO)
//   "none" -> no operands
export type OperandFormat = "fd" | "f" | "fb" | "k8" | "k11" | "none";

export type StatusFlag = "C" | "DC" | "Z" | "TO" | "PD";

export type Instruction = {
  mnemonic: string;
  operands: OperandFormat;
  opcode: number;
  mask: number;
  cycles: 1 | 2;
  skips: boolean; // can skip the next instruction (then takes 2 cycles)
  status: StatusFlag[];
  description: string;
};

export const INSTRUCTIONS: Instruction[] = [
  // ---------- Byte-oriented file register operations ----------
  // 00 oooo dfff ffff
  {
    mnemonic: "ADDWF",
    operands: "fd",
    opcode: 0x0700,
    mask: 0x3f00,
    cycles: 1,
    skips: false,
    status: ["C", "DC", "Z"],
    description: "Add W and f",
  },
  {
    mnemonic: "ANDWF",
    operands: "fd",
    opcode: 0x0500,
    mask: 0x3f00,
    cycles: 1,
    skips: false,
    status: ["Z"],
    description: "AND W with f",
  },
  {
    mnemonic: "CLRF",
    operands: "f",
    opcode: 0x0180,
    mask: 0x3f80,
    cycles: 1,
    skips: false,
    status: ["Z"],
    description: "Clear f",
  },
  {
    mnemonic: "CLRW",
    operands: "none",
    opcode: 0x0100,
    mask: 0x3f80,
    cycles: 1,
    skips: false,
    status: ["Z"],
    description: "Clear W",
  },
  {
    mnemonic: "COMF",
    operands: "fd",
    opcode: 0x0900,
    mask: 0x3f00,
    cycles: 1,
    skips: false,
    status: ["Z"],
    description: "Complement f",
  },
  {
    mnemonic: "DECF",
    operands: "fd",
    opcode: 0x0300,
    mask: 0x3f00,
    cycles: 1,
    skips: false,
    status: ["Z"],
    description: "Decrement f",
  },
  {
    mnemonic: "DECFSZ",
    operands: "fd",
    opcode: 0x0b00,
    mask: 0x3f00,
    cycles: 1,
    skips: true,
    status: [],
    description: "Decrement f, Skip if 0",
  },
  {
    mnemonic: "INCF",
    operands: "fd",
    opcode: 0x0a00,
    mask: 0x3f00,
    cycles: 1,
    skips: false,
    status: ["Z"],
    description: "Increment f",
  },
  {
    mnemonic: "INCFSZ",
    operands: "fd",
    opcode: 0x0f00,
    mask: 0x3f00,
    cycles: 1,
    skips: true,
    status: [],
    description: "Increment f, Skip if 0",
  },
  {
    mnemonic: "IORWF",
    operands: "fd",
    opcode: 0x0400,
    mask: 0x3f00,
    cycles: 1,
    skips: false,
    status: ["Z"],
    description: "Inclusive OR W with f",
  },
  {
    mnemonic: "MOVF",
    operands: "fd",
    opcode: 0x0800,
    mask: 0x3f00,
    cycles: 1,
    skips: false,
    status: ["Z"],
    description: "Move f",
  },
  {
    mnemonic: "MOVWF",
    operands: "f",
    opcode: 0x0080,
    mask: 0x3f80,
    cycles: 1,
    skips: false,
    status: [],
    description: "Move W to f",
  },
  {
    mnemonic: "NOP",
    operands: "none",
    opcode: 0x0000,
    mask: 0x3f9f,
    cycles: 1,
    skips: false,
    status: [],
    description: "No Operation",
  },
  {
    mnemonic: "RLF",
    operands: "fd",
    opcode: 0x0d00,
    mask: 0x3f00,
    cycles: 1,
    skips: false,
    status: ["C"],
    description: "Rotate Left f through Carry",
  },
  {
    mnemonic: "RRF",
    operands: "fd",
    opcode: 0x0c00,
    mask: 0x3f00,
    cycles: 1,
    skips: false,
    status: ["C"],
    description: "Rotate Right f through Carry",
  },
  {
    mnemonic: "SUBWF",
    operands: "fd",
    opcode: 0x0200,
    mask: 0x3f00,
    cycles: 1,
    skips: false,
    status: ["C", "DC", "Z"],
    description: "Subtract W from f",
  },
  {
    mnemonic: "SWAPF",
    operands: "fd",
    opcode: 0x0e00,
    mask: 0x3f00,
    cycles: 1,
    skips: false,
    status: [],
    description: "Swap nibbles in f",
  },
  {
    mnemonic: "XORWF",
    operands: "fd",
    opcode: 0x0600,
    mask: 0x3f00,
    cycles: 1,
    skips: false,
    status: ["Z"],
    description: "Exclusive OR W with f",
  },

  // ---------- Bit-oriented file register operations ----------
  // 01 oobb bfff ffff
  {
    mnemonic: "BCF",
    operands: "fb",
    opcode: 0x1000,
    mask: 0x3c00,
    cycles: 1,
    skips: false,
    status: [],
    description: "Bit Clear f",
  },
  {
    mnemonic: "BSF",
    operands: "fb",
    opcode: 0x1400,
    mask: 0x3c00,
    cycles: 1,
    skips: false,
    status: [],
    description: "Bit Set f",
  },
  {
    mnemonic: "BTFSC",
    operands: "fb",
    opcode: 0x1800,
    mask: 0x3c00,
    cycles: 1,
    skips: true,
    status: [],
    description: "Bit Test f, Skip if Clear",
  },
  {
    mnemonic: "BTFSS",
    operands: "fb",
    opcode: 0x1c00,
    mask: 0x3c00,
    cycles: 1,
    skips: true,
    status: [],
    description: "Bit Test f, Skip if Set",
  },

  // ---------- Literal and control operations ----------
  {
    mnemonic: "ADDLW",
    operands: "k8",
    opcode: 0x3e00,
    mask: 0x3e00,
    cycles: 1,
    skips: false,
    status: ["C", "DC", "Z"],
    description: "Add literal and W",
  },
  {
    mnemonic: "ANDLW",
    operands: "k8",
    opcode: 0x3900,
    mask: 0x3f00,
    cycles: 1,
    skips: false,
    status: ["Z"],
    description: "AND literal with W",
  },
  {
    mnemonic: "CALL",
    operands: "k11",
    opcode: 0x2000,
    mask: 0x3800,
    cycles: 2,
    skips: false,
    status: [],
    description: "Call subroutine",
  },
  {
    mnemonic: "CLRWDT",
    operands: "none",
    opcode: 0x0064,
    mask: 0x3fff,
    cycles: 1,
    skips: false,
    status: ["TO", "PD"],
    description: "Clear Watchdog Timer",
  },
  {
    mnemonic: "GOTO",
    operands: "k11",
    opcode: 0x2800,
    mask: 0x3800,
    cycles: 2,
    skips: false,
    status: [],
    description: "Go to address",
  },
  {
    mnemonic: "IORLW",
    operands: "k8",
    opcode: 0x3800,
    mask: 0x3f00,
    cycles: 1,
    skips: false,
    status: ["Z"],
    description: "Inclusive OR literal with W",
  },
  {
    mnemonic: "MOVLW",
    operands: "k8",
    opcode: 0x3000,
    mask: 0x3c00,
    cycles: 1,
    skips: false,
    status: [],
    description: "Move literal to W",
  },
  {
    mnemonic: "RETFIE",
    operands: "none",
    opcode: 0x0009,
    mask: 0x3fff,
    cycles: 2,
    skips: false,
    status: [],
    description: "Return from interrupt",
  },
  {
    mnemonic: "RETLW",
    operands: "k8",
    opcode: 0x3400,
    mask: 0x3c00,
    cycles: 2,
    skips: false,
    status: [],
    description: "Return with literal in W",
  },
  {
    mnemonic: "RETURN",
    operands: "none",
    opcode: 0x0008,
    mask: 0x3fff,
    cycles: 2,
    skips: false,
    status: [],
    description: "Return from Subroutine",
  },
  {
    mnemonic: "SLEEP",
    operands: "none",
    opcode: 0x0063,
    mask: 0x3fff,
    cycles: 1,
    skips: false,
    status: ["TO", "PD"],
    description: "Go into standby mode",
  },
  {
    mnemonic: "SUBLW",
    operands: "k8",
    opcode: 0x3c00,
    mask: 0x3e00,
    cycles: 1,
    skips: false,
    status: ["C", "DC", "Z"],
    description: "Subtract W from literal",
  },
  {
    mnemonic: "XORLW",
    operands: "k8",
    opcode: 0x3a00,
    mask: 0x3f00,
    cycles: 1,
    skips: false,
    status: ["Z"],
    description: "Exclusive OR literal with W",
  },
];

// Lookup by mnemonic (used by the assembler), e.g. INSTRUCTION_BY_NAME.get("MOVLW")
export const INSTRUCTION_BY_NAME = new Map(INSTRUCTIONS.map((ins) => [ins.mnemonic, ins]));

// Find the instruction a 14-bit word belongs to (used by the simulator / disassembler)
export function decodeInstruction(word: number): Instruction | undefined {
  return INSTRUCTIONS.find((ins) => (word & ins.mask) === ins.opcode);
}
