import { describe, expect, it } from "vite-plus/test";
import { evaluate } from "../src/assembler/expressions.ts";
import type { EvalOptions } from "../src/assembler/expressions.ts";

const SYMBOLS = new Map<string, number>([
  ["COUNT", 0x20],
  ["table", 0x123],
  ["_XT_OSC", 0x3ffd],
  ["_WDT_OFF", 0x3ffb],
  ["_PWRTE_ON", 0x3ff7],
  ["_CP_OFF", 0x3fff],
]);

const lookup = (name: string) => SYMBOLS.get(name);

// Evaluate and return the value, failing the test on an error
function value(text: string, options?: EvalOptions): number {
  const result = evaluate(text, lookup, options);
  if (!result.ok) throw new Error(`"${text}" failed: ${result.error}`);
  return result.value;
}

// Evaluate and return the error, failing the test if it succeeded
function error(text: string, options?: EvalOptions) {
  const result = evaluate(text, lookup, options);
  if (result.ok) throw new Error(`"${text}" should fail but gave ${result.value}`);
  return result;
}

describe("expressions: numbers", () => {
  it.each([
    ["0x1F", 0x1f],
    ["0X1f", 0x1f],
    ["H'1F'", 0x1f],
    ["h'1f'", 0x1f],
    ["1Fh", 0x1f],
    ["0FFh", 0xff],
    ["D'31'", 31],
    [".31", 31],
    ["B'00011111'", 0x1f],
    ["O'37'", 31],
    ["'A'", 65],
    ["A'B'", 66],
  ])("%s = %i", (text, expected) => {
    expect(value(text)).toBe(expected);
  });

  it("uses hex as the default radix", () => {
    expect(value("20")).toBe(0x20);
    expect(value("10")).toBe(16);
  });

  it("uses the radix option for plain numbers", () => {
    expect(value("20", { radix: 10 })).toBe(20);
  });

  it("$ is the current address", () => {
    expect(value("$", { currentAddress: 5 })).toBe(5);
    expect(value("$+2", { currentAddress: 5 })).toBe(7);
  });
});

describe("expressions: symbols", () => {
  it("looks up symbols", () => {
    expect(value("COUNT")).toBe(0x20);
    expect(value("COUNT+1")).toBe(0x21);
  });

  it("combines config symbols with &", () => {
    expect(value("_XT_OSC & _WDT_OFF & _PWRTE_ON & _CP_OFF")).toBe(0x3ff1);
  });

  it("is case-sensitive for symbols", () => {
    expect(error("count").code).toBe(113);
  });

  it("treats FF (no leading digit) as a symbol", () => {
    expect(error("FF").code).toBe(113);
  });
});

describe("expressions: operators", () => {
  it.each([
    ["2+3*4", 14],
    ["(2+3)*4", 20],
    ["10-2-3", 0x10 - 2 - 3],
    [".7/.2", 3],
    [".7%.2", 1],
    ["1<<3|1", 9],
    ["0xF0>>4", 0x0f],
    ["0xF0&0x3C", 0x30],
    ["0xF0|0x0F", 0xff],
    ["0xFF^0x0F", 0xf0],
    ["~0 & 0xFF", 0xff],
    ["-1", -1],
    ["-(2+3)", -5],
    ["!0", 1],
    ["!5", 0],
    ["COUNT == 0x20", 1],
    ["COUNT != 0x20", 0],
    ["1 < 2", 1],
    ["2 <= 1", 0],
    ["1 && 0", 0],
    ["1 || 0", 1],
  ])("%s = %i", (text, expected) => {
    expect(value(text)).toBe(expected);
  });

  it("HIGH / LOW / UPPER take bytes of a value", () => {
    expect(value("HIGH table")).toBe(0x01);
    expect(value("LOW table")).toBe(0x23);
    expect(value("low table")).toBe(0x23);
    expect(value("UPPER 0x123456")).toBe(0x12);
  });

  it("HIGH applies only to the value right after it", () => {
    expect(value("HIGH table+1")).toBe(0x02);
    expect(value("HIGH(table+0xFF)")).toBe(0x02);
  });
});

describe("expressions: errors", () => {
  it("undefined symbol (113)", () => {
    expect(error("UNDEF")).toMatchObject({ code: 113 });
  });

  it("bad digits for the radix", () => {
    expect(error("B'102'").error).toContain("Illegal number");
    expect(error("O'8'").error).toContain("Illegal number");
    expect(error("0x").error).toBeDefined();
  });

  it("divide by zero", () => {
    expect(error("1/0").error).toContain("Divide by zero");
    expect(error("1%0").error).toContain("Divide by zero");
  });

  it("missing ')'", () => {
    expect(error("(1+2").error).toContain("Missing ')'");
  });

  it("extra tokens", () => {
    expect(error("1 2").error).toContain("Unexpected");
  });

  it("expression ends too early", () => {
    expect(error("1+").error).toBeDefined();
  });

  it("illegal character (108)", () => {
    expect(error("1 @ 2")).toMatchObject({ code: 108 });
  });

  it("empty expression (128)", () => {
    expect(error("")).toMatchObject({ code: 128 });
  });

  it("$ without a current address", () => {
    expect(error("$").error).toContain("$");
  });
});
