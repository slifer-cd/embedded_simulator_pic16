import { describe, expect, it } from "vite-plus/test";
import { assemble } from "../src/assembler/assembler.ts";
import { disassemble } from "../src/chip/disassembler.ts";
import { INSTRUCTIONS } from "../src/chip/instructions.ts";

describe("disassembler", () => {
  it("shows each operand form with numbers", () => {
    expect(disassemble(0x07a0)).toBe("ADDWF 0x20, F");
    expect(disassemble(0x080c)).toBe("MOVF 0x0C, W");
    expect(disassemble(0x01a1)).toBe("CLRF 0x21");
    expect(disassemble(0x1683)).toBe("BSF 0x03, 5");
    expect(disassemble(0x30ff)).toBe("MOVLW 0xFF");
    expect(disassemble(0x2805)).toBe("GOTO 0x005");
    expect(disassemble(0x0008)).toBe("RETURN");
  });

  it("shows a word that is no instruction as DW", () => {
    expect(disassemble(0x0001)).toBe("DW 0x0001");
  });

  it("names every instruction of the table", () => {
    for (const instruction of INSTRUCTIONS) {
      expect(disassemble(instruction.opcode).split(" ")[0]).toBe(instruction.mnemonic);
    }
  });

  it("gives back what the assembler encoded", () => {
    const lines = [
      "ADDWF 0x20, W",
      "DECFSZ 0x0C, F",
      "SWAPF 0x03, W",
      "MOVWF 0x06",
      "BCF 0x0B, 7",
      "BTFSC 0x03, 0",
      "ANDLW 0x0F",
      "RETLW 0x3F",
      "CALL 0x123",
      "CLRWDT",
    ];
    const result = assemble(`${lines.map((l) => `        ${l}`).join("\n")}\n        END`);
    expect(result.success).toBe(true);
    expect(result.words.map((w) => disassemble(w.value))).toEqual(lines);
  });
});
