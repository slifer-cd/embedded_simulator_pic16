import { describe, expect, it } from "vite-plus/test";
import { tokenize } from "../src/assembler/lexer.ts";
import { parse } from "../src/assembler/parser.ts";
import { buildSymbols, builtinSymbols } from "../src/assembler/symbols.ts";

// Lex + parse + pass 1; adds END
function pass1(source: string) {
  const { statements } = parse(tokenize(`${source}\n        END`).lines);
  return { statements, ...buildSymbols(statements) };
}

const value = (result: ReturnType<typeof pass1>, name: string) => result.symbols.get(name)?.value;

describe("symbols: built-in names", () => {
  it("knows the registers, bits, W / F and the config symbols", () => {
    const symbols = builtinSymbols();
    expect(symbols.get("STATUS")).toEqual({ value: 0x03, kind: "builtin" });
    expect(symbols.get("TRISB")?.value).toBe(0x86);
    expect(symbols.get("RP0")?.value).toBe(5);
    expect(symbols.get("Z")?.value).toBe(2);
    expect(symbols.get("W")?.value).toBe(0);
    expect(symbols.get("F")?.value).toBe(1);
    expect(symbols.get("_XT_OSC")?.value).toBe(0x3ffd);
  });

  it("preloads them without #include", () => {
    const result = pass1("        NOP");
    expect(value(result, "PORTB")).toBe(0x06);
  });
});

describe("symbols: addresses and labels", () => {
  it("gives every instruction one word and labels their address", () => {
    const result = pass1("start   NOP\n        NOP\nnext    NOP");
    expect(result.messages).toEqual([]);
    expect(value(result, "start")).toBe(0);
    expect(value(result, "next")).toBe(2);
    expect(result.symbols.get("next")).toMatchObject({ kind: "label", line: 3 });
  });

  it("has one address per statement", () => {
    const result = pass1("        NOP\n        NOP");
    expect(result.addresses).toHaveLength(result.statements.length);
    expect(result.addresses).toEqual([0, 1, 2]); // NOP, NOP, END
  });

  it("moves the address counter with ORG, and a label on ORG gets the new address", () => {
    const result = pass1("        ORG 0x10\nhere    ORG 0x20\n        NOP\nafter   NOP");
    expect(value(result, "here")).toBe(0x20);
    expect(value(result, "after")).toBe(0x21);
  });

  it("can use a label before it is defined only in pass 2, not in ORG", () => {
    const result = pass1("        ORG later\nlater   NOP");
    expect(result.messages[0]).toMatchObject({ severity: "error", code: 113 });
  });

  it("gives a label alone on its line the next address", () => {
    const result = pass1("        NOP\nalone\n        NOP");
    expect(value(result, "alone")).toBe(1);
  });

  it("reports a duplicate label (115), also for a built-in name", () => {
    const result = pass1("twice   NOP\ntwice   NOP\nC       NOP");
    expect(result.messages).toMatchObject([
      { line: 2, severity: "error", code: 115 },
      { line: 3, severity: "error", code: 115 },
    ]);
  });
});

describe("symbols: EQU", () => {
  it("defines a constant, evaluated with the symbols before it", () => {
    const result = pass1("base    EQU 0x20\nnext    EQU base + 2");
    expect(result.symbols.get("base")).toMatchObject({ value: 0x20, kind: "equ" });
    expect(value(result, "next")).toBe(0x22);
  });

  it("does not move the address counter", () => {
    const result = pass1("k       EQU 5\nfirst   NOP");
    expect(value(result, "first")).toBe(0);
  });

  it("reports an undefined name in the value", () => {
    const result = pass1("bad     EQU missing");
    expect(result.messages[0]).toMatchObject({ line: 1, severity: "error", code: 113 });
    expect(result.symbols.has("bad")).toBe(false);
  });
});

describe("symbols: CBLOCK", () => {
  it("gives the names consecutive addresses from the start value", () => {
    const result = pass1("        CBLOCK 0x20\n          a, b\n          c\n        ENDC");
    expect(result.messages).toEqual([]);
    expect([value(result, "a"), value(result, "b"), value(result, "c")]).toEqual([
      0x20, 0x21, 0x22,
    ]);
    expect(result.symbols.get("a")?.kind).toBe("cblock");
  });

  it("reserves several bytes with NAME:size", () => {
    const result = pass1("        CBLOCK 0x0C\n          buffer:4, after\n        ENDC");
    expect(value(result, "buffer")).toBe(0x0c);
    expect(value(result, "after")).toBe(0x10);
  });

  it("continues where the last CBLOCK stopped when it has no start value", () => {
    const result = pass1(
      "        CBLOCK 0x30\n          x\n        ENDC\n        CBLOCK\n          y\n        ENDC",
    );
    expect(value(result, "y")).toBe(0x31);
  });

  it("does not move the program address counter", () => {
    const result = pass1("        CBLOCK 0x20\n          v\n        ENDC\nfirst   NOP");
    expect(value(result, "first")).toBe(0);
  });

  it("reports ENDC without CBLOCK, and CBLOCK inside CBLOCK", () => {
    expect(pass1("        ENDC").messages[0]).toMatchObject({ severity: "error" });
    const nested = pass1("        CBLOCK 0x20\n        CBLOCK 0x30\n        ENDC");
    expect(nested.messages[0]).toMatchObject({ line: 2, severity: "error" });
  });
});

describe("symbols: DE", () => {
  it("takes one word per byte and per string character", () => {
    const result = pass1('        ORG 0x2100\ntable   DE 1, 2, "abc"\nnext    NOP');
    expect(value(result, "table")).toBe(0x2100);
    expect(value(result, "next")).toBe(0x2105);
  });
});
