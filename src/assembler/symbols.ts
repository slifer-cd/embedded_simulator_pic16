// Pass 1: walk the statements, give every statement its address and build the symbol table.
//
// Pass 1 does not produce machine code. It only finds:
//   - where each instruction goes (the address counter, changed by ORG)
//   - the value of every name (labels, EQU constants, CBLOCK names, built-in names)
// so that pass 2 can encode forward references like "GOTO skip".

import { CONFIG_SYMBOLS } from "../chip/config.ts";
import { BIT_BY_NAME, DESTINATIONS, REGISTERS } from "../chip/registers.ts";
import { evaluate } from "./expressions.ts";
import type { AssemblerMessage } from "./lexer.ts";
import type { Statement } from "./parser.ts";

export type SymbolKind = "builtin" | "label" | "equ" | "cblock";

export type SymbolInfo = {
  value: number;
  kind: SymbolKind;
  line?: number; // where it was defined (not set for built-in names)
};

export type SymbolTable = Map<string, SymbolInfo>;

export type Pass1Result = {
  symbols: SymbolTable;
  addresses: number[]; // addresses[i] = address of statements[i]
  messages: AssemblerMessage[];
};

const NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_?]*$/;

// Names that are known without being defined in the source
// (same names P16F84A.INC gives: registers, bits, W/F, config symbols).
export function builtinSymbols(): SymbolTable {
  const symbols: SymbolTable = new Map();
  const add = (name: string, value: number) => symbols.set(name, { value, kind: "builtin" });

  for (const reg of REGISTERS) add(reg.name, reg.address);
  for (const [name, bit] of BIT_BY_NAME) add(name, bit);
  for (const [name, value] of Object.entries(DESTINATIONS)) add(name, value);
  for (const [name, value] of CONFIG_SYMBOLS) add(name, value);

  return symbols;
}

// How many program words a DE directive takes: one per byte, strings give one per character.
function countDataWords(operands: string[]): number {
  let words = 0;
  for (const operand of operands) {
    const isString = operand.length >= 2 && operand.startsWith('"') && operand.endsWith('"');
    words += isString ? operand.length - 2 : 1;
  }
  return words;
}

export function buildSymbols(statements: Statement[]): Pass1Result {
  const symbols = builtinSymbols();
  const addresses: number[] = [];
  const messages: AssemblerMessage[] = [];

  let address = 0; // address counter
  let inCblock = false;
  let cblockAddress = 0; // next CBLOCK address (CBLOCK without operand continues from here)

  const error = (line: number, text: string, code?: number) =>
    messages.push({ line, severity: "error", code, text });

  const lookup = (name: string) => symbols.get(name)?.value;

  // Evaluate an expression that must be known now (ORG, EQU, CBLOCK)
  const evalNow = (text: string, line: number): number | undefined => {
    const result = evaluate(text, lookup, { currentAddress: address });
    if (!result.ok) {
      error(line, result.error, result.code);
      return undefined;
    }
    return result.value;
  };

  const define = (name: string, value: number, kind: SymbolKind, line: number) => {
    if (symbols.has(name)) {
      error(line, `Duplicate label. (${name})`, 115);
      return;
    }
    symbols.set(name, { value, kind, line });
  };

  for (const statement of statements) {
    const { line } = statement;

    switch (statement.kind) {
      case "label": {
        addresses.push(address);
        define(statement.label, address, "label", line);
        break;
      }

      case "instruction": {
        addresses.push(address);
        if (statement.label !== undefined) define(statement.label, address, "label", line);
        address += 1; // every instruction is one 14-bit word
        break;
      }

      case "cblock-names": {
        addresses.push(address);
        if (!inCblock) {
          error(line, "Names found outside CBLOCK.");
          break;
        }
        for (const entry of statement.names) {
          // "NAME" or "NAME:size"
          const colon = entry.indexOf(":");
          const name = (colon === -1 ? entry : entry.slice(0, colon)).trim();
          let size = 1;

          if (!NAME_PATTERN.test(name)) {
            error(line, `Illegal name in CBLOCK. (${entry})`);
            continue;
          }
          if (colon !== -1) {
            const value = evalNow(entry.slice(colon + 1), line);
            if (value === undefined) continue;
            if (value < 0) {
              error(line, `CBLOCK size cannot be negative. (${entry})`);
              continue;
            }
            size = value;
          }

          define(name, cblockAddress, "cblock", line);
          cblockAddress += size;
        }
        break;
      }

      case "directive": {
        const { directive, operands, label } = statement;

        switch (directive) {
          case "ORG": {
            const value = evalNow(operands[0], line);
            if (value !== undefined) {
              if (value < 0) error(line, `ORG address cannot be negative. (${operands[0]})`);
              else address = value;
            }
            addresses.push(address);
            if (label !== undefined) define(label, address, "label", line); // label gets the new address
            break;
          }

          case "EQU": {
            addresses.push(address);
            const value = evalNow(operands[0], line);
            if (value !== undefined) define(label!, value, "equ", line);
            break;
          }

          case "CBLOCK": {
            addresses.push(address);
            if (inCblock) {
              error(line, "CBLOCK inside CBLOCK.");
              break;
            }
            inCblock = true;
            if (operands.length === 1) {
              const value = evalNow(operands[0], line);
              if (value !== undefined) cblockAddress = value;
            }
            if (label !== undefined) define(label, address, "label", line);
            break;
          }

          case "ENDC": {
            addresses.push(address);
            if (!inCblock) error(line, "ENDC without CBLOCK.");
            inCblock = false;
            if (label !== undefined) define(label, address, "label", line);
            break;
          }

          case "DE": {
            addresses.push(address);
            if (label !== undefined) define(label, address, "label", line);
            address += countDataWords(operands);
            break;
          }

          default: {
            // __CONFIG, LIST, PROCESSOR, #INCLUDE, END: no effect on the address
            addresses.push(address);
            if (label !== undefined) define(label, address, "label", line);
            break;
          }
        }
        break;
      }
    }
  }

  if (inCblock) {
    const lastLine = statements.length > 0 ? statements[statements.length - 1].line : 1;
    error(lastLine, "CBLOCK without ENDC.");
  }

  return { symbols, addresses, messages };
}
