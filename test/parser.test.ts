import { describe, expect, it } from "vite-plus/test";
import { tokenize } from "../src/assembler/lexer.ts";
import { parse } from "../src/assembler/parser.ts";

// Lex + parse; adds END unless the source already has one
function parseSource(source: string, addEnd = true) {
  const text = addEnd ? `${source}\n        END` : source;
  return parse(tokenize(text).lines);
}

describe("parser: statements", () => {
  it("parses an instruction with its Instruction entry", () => {
    const { statements, messages } = parseSource("        MOVLW   0xFF");
    expect(messages).toEqual([]);
    expect(statements[0]).toMatchObject({ kind: "instruction", line: 1, operands: ["0xFF"] });
    if (statements[0].kind !== "instruction") throw new Error("expected instruction");
    expect(statements[0].instruction.mnemonic).toBe("MOVLW");
  });

  it("keeps the label on an instruction", () => {
    const { statements } = parseSource("loop    GOTO    loop");
    expect(statements[0]).toMatchObject({ kind: "instruction", label: "loop" });
  });

  it("parses a label alone on its line", () => {
    const { statements } = parseSource("start");
    expect(statements[0]).toEqual({ kind: "label", line: 1, label: "start" });
  });

  it("parses directives", () => {
    const { statements, messages } = parseSource("        ORG     0x000\nCOUNT   EQU     0x20");
    expect(messages).toEqual([]);
    expect(statements[0]).toMatchObject({
      kind: "directive",
      directive: "ORG",
      operands: ["0x000"],
    });
    expect(statements[1]).toMatchObject({ kind: "directive", directive: "EQU", label: "COUNT" });
  });

  it("parses CBLOCK names", () => {
    const { statements, messages } = parseSource(
      "        CBLOCK 0x20\n            A, B\n        ENDC",
    );
    expect(messages).toEqual([]);
    expect(statements.map((s) => s.kind)).toEqual([
      "directive",
      "cblock-names",
      "directive",
      "directive",
    ]);
    expect(statements[1]).toEqual({ kind: "cblock-names", line: 2, names: ["A", "B"] });
  });

  it("skips blank and comment-only lines", () => {
    const { statements } = parseSource("\n; comment\n        NOP");
    expect(statements.map((s) => s.line)).toEqual([3, 4]);
  });

  it("accepts the supported directives", () => {
    const source = [
      "        LIST    P=16F84A",
      "        PROCESSOR 16F84A",
      "#include <P16F84A.INC>",
      "        __CONFIG _XT_OSC & _WDT_OFF",
      "        ORG     0x2100",
      "        DE      1, 2, 3",
    ].join("\n");
    expect(parseSource(source).messages).toEqual([]);
  });
});

describe("parser: operand count", () => {
  it("adds default destination 1 with message 305", () => {
    const { statements, messages } = parseSource("        INCF    COUNT");
    expect(statements[0]).toMatchObject({ kind: "instruction", operands: ["COUNT", "1"] });
    expect(messages).toMatchObject([{ line: 1, severity: "message", code: 305 }]);
  });

  it("reports missing arguments (128)", () => {
    const { statements, messages } = parseSource("        BSF     STATUS");
    expect(statements[0].kind).toBe("directive"); // only END left
    expect(messages).toMatchObject([{ line: 1, severity: "error", code: 128 }]);
  });

  it("reports too many arguments", () => {
    const { messages } = parseSource("        ADDWF   COUNT, F, W");
    expect(messages).toMatchObject([{ line: 1, severity: "error" }]);
    expect(messages[0].text).toContain("Too many arguments");
  });

  it("reports operands on an instruction without operands", () => {
    expect(parseSource("        RETURN  5").messages).toMatchObject([{ severity: "error" }]);
  });

  it("reports a directive with missing arguments", () => {
    expect(parseSource("        ORG").messages).toMatchObject([{ code: 128 }]);
  });
});

describe("parser: errors", () => {
  it("reports an illegal opcode (122)", () => {
    const { messages } = parseSource("        MOVLX   5");
    expect(messages).toMatchObject([{ line: 1, severity: "error", code: 122 }]);
    expect(messages[0].text).toContain("MOVLX");
  });

  it("reports an illegal label name", () => {
    const { messages } = parseSource("1abc    NOP");
    expect(messages).toMatchObject([{ line: 1, severity: "error" }]);
    expect(messages[0].text).toContain("Illegal label");
  });

  it("reports a label longer than 32 characters", () => {
    const { messages } = parseSource(`${"a".repeat(33)}    NOP`);
    expect(messages).toMatchObject([{ severity: "error" }]);
  });

  it("reports EQU without a label", () => {
    const { messages } = parseSource("        EQU     5");
    expect(messages[0].text).toContain("EQU needs a label");
  });

  it("reports unsupported directives", () => {
    const { messages } = parseSource("        MACRO");
    expect(messages[0].text).toContain("not supported");
  });

  it("reports a missing END (129)", () => {
    const { messages } = parseSource("        NOP\n        NOP", false);
    expect(messages).toMatchObject([{ line: 2, severity: "error", code: 129 }]);
  });
});

describe("parser: END", () => {
  it("ignores everything after END", () => {
    const { statements, messages } = parseSource(
      "        NOP\n        END\n        GARBAGE 1, 2",
      false,
    );
    expect(messages).toEqual([]);
    expect(statements).toHaveLength(2);
  });
});
