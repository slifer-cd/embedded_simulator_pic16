// Parser: turns the lexer's lines into statements and checks their shape.
//
// It checks: known mnemonic, operand count, label names, supported directives, END.
// It does NOT evaluate expressions or look up symbols (that is pass 1 / pass 2).

import { INSTRUCTION_BY_NAME } from "../chip/instructions.ts";
import type { Instruction, OperandFormat } from "../chip/instructions.ts";
import { DIRECTIVES } from "./lexer.ts";
import type { AssemblerMessage, SourceLine } from "./lexer.ts";

export type Statement =
  | {
      kind: "instruction";
      line: number;
      label?: string;
      instruction: Instruction;
      operands: string[];
    }
  | { kind: "directive"; line: number; label?: string; directive: string; operands: string[] }
  | { kind: "label"; line: number; label: string } // a label alone on its line
  | { kind: "cblock-names"; line: number; names: string[] }; // names inside CBLOCK ... ENDC

export type ParserResult = {
  statements: Statement[];
  messages: AssemblerMessage[];
};

// Directives this assembler handles. Other known directives give an error.
const SUPPORTED_DIRECTIVES = new Set([
  "ORG",
  "EQU",
  "END",
  "__CONFIG",
  "CBLOCK",
  "ENDC",
  "DE",
  "LIST",
  "PROCESSOR",
  "#INCLUDE",
  "INCLUDE",
]);

// How many operands each instruction format takes: [min, max]
const OPERAND_COUNT: Record<OperandFormat, [number, number]> = {
  fd: [1, 2], // d can be left out (defaults to f)
  f: [1, 1],
  fb: [2, 2],
  k8: [1, 1],
  k11: [1, 1],
  none: [0, 0],
};

// Directive operand counts: [min, max]
const DIRECTIVE_OPERAND_COUNT: Record<string, [number, number]> = {
  ORG: [1, 1],
  EQU: [1, 1],
  END: [0, 0],
  __CONFIG: [1, 1],
  CBLOCK: [0, 1],
  ENDC: [0, 0],
  DE: [1, Infinity],
  LIST: [0, Infinity],
  PROCESSOR: [1, 1],
  "#INCLUDE": [1, 1],
  INCLUDE: [1, 1],
};

const LABEL_PATTERN = /^[A-Za-z_][A-Za-z0-9_?]*$/;
const MAX_LABEL_LENGTH = 32;

export function parse(lines: SourceLine[]): ParserResult {
  const statements: Statement[] = [];
  const messages: AssemblerMessage[] = [];
  let foundEnd = false;

  const error = (line: number, text: string, code?: number) =>
    messages.push({ line, severity: "error", code, text });
  const message = (line: number, text: string, code?: number) =>
    messages.push({ line, severity: "message", code, text });

  for (const src of lines) {
    const { line, label, mnemonic, operands } = src;

    // Names inside CBLOCK: no label, no mnemonic, only operands
    if (label === undefined && mnemonic === undefined) {
      if (operands.length > 0) statements.push({ kind: "cblock-names", line, names: operands });
      continue;
    }

    // Label name check
    if (label !== undefined) {
      if (!LABEL_PATTERN.test(label)) {
        error(line, `Illegal label name. (${label})`);
        continue;
      }
      if (label.length > MAX_LABEL_LENGTH) {
        error(line, `Label is longer than ${MAX_LABEL_LENGTH} characters. (${label})`);
        continue;
      }
    }

    // Label alone on its line
    if (mnemonic === undefined) {
      statements.push({ kind: "label", line, label: label! });
      continue;
    }

    // Instruction
    const instruction = INSTRUCTION_BY_NAME.get(mnemonic);
    if (instruction) {
      const [min, max] = OPERAND_COUNT[instruction.operands];
      if (operands.length < min) {
        error(line, `Missing argument(s). (${mnemonic})`, 128);
        continue;
      }
      if (operands.length > max) {
        error(line, `Too many arguments. (${mnemonic})`);
        continue;
      }

      const finalOperands = [...operands];
      if (instruction.operands === "fd" && operands.length === 1) {
        finalOperands.push("1");
        message(line, "Using default destination of 1 (file).", 305);
      }

      statements.push({ kind: "instruction", line, label, instruction, operands: finalOperands });
      continue;
    }

    // Directive
    if (DIRECTIVES.has(mnemonic)) {
      if (!SUPPORTED_DIRECTIVES.has(mnemonic)) {
        error(line, `Directive not supported yet. (${mnemonic})`);
        continue;
      }

      const [min, max] = DIRECTIVE_OPERAND_COUNT[mnemonic];
      if (operands.length < min) {
        error(line, `Missing argument(s). (${mnemonic})`, 128);
        continue;
      }
      if (operands.length > max) {
        error(line, `Too many arguments. (${mnemonic})`);
        continue;
      }

      if (mnemonic === "EQU" && label === undefined) {
        error(line, "EQU needs a label. (e.g. COUNT EQU 0x20)");
        continue;
      }

      statements.push({ kind: "directive", line, label, directive: mnemonic, operands });

      if (mnemonic === "END") {
        foundEnd = true;
        break; // everything after END is ignored
      }
      continue;
    }

    // Unknown mnemonic
    error(line, `Illegal opcode. (${mnemonic})`, 122);
  }

  if (!foundEnd) {
    const lastLine = lines.length > 0 ? lines[lines.length - 1].line : 1;
    error(lastLine, "Expected (END)", 129);
  }

  return { statements, messages };
}
