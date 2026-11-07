// Lexer: splits each source line into label / mnemonic / operands / comment.
// It does not check if instructions or operands are valid (that is the parser's job).

import { INSTRUCTION_BY_NAME } from "../chip/instructions.ts";

export type Severity = "error" | "warning" | "message";

export type AssemblerMessage = {
  line: number;
  severity: Severity;
  code?: number; // MPASM message number, e.g. 203 (only when it matches an MPASM message)
  text: string;
};

export type SourceLine = {
  line: number; // 1-based
  label?: string;
  mnemonic?: string; // always uppercase
  operands: string[];
  comment?: string;
  source: string; // the original line
};

export type LexerResult = {
  lines: SourceLine[];
  messages: AssemblerMessage[];
};

// Assembler directives (uppercase). Recognising a name here does not mean it is supported yet.
export const DIRECTIVES = new Set([
  "ORG",
  "EQU",
  "SET",
  "END",
  "__CONFIG",
  "__IDLOCS",
  "LIST",
  "NOLIST",
  "PROCESSOR",
  "RADIX",
  "ERRORLEVEL",
  "#INCLUDE",
  "INCLUDE",
  "#DEFINE",
  "#UNDEFINE",
  "CBLOCK",
  "ENDC",
  "DE",
  "DT",
  "DW",
  "DATA",
  "RES",
  "CONSTANT",
  "VARIABLE",
  "BANKSEL",
  "PAGESEL",
  "IF",
  "ELSE",
  "ENDIF",
  "IFDEF",
  "IFNDEF",
  "MACRO",
  "ENDM",
  "LOCAL",
  "EXITM",
  "MESSG",
  "ERROR",
  "TITLE",
  "SUBTITLE",
  "SPACE",
  "PAGE",
]);

function isInstruction(word: string): boolean {
  return INSTRUCTION_BY_NAME.has(word.toUpperCase());
}

function isDirective(word: string): boolean {
  return DIRECTIVES.has(word.toUpperCase());
}

// Find the first ";" that is not inside quotes. Returns -1 if there is none.
// (Also used by the editor's syntax highlighting, so both split lines the same way.)
export function findComment(text: string): number {
  let quote = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === quote) quote = "";
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === ";") {
      return i;
    }
  }
  return -1;
}

// Split operands on commas, but not commas inside quotes or < >.
function splitOperands(text: string): string[] {
  if (text.trim() === "") return [];

  const operands: string[] = [];
  let current = "";
  let quote = "";
  let angle = false;

  for (const ch of text) {
    if (quote) {
      if (ch === quote) quote = "";
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === "<") {
      angle = true;
    } else if (ch === ">") {
      angle = false;
    } else if (ch === "," && !angle) {
      operands.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  operands.push(current.trim());
  return operands;
}

// Take the first word off the front of the text: returns [word, rest].
function firstWord(text: string): [string, string] {
  const trimmed = text.trimStart();
  const match = /^\S+/.exec(trimmed);
  if (!match) return ["", ""];
  return [match[0], trimmed.slice(match[0].length)];
}

// True when the text after an indented unknown word does not start with an instruction/directive.
function isMisspelledMnemonic(rest: string): boolean {
  const [next] = firstWord(rest);
  return next !== "" && !isInstruction(next) && !isDirective(next);
}

export function tokenize(source: string): LexerResult {
  const lines: SourceLine[] = [];
  const messages: AssemblerMessage[] = [];
  let inCblock = false;

  source.split(/\r?\n/).forEach((text, index) => {
    const lineNumber = index + 1;
    const result: SourceLine = { line: lineNumber, operands: [], source: text };
    lines.push(result);

    const warn = (code: number, message: string) =>
      messages.push({ line: lineNumber, severity: "warning", code, text: message });

    // 1. Comment
    let code = text;
    const commentStart = findComment(text);
    if (commentStart !== -1) {
      code = text.slice(0, commentStart);
      result.comment = text.slice(commentStart + 1).trim();
    }

    // 2. Blank or comment-only line
    if (code.trim() === "") return;

    const [word, rest] = firstWord(code);

    // 3. Inside CBLOCK ... ENDC the lines are just names: "COUNT, TEMP"
    //    (END also ends it, so a missing ENDC does not swallow END)
    if (inCblock) {
      const upper = word.toUpperCase();
      if (upper === "ENDC") {
        inCblock = false;
        result.mnemonic = "ENDC";
        return;
      }
      if (upper !== "END") {
        result.operands = splitOperands(code);
        return;
      }
      inCblock = false; // END: handle it as a normal line below
    }

    // 4. Label or mnemonic?
    const inColumn1 = code[0] !== " " && code[0] !== "\t";
    let afterLabel = "";

    if (word.endsWith(":")) {
      result.label = word.slice(0, -1);
      afterLabel = rest;
    } else if (isInstruction(word) || isDirective(word)) {
      result.mnemonic = word.toUpperCase();
      result.operands = splitOperands(rest);
      if (inColumn1 && !word.startsWith("#")) {
        if (isInstruction(word)) warn(203, `Found opcode in column 1. (${word})`);
        else warn(205, `Found directive in column 1. (${word})`);
      }
    } else if (!inColumn1 && isMisspelledMnemonic(rest)) {
      // Indented unknown word followed by something that is not a mnemonic:
      // most likely a misspelled instruction ("    MOVLX 5"), not a label.
      result.mnemonic = word.toUpperCase();
      result.operands = splitOperands(rest);
    } else {
      result.label = word;
      afterLabel = rest;
      if (!inColumn1) warn(207, `Found label after column 1. (${word})`);
    }

    // 5. After a label: the next word is the mnemonic
    if (result.label !== undefined) {
      const [mnemonic, operands] = firstWord(afterLabel);
      if (mnemonic) {
        result.mnemonic = mnemonic.toUpperCase();
        result.operands = splitOperands(operands);
      }
    }

    if (result.mnemonic === "CBLOCK") inCblock = true;
  });

  return { lines, messages };
}
