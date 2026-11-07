import { describe, expect, it } from "vite-plus/test";
import { encode } from "../src/assembler/encoder.ts";
import { tokenize } from "../src/assembler/lexer.ts";
import { parse } from "../src/assembler/parser.ts";
import { buildSymbols } from "../src/assembler/symbols.ts";

// Lex + parse + both passes; adds END. Returns the pass 2 result.
function pass2(source: string) {
  const { statements } = parse(tokenize(`${source}\n        END`).lines);
  const { symbols, addresses } = buildSymbols(statements);
  return encode(statements, symbols, addresses);
}

// The words of a program (instructions only, no messages expected)
function words(source: string): number[] {
  const result = pass2(source);
  expect(result.messages).toEqual([]);
  return result.words.map((w) => w.value);
}

describe("encoder: instruction words", () => {
  it("encodes the byte-oriented f, d form", () => {
    expect(words("        ADDWF 0x20, F\n        ADDWF 0x20, W")).toEqual([0x07a0, 0x0720]);
    expect(words("        MOVF  0x0C, W")).toEqual([0x080c]);
  });

  it("encodes f-only, bit and literal instructions", () => {
    expect(words("        CLRF  0x21\n        MOVWF 0x0C")).toEqual([0x01a1, 0x008c]);
    expect(words("        BSF   STATUS, RP0\n        BTFSS 0x03, 2")).toEqual([0x1683, 0x1d03]);
    expect(words("        MOVLW 0xFF\n        ADDLW .10")).toEqual([0x30ff, 0x3e0a]);
  });

  // "x" (don't care) bits are encoded as 0: CLRW = 00 0001 0xxx xxxx -> 0x0100
  it("encodes the instructions without operands", () => {
    expect(
      words(
        "        NOP\n        CLRW\n        RETURN\n        RETFIE\n        SLEEP\n        CLRWDT",
      ),
    ).toEqual([0x0000, 0x0100, 0x0008, 0x0009, 0x0063, 0x0064]);
  });

  it("resolves forward references in GOTO / CALL", () => {
    expect(words("        GOTO  skip\n        NOP\nskip    CALL  0x123")).toEqual([
      0x2802, 0x0000, 0x2123,
    ]);
  });

  it("gives every word its address and source line", () => {
    const result = pass2("        ORG 0x10\n        NOP");
    expect(result.words).toEqual([{ address: 0x10, value: 0, line: 2 }]);
  });
});

describe("encoder: range checks", () => {
  it("uses the low 7 bits of a bank 1 register, with message 302", () => {
    const result = pass2("        CLRF  TRISB");
    expect(result.words[0].value).toBe(0x0186);
    expect(result.messages).toEqual([
      expect.objectContaining({ line: 1, severity: "message", code: 302 }),
    ]);
  });

  it("warns (202) and keeps the low bits of a literal out of range", () => {
    const result = pass2("        MOVLW 0x1FF");
    expect(result.words[0].value).toBe(0x30ff);
    expect(result.messages[0]).toMatchObject({ severity: "warning", code: 202 });
  });

  it("accepts negative literals down to -128", () => {
    const result = pass2("        MOVLW -1");
    expect(result.messages).toEqual([]);
    expect(result.words[0].value).toBe(0x30ff);
  });

  it("warns (202) about a bit number above 7", () => {
    const result = pass2("        BSF   0x20, 8");
    expect(result.messages[0]).toMatchObject({ severity: "warning", code: 202 });
    expect(result.words[0].value).toBe(0x1420); // bit 8 & 7 = 0
  });

  it("rejects a destination that is not W (0) or F (1)", () => {
    const result = pass2("        ADDWF 0x20, 2");
    expect(result.words).toEqual([]);
    expect(result.messages[0]).toMatchObject({ severity: "error" });
  });

  it("warns about a GOTO beyond the 1K program memory", () => {
    const result = pass2("        GOTO  0x500");
    expect(result.words[0].value).toBe(0x2d00);
    expect(result.messages[0]).toMatchObject({ severity: "warning" });
  });

  it("reports an undefined symbol (113) and places no word", () => {
    const result = pass2("        GOTO  nowhere");
    expect(result.words).toEqual([]);
    expect(result.messages[0]).toMatchObject({ severity: "error", code: 113 });
  });
});

describe("encoder: placing words", () => {
  it("reports two words at the same address (118)", () => {
    const result = pass2("        ORG 0\n        NOP\n        ORG 0\n        NOP");
    expect(result.words).toHaveLength(1);
    expect(result.messages[0]).toMatchObject({ line: 4, severity: "error", code: 118 });
  });

  it("rejects an address outside the PIC16F84A memory", () => {
    const result = pass2("        ORG 0x500\n        NOP");
    expect(result.words).toEqual([]);
    expect(result.messages[0]).toMatchObject({ severity: "error" });
  });

  it("puts __CONFIG at 0x2007", () => {
    const result = pass2("        __CONFIG _XT_OSC & _WDT_OFF");
    expect(result.messages).toEqual([]);
    expect(result.words).toEqual([{ address: 0x2007, value: 0x3ff9, line: 1 }]);
  });

  it("puts DE data in the EEPROM area, one byte per word", () => {
    const result = pass2('        ORG 0x2100\n        DE 0x12, "AB", .255');
    expect(result.messages).toEqual([]);
    expect(result.words.map((w) => [w.address, w.value])).toEqual([
      [0x2100, 0x12],
      [0x2101, 0x41],
      [0x2102, 0x42],
      [0x2103, 0xff],
    ]);
  });
});
