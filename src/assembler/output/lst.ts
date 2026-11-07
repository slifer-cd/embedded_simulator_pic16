// .lst writer: the listing file, laid out like MPASM's.
//
//   LOC  OBJECT CODE     LINE SOURCE TEXT
//     VALUE
//
//                         00001         LIST    P=16F84A
//     00000020            00002 COUNT   EQU     0x20
//   0000                  00003         ORG     0
//   0000   1683           00004         BSF     STATUS, RP0
//   Message[302]: Register in operand not in bank 0. Ensure that bank bits are correct.
//   0001   0186           00005         CLRF    TRISB
//
// followed by the symbol table, the program memory usage map and the totals.

import type { AssemblyResult } from "../assembler.ts";
import type { EncodedWord } from "../encoder.ts";
import type { AssemblerMessage } from "../lexer.ts";
import type { Statement } from "../parser.ts";
import { MEMORY } from "../../chip/config.ts";
import { messageTag } from "./err.ts";

const PREFIX_WIDTH = 22; // LOC + OBJECT CODE columns
const MAP_ROW = 64; // words per row in the memory usage map

// 0x1f -> "001F"
function hex(value: number, digits: number): string {
  return value.toString(16).toUpperCase().padStart(digits, "0");
}

// The LOC / OBJECT CODE / VALUE part in front of a source line
function linePrefix(
  statement: Statement | undefined,
  address: number | undefined,
  words: EncodedWord[],
  result: AssemblyResult,
): string {
  // Code or data: "0004   1683" (several words for DE: "2100   0001 0002 0003")
  if (words.length > 0) {
    return `${hex(words[0].address, 4)}   ${words.map((w) => hex(w.value, 4)).join(" ")}`;
  }
  if (!statement || address === undefined) return "";

  switch (statement.kind) {
    case "instruction":
    case "label":
      return hex(address, 4);

    case "cblock-names": {
      // value of the first name on the line
      const name = statement.names[0]?.split(":")[0].trim();
      const value = name ? result.symbols.get(name)?.value : undefined;
      return value === undefined ? "" : `  ${hex(value, 8)}`;
    }

    case "directive": {
      if (statement.directive === "ORG") return hex(address, 4);
      if (statement.directive === "EQU" && statement.label) {
        const value = result.symbols.get(statement.label)?.value;
        return value === undefined ? "" : `  ${hex(value, 8)}`;
      }
      return "";
    }
  }
}

function symbolTable(result: AssemblyResult): string[] {
  const userSymbols = [...result.symbols].filter(([, s]) => s.kind !== "builtin");
  userSymbols.sort(([a], [b]) => a.localeCompare(b));

  const lines = ["SYMBOL TABLE", `  ${"LABEL".padEnd(32)}  VALUE`, ""];
  for (const [name, symbol] of userSymbols) {
    lines.push(`${name.padEnd(34)}${hex(symbol.value, 8)}`);
  }
  return lines;
}

function memoryMap(result: AssemblyResult): string[] {
  const used = new Set(
    result.words.filter((w) => w.address < MEMORY.PROGRAM_SIZE).map((w) => w.address),
  );
  const lines = ["MEMORY USAGE MAP ('X' = Used,  '-' = Unused)", ""];

  for (let row = 0; row < MEMORY.PROGRAM_SIZE; row += MAP_ROW) {
    let rowHasCode = false;
    const groups: string[] = [];
    for (let group = row; group < row + MAP_ROW; group += 16) {
      let text = "";
      for (let address = group; address < group + 16; address++) {
        const isUsed = used.has(address);
        if (isUsed) rowHasCode = true;
        text += isUsed ? "X" : "-";
      }
      groups.push(text);
    }
    if (rowHasCode) lines.push(`${hex(row, 4)} : ${groups.join(" ")}`);
  }

  if (used.size === 0) lines.push("No program memory used.");
  lines.push("", "All other memory blocks unused.", "");
  lines.push(`Program Memory Words Used: ${String(used.size).padStart(5)}`);
  lines.push(`Program Memory Words Free: ${String(MEMORY.PROGRAM_SIZE - used.size).padStart(5)}`);
  return lines;
}

export function generateLst(result: AssemblyResult, fileName: string, date = new Date()): string {
  const out: string[] = [];

  // Header
  out.push(`PIC16F84A Simulator assembler listing    ${fileName}    ${date.toLocaleString()}`, "");
  out.push("LOC  OBJECT CODE     LINE SOURCE TEXT", "  VALUE", "");

  // Index everything by source line
  const statementByLine = new Map<number, { statement: Statement; address: number }>();
  result.statements.forEach((statement, index) => {
    statementByLine.set(statement.line, { statement, address: result.addresses[index] });
  });

  const wordsByLine = new Map<number, EncodedWord[]>();
  for (const word of result.words) {
    const list = wordsByLine.get(word.line) ?? [];
    list.push(word);
    wordsByLine.set(word.line, list);
  }

  const messagesByLine = new Map<number, AssemblerMessage[]>();
  for (const message of result.messages) {
    const list = messagesByLine.get(message.line) ?? [];
    list.push(message);
    messagesByLine.set(message.line, list);
  }

  // Stop after the END line (the assembler ignores everything after it)
  const endStatement = result.statements.find(
    (s) => s.kind === "directive" && s.directive === "END",
  );
  const lastLine = endStatement ? endStatement.line : result.lines.length;

  // Source lines
  for (const sourceLine of result.lines) {
    if (sourceLine.line > lastLine) break;

    // Messages go right above the line they belong to
    for (const message of messagesByLine.get(sourceLine.line) ?? []) {
      out.push(`${messageTag(message)}: ${message.text}`);
    }

    const entry = statementByLine.get(sourceLine.line);
    const prefix = linePrefix(
      entry?.statement,
      entry?.address,
      wordsByLine.get(sourceLine.line) ?? [],
      result,
    );
    const lineNumber = String(sourceLine.line).padStart(5, "0");
    out.push(`${prefix.padEnd(PREFIX_WIDTH - 1)} ${lineNumber} ${sourceLine.source}`);
  }

  // Messages on lines after END (e.g. "Expected (END)" on the last line)
  for (const message of result.messages) {
    if (message.line > lastLine) out.push(`${messageTag(message)}: ${message.text}`);
  }

  // Symbol table, memory map, totals
  out.push("", ...symbolTable(result), "", ...memoryMap(result), "");
  out.push(`Errors   : ${String(result.errorCount).padStart(5)}`);
  out.push(`Warnings : ${String(result.warningCount).padStart(5)} reported`);
  out.push(`Messages : ${String(result.messageCount).padStart(5)} reported`);

  return `${out.join("\r\n")}\r\n`;
}
