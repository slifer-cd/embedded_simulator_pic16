// Pass 2: turn every instruction and data directive into 14-bit words.
//
// Pass 1 already gave every statement its address and built the symbol table,
// so forward references ("GOTO skip") can be resolved here.

import { CONFIG_ADDRESS, MEMORY } from "../chip/config.ts";
import type { Instruction } from "../chip/instructions.ts";
import { evaluate } from "./expressions.ts";
import type { AssemblerMessage } from "./lexer.ts";
import type { Statement } from "./parser.ts";
import type { SymbolTable } from "./symbols.ts";

export type EncodedWord = {
  address: number;
  value: number; // 14-bit word
  line: number; // source line that produced it
};

export type Pass2Result = {
  words: EncodedWord[]; // in source order
  messages: AssemblerMessage[];
};

// Where words may be placed (word addresses)
const VALID_RANGES: [number, number, string][] = [
  [0, MEMORY.PROGRAM_SIZE - 1, "program memory"],
  [MEMORY.ID_START, MEMORY.ID_START + MEMORY.ID_COUNT - 1, "ID locations"],
  [CONFIG_ADDRESS, CONFIG_ADDRESS, "configuration word"],
  [MEMORY.EEPROM_START, MEMORY.EEPROM_START + MEMORY.EEPROM_SIZE - 1, "data EEPROM"],
];

function isValidAddress(address: number): boolean {
  return VALID_RANGES.some(([start, end]) => address >= start && address <= end);
}

export function encode(
  statements: Statement[],
  symbols: SymbolTable,
  addresses: number[],
): Pass2Result {
  const words: EncodedWord[] = [];
  const messages: AssemblerMessage[] = [];
  const used = new Map<number, number>(); // address -> line, to find overlaps

  const report = (
    severity: AssemblerMessage["severity"],
    line: number,
    text: string,
    code?: number,
  ) => messages.push({ line, severity, code, text });

  const lookup = (name: string) => symbols.get(name)?.value;

  // Evaluate an operand; undefined on error (already reported)
  const evalOperand = (text: string, line: number, address: number): number | undefined => {
    const result = evaluate(text, lookup, { currentAddress: address });
    if (!result.ok) {
      report("error", line, result.error, result.code);
      return undefined;
    }
    return result.value;
  };

  // Keep a value inside [min, max]; outside -> warning 202 and keep only the low bits
  const fit = (value: number, min: number, max: number, mask: number, line: number): number => {
    if (value < min || value > max) {
      report(
        "warning",
        line,
        `Argument out of range. Least significant bits used. (${value})`,
        202,
      );
    }
    return value & mask;
  };

  // File register operand: 7 bits in the instruction, bank 1 addresses give message 302
  const fileRegister = (value: number, line: number): number => {
    if (value < 0 || value > 0xff) return fit(value, 0, 0x7f, 0x7f, line);
    if (value > 0x7f) {
      report(
        "message",
        line,
        "Register in operand not in bank 0. Ensure that bank bits are correct.",
        302,
      );
    }
    return value & 0x7f;
  };

  const place = (address: number, value: number, line: number) => {
    if (!isValidAddress(address)) {
      report(
        "error",
        line,
        `Address 0x${address.toString(16).toUpperCase()} is outside the PIC16F84A memory.`,
      );
      return;
    }
    if (used.has(address)) {
      report(
        "error",
        line,
        `Overwriting previous address contents. (0x${address.toString(16).toUpperCase()})`,
        118,
      );
      return;
    }
    used.set(address, line);
    words.push({ address, value: value & MEMORY.WORD_MASK, line });
  };

  const encodeInstruction = (
    instruction: Instruction,
    operands: string[],
    line: number,
    address: number,
  ) => {
    const values: number[] = [];
    for (const operand of operands) {
      const value = evalOperand(operand, line, address);
      if (value === undefined) return; // error already reported
      values.push(value);
    }

    let word = instruction.opcode;

    switch (instruction.operands) {
      case "fd": {
        const f = fileRegister(values[0], line);
        const d = values[1];
        if (d !== 0 && d !== 1) {
          report("error", line, `Destination must be W (0) or F (1). (${operands[1]})`);
          return;
        }
        word |= (d << 7) | f;
        break;
      }
      case "f": {
        word |= fileRegister(values[0], line);
        break;
      }
      case "fb": {
        const f = fileRegister(values[0], line);
        const b = fit(values[1], 0, 7, 0x07, line);
        word |= (b << 7) | f;
        break;
      }
      case "k8": {
        word |= fit(values[0], -128, 0xff, 0xff, line);
        break;
      }
      case "k11": {
        const k = fit(values[0], 0, 0x7ff, 0x7ff, line);
        if (k >= MEMORY.PROGRAM_SIZE) {
          report(
            "warning",
            line,
            `Address 0x${k.toString(16).toUpperCase()} is beyond program memory (1K).`,
          );
        }
        word |= k;
        break;
      }
      case "none":
        break;
    }

    place(address, word, line);
  };

  statements.forEach((statement, index) => {
    const address = addresses[index];
    const { line } = statement;

    if (statement.kind === "instruction") {
      encodeInstruction(statement.instruction, statement.operands, line, address);
      return;
    }

    if (statement.kind !== "directive") return;

    switch (statement.directive) {
      case "__CONFIG": {
        const value = evalOperand(statement.operands[0], line, address);
        if (value !== undefined) place(CONFIG_ADDRESS, fit(value, 0, 0x3fff, 0x3fff, line), line);
        break;
      }

      case "DE": {
        // One word per byte; strings give one word per character
        let next = address;
        for (const operand of statement.operands) {
          const isString = operand.length >= 2 && operand.startsWith('"') && operand.endsWith('"');
          if (isString) {
            for (const ch of operand.slice(1, -1)) place(next++, ch.charCodeAt(0) & 0xff, line);
          } else {
            const value = evalOperand(operand, line, next);
            if (value !== undefined) place(next, fit(value, -128, 0xff, 0xff, line), line);
            next++;
          }
        }
        break;
      }

      default:
        break; // ORG, EQU, CBLOCK, ENDC, LIST, ... were handled in pass 1
    }
  });

  return { words, messages };
}
