import { describe, expect, it } from "vite-plus/test";
import { tokenize } from "../src/assembler/lexer.ts";

// Tokenize a single line and return its SourceLine
function lexLine(text: string) {
  return tokenize(text).lines[0];
}

describe("lexer: line parts", () => {
  it("splits an indented instruction", () => {
    const line = lexLine("        MOVLW   0xFF");
    expect(line.label).toBeUndefined();
    expect(line.mnemonic).toBe("MOVLW");
    expect(line.operands).toEqual(["0xFF"]);
  });

  it("reads a label in column 1", () => {
    const line = lexLine("start   CLRF    PORTB");
    expect(line.label).toBe("start");
    expect(line.mnemonic).toBe("CLRF");
    expect(line.operands).toEqual(["PORTB"]);
  });

  it("drops the ':' after a label", () => {
    const line = lexLine("loop:   GOTO loop");
    expect(line.label).toBe("loop");
    expect(line.mnemonic).toBe("GOTO");
    expect(line.operands).toEqual(["loop"]);
  });

  it("reads a label alone on its line", () => {
    const line = lexLine("done");
    expect(line.label).toBe("done");
    expect(line.mnemonic).toBeUndefined();
    expect(line.operands).toEqual([]);
  });

  it("splits several operands and trims them", () => {
    const line = lexLine("        ADDWF   COUNT ,  F");
    expect(line.operands).toEqual(["COUNT", "F"]);
  });

  it("returns no operands for an instruction without operands", () => {
    expect(lexLine("        RETURN").operands).toEqual([]);
  });

  it("keeps an expression as one operand", () => {
    const line = lexLine("        __CONFIG _XT_OSC & _WDT_OFF");
    expect(line.mnemonic).toBe("__CONFIG");
    expect(line.operands).toEqual(["_XT_OSC & _WDT_OFF"]);
  });

  it("reads EQU with its label", () => {
    const line = lexLine("COUNT   EQU     0x20");
    expect(line.label).toBe("COUNT");
    expect(line.mnemonic).toBe("EQU");
    expect(line.operands).toEqual(["0x20"]);
  });
});

describe("lexer: case", () => {
  it("uppercases the mnemonic", () => {
    expect(lexLine("        movlw 5").mnemonic).toBe("MOVLW");
  });

  it("keeps the case of labels and operands", () => {
    const line = lexLine("Loop    goto Loop");
    expect(line.label).toBe("Loop");
    expect(line.operands).toEqual(["Loop"]);
  });
});

describe("lexer: comments and quotes", () => {
  it("separates the comment", () => {
    const line = lexLine("        NOP     ; do nothing");
    expect(line.mnemonic).toBe("NOP");
    expect(line.comment).toBe("do nothing");
  });

  it("keeps comment-only lines", () => {
    const line = lexLine("; just a comment");
    expect(line.label).toBeUndefined();
    expect(line.mnemonic).toBeUndefined();
    expect(line.comment).toBe("just a comment");
  });

  it("ignores ';' and ',' inside quotes", () => {
    const line = lexLine("        DT \"a;b,c\", 'x'");
    expect(line.operands).toEqual(['"a;b,c"', "'x'"]);
    expect(line.comment).toBeUndefined();
  });

  it("keeps MPASM quoted numbers whole", () => {
    expect(lexLine("        MOVLW   H'FF' ; hex").operands).toEqual(["H'FF'"]);
  });

  it("does not split commas inside < >", () => {
    const line = lexLine("#include <P16F84A.INC>");
    expect(line.mnemonic).toBe("#INCLUDE");
    expect(line.operands).toEqual(["<P16F84A.INC>"]);
  });
});

describe("lexer: lines", () => {
  it("returns one entry per line, numbered from 1", () => {
    const { lines } = tokenize("  NOP\n\n  NOP\r\n  END");
    expect(lines.map((l) => l.line)).toEqual([1, 2, 3, 4]);
    expect(lines[1].mnemonic).toBeUndefined();
    expect(lines[3].mnemonic).toBe("END");
  });

  it("keeps the original source text", () => {
    const text = "loop    GOTO loop   ; forever";
    expect(lexLine(text).source).toBe(text);
  });
});

describe("lexer: CBLOCK", () => {
  it("puts names inside CBLOCK into operands", () => {
    const { lines } = tokenize("  CBLOCK 0x20\n    A, B\n    C:2\n  ENDC\n  NOP");
    expect(lines[0].mnemonic).toBe("CBLOCK");
    expect(lines[1].label).toBeUndefined();
    expect(lines[1].mnemonic).toBeUndefined();
    expect(lines[1].operands).toEqual(["A", "B"]);
    expect(lines[2].operands).toEqual(["C:2"]);
    expect(lines[3].mnemonic).toBe("ENDC");
    expect(lines[4].mnemonic).toBe("NOP");
  });

  it("gives no warnings for indented CBLOCK names", () => {
    const { messages } = tokenize("  CBLOCK 0x20\n    A, B\n  ENDC");
    expect(messages).toEqual([]);
  });
});

describe("lexer: warnings", () => {
  it("warns 203 for an opcode in column 1", () => {
    const { lines, messages } = tokenize("MOVLW 0xFF");
    expect(lines[0].mnemonic).toBe("MOVLW");
    expect(messages).toMatchObject([{ line: 1, severity: "warning", code: 203 }]);
  });

  it("warns 205 for a directive in column 1", () => {
    const { lines, messages } = tokenize("END");
    expect(lines[0].mnemonic).toBe("END");
    expect(messages).toMatchObject([{ code: 205 }]);
  });

  it("does not warn for #include in column 1", () => {
    expect(tokenize("#include <P16F84A.INC>").messages).toEqual([]);
  });

  it("warns 207 for an indented label", () => {
    const { lines, messages } = tokenize("    loop GOTO loop");
    expect(lines[0].label).toBe("loop");
    expect(lines[0].mnemonic).toBe("GOTO");
    expect(messages).toMatchObject([{ code: 207 }]);
  });

  it("treats an indented unknown word as a misspelled mnemonic", () => {
    const { lines, messages } = tokenize("    MOVLX 5");
    expect(lines[0].label).toBeUndefined();
    expect(lines[0].mnemonic).toBe("MOVLX");
    expect(lines[0].operands).toEqual(["5"]);
    expect(messages).toEqual([]);
  });

  it("gives no warnings for normal code", () => {
    expect(tokenize("start   MOVLW 1\n        GOTO start\n        END").messages).toEqual([]);
  });
});
