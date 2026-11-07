// Syntax highlighting for the code editor.
//
// Each line is split into coloured pieces using the assembler's own lexer (tokenize):
// it decides what is a label, a mnemonic and the operands, with MPASM's column-1 rules,
// so the colours always match how the assembler reads the line. The pieces are then
// found again in the line text, in the same order the lexer reads them.
// Joining all pieces of a line gives back exactly the original text.

import { DIRECTIVES, findComment, tokenize } from "../assembler/lexer.ts";
import { builtinSymbols } from "../assembler/symbols.ts";
import { INSTRUCTION_BY_NAME } from "../chip/instructions.ts";

export type TokenKind =
  | "comment"
  | "label"
  | "instruction"
  | "directive"
  | "number"
  | "string"
  | "builtin" // registers, bits, W / F, config symbols (P16F84A.INC names)
  | "symbol"; // the program's own names

export type Token = { text: string; kind?: TokenKind }; // no kind = plain (spaces, commas, ...)

const BUILTINS = new Set(builtinSymbols().keys());

// Operand pieces, tried in this order at each position:
//   radix literal  B'0101'  H'1F'  D'20'  O'17'  A'x'
//   string         "text"  'c'  <P16F84A.INC>
//   hex            0x1F
//   decimal        .20
//   number         20  1Fh (MPASM default radix: hex)
//   name           STATUS  loop  $
//   anything else  one character (operators, commas, spaces)
const OPERAND_PIECE =
  /([BbHhDdOoAa]'[^']*'?)|("[^"]*"?|'[^']*'?|<[^>]*>?)|(0[xX][0-9A-Fa-f]+)|(\.\d+)|(\d[0-9A-Fa-f]*[hH]?\b)|([A-Za-z_?$][A-Za-z0-9_?]*)|(\s+|.)/g;

function operandTokens(text: string, nameKind?: TokenKind): Token[] {
  const tokens: Token[] = [];
  for (const m of text.matchAll(OPERAND_PIECE)) {
    const piece = m[0];
    if (m[1] || m[3] || m[4] || m[5]) tokens.push({ text: piece, kind: "number" });
    else if (m[2]) tokens.push({ text: piece, kind: "string" });
    else if (m[6]) {
      const kind: TokenKind =
        piece === "$" ? "number" : (nameKind ?? (BUILTINS.has(piece) ? "builtin" : "symbol"));
      tokens.push({ text: piece, kind });
    } else tokens.push({ text: piece });
  }
  return tokens;
}

// Take the next word (and the spaces before it) off the front of "rest"
function takeWord(rest: string): { spaces: string; word: string; after: string } {
  const match = /^(\s*)(\S*)/.exec(rest)!;
  return { spaces: match[1], word: match[2], after: rest.slice(match[0].length) };
}

export function highlight(code: string): Token[][] {
  const { lines } = tokenize(code);
  return code.split("\n").map((text, i) => {
    const line = lines[i];
    const tokens: Token[] = [];
    const commentAt = findComment(text);
    let rest = commentAt === -1 ? text : text.slice(0, commentAt);
    const comment = commentAt === -1 ? "" : text.slice(commentAt);

    if (line && (line.label !== undefined || line.mnemonic !== undefined)) {
      if (line.label !== undefined) {
        const { spaces, word, after } = takeWord(rest);
        tokens.push({ text: spaces }, { text: word, kind: "label" });
        rest = after;
      }
      if (line.mnemonic !== undefined) {
        const { spaces, word, after } = takeWord(rest);
        const upper = word.toUpperCase();
        const kind: TokenKind | undefined = INSTRUCTION_BY_NAME.has(upper)
          ? "instruction"
          : DIRECTIVES.has(upper)
            ? "directive"
            : undefined; // unknown (misspelled) mnemonic: left plain
        tokens.push({ text: spaces }, { text: word, kind });
        rest = after;
      }
      tokens.push(...operandTokens(rest));
    } else if (line && line.operands.length > 0) {
      tokens.push(...operandTokens(rest, "label")); // CBLOCK body: the names it defines
    } else {
      tokens.push({ text: rest });
    }

    if (comment) tokens.push({ text: comment, kind: "comment" });
    return tokens.filter((t) => t.text !== "");
  });
}
