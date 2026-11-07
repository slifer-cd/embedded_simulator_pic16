import { describe, expect, it } from "vite-plus/test";
import { assemble } from "../src/assembler/assembler.ts";
import type { EncodedWord } from "../src/assembler/encoder.ts";
import { generateErr, messageTag } from "../src/assembler/output/err.ts";
import { generateHex } from "../src/assembler/output/hex.ts";
import { generateLst } from "../src/assembler/output/lst.ts";

const word = (address: number, value: number): EncodedWord => ({ address, value, line: 1 });

// Checksum rule of Intel HEX: all bytes of a record (with the checksum) add up to 0 mod 256
function checksumOk(record: string): boolean {
  const bytes = record
    .slice(1)
    .match(/../g)!
    .map((b) => parseInt(b, 16));
  return bytes.reduce((sum, b) => sum + b, 0) % 256 === 0;
}

describe("output: .hex (INHX8M)", () => {
  it("writes a word low byte first, at byte address = word address x 2, then the EOF record", () => {
    // 0x3055 at address 0: 02 0000 00 55 30, checksum 0x79
    expect(generateHex([word(0, 0x3055)])).toBe(":02000000553079\r\n:00000001FF\r\n");
  });

  it("gives only the EOF record for no words", () => {
    expect(generateHex([])).toBe(":00000001FF\r\n");
  });

  it("puts at most 16 bytes in a record and starts a new one at a 16-byte boundary", () => {
    const words = Array.from({ length: 9 }, (_, i) => word(i, i));
    const records = generateHex(words).trim().split("\r\n");
    expect(records.map((r) => r.slice(1, 9))).toEqual(["10000000", "02001000", "00000001"]);
    expect(records.every(checksumOk)).toBe(true);
  });

  it("starts a new record after a gap and sorts by address", () => {
    const records = generateHex([word(0x10, 0x0000), word(0, 0x2800)])
      .trim()
      .split("\r\n");
    expect(records.map((r) => r.slice(1, 7))).toEqual(["020000", "020020", "000000"]);
  });

  it("puts the configuration word at byte address 0x400E", () => {
    const records = generateHex(assemble("        __CONFIG 0x3FF9\n        END").words).split(
      "\r\n",
    );
    expect(records[0]).toMatch(/^:02400E00F93F/);
    expect(checksumOk(records[0])).toBe(true);
  });
});

describe("output: .err", () => {
  it("writes one MPASM-style line per message", () => {
    const text = generateErr(
      [
        { line: 3, severity: "error", code: 113, text: "Symbol not previously defined. (X)" },
        { line: 7, severity: "message", code: 302, text: "Register in operand not in bank 0." },
        { line: 9, severity: "warning", text: "No MPASM number." },
      ],
      "prog.asm",
    );
    expect(text).toBe(
      "Error[113]   prog.asm 3 : Symbol not previously defined. (X)\r\n" +
        "Message[302] prog.asm 7 : Register in operand not in bank 0.\r\n" +
        "Warning      prog.asm 9 : No MPASM number.\r\n",
    );
  });

  it("is empty when there is nothing to report", () => {
    expect(generateErr([], "prog.asm")).toBe("");
  });

  it("tags a message with its number only when it has one", () => {
    expect(messageTag({ line: 1, severity: "warning", code: 202, text: "" })).toBe("Warning[202]");
    expect(messageTag({ line: 1, severity: "error", text: "" })).toBe("Error");
  });
});

describe("output: .lst", () => {
  const source = `count   EQU     0x20
        ORG     0
start   BSF     STATUS, RP0
        CLRF    TRISB
        GOTO    start
        END
ignored NOP`;
  const lst = generateLst(assemble(source), "prog.asm", new Date(2026, 0, 2, 3, 4, 5));
  const lines = lst.split("\r\n");

  it("starts with the header and the column titles", () => {
    expect(lines[0]).toContain("prog.asm");
    expect(lines).toContain("LOC  OBJECT CODE     LINE SOURCE TEXT");
  });

  it("lists address, object code, line number and source for each line", () => {
    expect(lines).toContain("0000   1683           00003 start   BSF     STATUS, RP0");
    expect(lines).toContain("0002   2800           00005         GOTO    start");
  });

  it("shows EQU values and ORG addresses in the VALUE / LOC column", () => {
    expect(lines).toContain("  00000020            00001 count   EQU     0x20");
    expect(lines).toContain("0000                  00002         ORG     0");
  });

  it("puts a message right above its line", () => {
    const at = lines.indexOf("0001   0186           00004         CLRF    TRISB");
    expect(lines[at - 1]).toBe(
      "Message[302]: Register in operand not in bank 0. Ensure that bank bits are correct.",
    );
  });

  it("stops after END", () => {
    expect(lst).not.toContain("ignored NOP");
  });

  it("ends with the user symbols, the memory map and the totals", () => {
    expect(lines).toContain(`${"count".padEnd(34)}00000020`);
    expect(lines).toContain(`${"start".padEnd(34)}00000000`);
    expect(lst).not.toContain("STATUS                            "); // no built-in names
    expect(lines).toContain(
      `0000 : XXX------------- ${"-".repeat(16)} ${"-".repeat(16)} ${"-".repeat(16)}`,
    );
    expect(lines).toContain("Program Memory Words Used:     3");
    expect(lines).toContain("Errors   :     0");
    expect(lines).toContain("Messages :     1 reported");
  });

  it("uses Windows line endings", () => {
    expect(lst.endsWith("\r\n")).toBe(true);
    expect(lst.replace(/\r\n/g, "")).not.toContain("\n");
  });
});
