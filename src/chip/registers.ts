// PIC16F84A special function registers (SFRs), from the datasheet register map.
//
// Addresses are full 8-bit addresses: bank 0 = 0x00-0x7F, bank 1 = 0x80-0xFF.
// An instruction only holds the low 7 bits (address & 0x7F); STATUS.RP0 selects the bank.
//
// "mirrored" registers appear at the same place in both banks
// (e.g. STATUS is at 0x03 and 0x83), so they are listed once with their bank 0 address.

export type Register = {
  name: string;
  address: number;
  mirrored: boolean;
  resetValue: number; // value after power-on reset ("x" / unknown bits are 0)
  bits: string[]; // bit 7 -> bit 0, "" = unnamed / unimplemented
};

const NO_BITS = ["", "", "", "", "", "", "", ""];

export const REGISTERS: Register[] = [
  // ---------- Bank 0 ----------
  { name: "INDF", address: 0x00, mirrored: true, resetValue: 0x00, bits: NO_BITS },
  { name: "TMR0", address: 0x01, mirrored: false, resetValue: 0x00, bits: NO_BITS },
  { name: "PCL", address: 0x02, mirrored: true, resetValue: 0x00, bits: NO_BITS },
  {
    name: "STATUS",
    address: 0x03,
    mirrored: true,
    resetValue: 0x18,
    bits: ["IRP", "RP1", "RP0", "NOT_TO", "NOT_PD", "Z", "DC", "C"],
  },
  { name: "FSR", address: 0x04, mirrored: true, resetValue: 0x00, bits: NO_BITS },
  {
    name: "PORTA",
    address: 0x05,
    mirrored: false,
    resetValue: 0x00,
    bits: ["", "", "", "RA4", "RA3", "RA2", "RA1", "RA0"],
  },
  {
    name: "PORTB",
    address: 0x06,
    mirrored: false,
    resetValue: 0x00,
    bits: ["RB7", "RB6", "RB5", "RB4", "RB3", "RB2", "RB1", "RB0"],
  },
  // 0x07 is unimplemented
  { name: "EEDATA", address: 0x08, mirrored: false, resetValue: 0x00, bits: NO_BITS },
  { name: "EEADR", address: 0x09, mirrored: false, resetValue: 0x00, bits: NO_BITS },
  { name: "PCLATH", address: 0x0a, mirrored: true, resetValue: 0x00, bits: NO_BITS },
  {
    name: "INTCON",
    address: 0x0b,
    mirrored: true,
    resetValue: 0x00,
    bits: ["GIE", "EEIE", "T0IE", "INTE", "RBIE", "T0IF", "INTF", "RBIF"],
  },

  // ---------- Bank 1 ----------
  {
    name: "OPTION_REG",
    address: 0x81,
    mirrored: false,
    resetValue: 0xff,
    bits: ["NOT_RBPU", "INTEDG", "T0CS", "T0SE", "PSA", "PS2", "PS1", "PS0"],
  },
  {
    name: "TRISA",
    address: 0x85,
    mirrored: false,
    resetValue: 0x1f,
    bits: ["", "", "", "TRISA4", "TRISA3", "TRISA2", "TRISA1", "TRISA0"],
  },
  {
    name: "TRISB",
    address: 0x86,
    mirrored: false,
    resetValue: 0xff,
    bits: ["TRISB7", "TRISB6", "TRISB5", "TRISB4", "TRISB3", "TRISB2", "TRISB1", "TRISB0"],
  },
  // 0x87 is unimplemented
  {
    name: "EECON1",
    address: 0x88,
    mirrored: false,
    resetValue: 0x00,
    bits: ["", "", "", "EEIF", "WRERR", "WREN", "WR", "RD"],
  },
  { name: "EECON2", address: 0x89, mirrored: false, resetValue: 0x00, bits: NO_BITS }, // not a physical register
];

// General purpose RAM: 68 bytes at 0x0C-0x4F (mirrored at 0x8C-0xCF)
export const GPR_START = 0x0c;
export const GPR_END = 0x4f;

// Destination names for "f, d" instructions, e.g. ADDWF COUNT, F
export const DESTINATIONS = { W: 0, F: 1 } as const;

// Lookup by register name (used by the assembler), e.g. REGISTER_BY_NAME.get("TRISB")?.address
export const REGISTER_BY_NAME = new Map(REGISTERS.map((reg) => [reg.name, reg]));

// Lookup bit name -> bit number (used by the assembler), e.g. BIT_BY_NAME.get("RP0") === 5
export const BIT_BY_NAME = new Map<string, number>();
for (const reg of REGISTERS) {
  reg.bits.forEach((bitName, index) => {
    if (bitName !== "") BIT_BY_NAME.set(bitName, 7 - index);
  });
}
