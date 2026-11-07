// .hex writer: Intel HEX, INHX8M format (what MPASM makes for the PIC16F84A).
//
// Every line is a record:  :LL AAAA TT DD... CC
//   LL   number of data bytes        AAAA  byte address (big-endian)
//   TT   00 = data, 01 = end of file  CC    checksum
//
// Each 14-bit word becomes 2 bytes, low byte first, at byte address = word address * 2.
// Records hold at most 16 bytes and never cross a 16-byte boundary (like MPASM).

import type { EncodedWord } from "../encoder.ts";

const BYTES_PER_RECORD = 16;
const RECORD_DATA = 0x00;
const RECORD_EOF = 0x01;

// 0x3f -> "3F"
function hexByte(value: number): string {
  return value.toString(16).toUpperCase().padStart(2, "0");
}

// Build one record line, checksum included
function record(byteAddress: number, type: number, data: number[]): string {
  const bytes = [data.length, (byteAddress >> 8) & 0xff, byteAddress & 0xff, type, ...data];
  const sum = bytes.reduce((total, byte) => total + byte, 0);
  const checksum = (0x100 - (sum & 0xff)) & 0xff; // two's complement of the low byte
  return `:${bytes.map(hexByte).join("")}${hexByte(checksum)}`;
}

export function generateHex(words: EncodedWord[]): string {
  const sorted = [...words].sort((a, b) => a.address - b.address);
  const lines: string[] = [];

  let start = 0; // byte address of the current record
  let data: number[] = []; // bytes of the current record

  const flush = () => {
    if (data.length > 0) lines.push(record(start, RECORD_DATA, data));
    data = [];
  };

  for (const { address, value } of sorted) {
    const byteAddress = address * 2;

    // Start a new record on a gap, at a 16-byte boundary, or when the record is full
    const contiguous = data.length > 0 && byteAddress === start + data.length;
    if (!contiguous || byteAddress % BYTES_PER_RECORD === 0 || data.length >= BYTES_PER_RECORD) {
      flush();
      start = byteAddress;
    }

    data.push(value & 0xff, (value >> 8) & 0xff); // low byte first
  }
  flush();

  lines.push(record(0, RECORD_EOF, [])); // ":00000001FF"

  return `${lines.join("\r\n")}\r\n`; // Windows line endings, like MPASM
}
