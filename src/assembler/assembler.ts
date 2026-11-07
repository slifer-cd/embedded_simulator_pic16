// Assembler: runs every stage and returns one result for the UI, the simulator and the output files.
//
//   source text -> lexer -> parser -> pass 1 (symbols) -> pass 2 (encoder) -> words

import { CONFIG_ADDRESS, CONFIG_DEFAULT, MEMORY } from "../chip/config.ts";
import { encode } from "./encoder.ts";
import type { EncodedWord } from "./encoder.ts";
import { tokenize } from "./lexer.ts";
import type { AssemblerMessage, SourceLine } from "./lexer.ts";
import { parse } from "./parser.ts";
import type { Statement } from "./parser.ts";
import { buildSymbols } from "./symbols.ts";
import type { SymbolTable } from "./symbols.ts";

export type AssemblyResult = {
  success: boolean; // true when there are no errors (warnings / messages are fine)

  // Stages (used by the .lst writer and the UI)
  lines: SourceLine[];
  statements: Statement[];
  addresses: number[]; // addresses[i] = address of statements[i]
  symbols: SymbolTable;
  words: EncodedWord[]; // every placed word, in source order

  // Memory images (used by the simulator)
  program: number[]; // 1024 words, unprogrammed = 0x3FFF
  eeprom: number[]; // 64 bytes, erased = 0xFF
  config: number; // configuration word, 0x3FFF if __CONFIG is not used

  // Messages sorted by line
  messages: AssemblerMessage[];
  errorCount: number;
  warningCount: number;
  messageCount: number;
};

export function assemble(source: string): AssemblyResult {
  const lexer = tokenize(source);
  const parser = parse(lexer.lines);
  const pass1 = buildSymbols(parser.statements);
  const pass2 = encode(parser.statements, pass1.symbols, pass1.addresses);

  // Memory images
  const program: number[] = Array.from({ length: MEMORY.PROGRAM_SIZE }, () => MEMORY.WORD_MASK);
  const eeprom: number[] = Array.from({ length: MEMORY.EEPROM_SIZE }, () => 0xff);
  let config = CONFIG_DEFAULT;

  for (const { address, value } of pass2.words) {
    if (address < MEMORY.PROGRAM_SIZE) {
      program[address] = value;
    } else if (address === CONFIG_ADDRESS) {
      config = value;
    } else if (
      address >= MEMORY.EEPROM_START &&
      address < MEMORY.EEPROM_START + MEMORY.EEPROM_SIZE
    ) {
      eeprom[address - MEMORY.EEPROM_START] = value & 0xff;
    }
  }

  // All messages, sorted by line (sort is stable, so same-line messages keep their stage order)
  const messages = [
    ...lexer.messages,
    ...parser.messages,
    ...pass1.messages,
    ...pass2.messages,
  ].sort((a, b) => a.line - b.line);

  const count = (severity: AssemblerMessage["severity"]) =>
    messages.filter((m) => m.severity === severity).length;
  const errorCount = count("error");

  return {
    success: errorCount === 0,
    lines: lexer.lines,
    statements: parser.statements,
    addresses: pass1.addresses,
    symbols: pass1.symbols,
    words: pass2.words,
    program,
    eeprom,
    config,
    messages,
    errorCount,
    warningCount: count("warning"),
    messageCount: count("message"),
  };
}
