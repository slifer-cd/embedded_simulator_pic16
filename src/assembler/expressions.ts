// Expression evaluator: turns operand text like "0x20", "H'FF'", "COUNT+1"
// or "_XT_OSC & _WDT_OFF" into a number.
//
// Numbers (MPASM style):
//   0x1F  H'1F'  1Fh     hexadecimal
//   D'31' .31            decimal
//   B'00011111'          binary
//   O'37'                octal
//   'A'  A'A'            character (ASCII code)
//   1F                   no prefix -> default radix (hex, like MPASM)
//   $                    current address
//
// Operators, lowest to highest precedence:
//   ||   &&   |   ^   &   == !=   < <= > >=   << >>   + -   * / %
// Unary: - ~ !  HIGH LOW UPPER     Parentheses: ( )

export type EvalResult = { ok: true; value: number } | { ok: false; error: string; code?: number };

export type EvalOptions = {
  radix?: number; // default radix for plain numbers (MPASM default: 16)
  currentAddress?: number; // value of $
};

export type SymbolLookup = (name: string) => number | undefined;

type Token =
  | { type: "number"; value: number }
  | { type: "name"; name: string }
  | { type: "op"; op: string };

class ExpressionError extends Error {
  code?: number;
  constructor(message: string, code?: number) {
    super(message);
    this.code = code;
  }
}

// ---------- Numbers ----------

const DIGITS: Record<number, RegExp> = {
  2: /^[01]+$/,
  8: /^[0-7]+$/,
  10: /^[0-9]+$/,
  16: /^[0-9A-Fa-f]+$/,
};

function parseNumber(digits: string, radix: number, original: string): number {
  if (!DIGITS[radix].test(digits)) throw new ExpressionError(`Illegal number. (${original})`);
  return parseInt(digits, radix);
}

const QUOTED_RADIX: Record<string, number> = { H: 16, D: 10, B: 2, O: 8 };

// ---------- Tokenizer ----------

const OPERATORS = [
  "<<",
  ">>",
  "<=",
  ">=",
  "==",
  "!=",
  "&&",
  "||",
  "+",
  "-",
  "*",
  "/",
  "%",
  "&",
  "|",
  "^",
  "~",
  "!",
  "<",
  ">",
  "(",
  ")",
];

function tokenize(text: string, radix: number, currentAddress?: number): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < text.length) {
    const rest = text.slice(i);
    let match: RegExpExecArray | null;

    // spaces
    if ((match = /^\s+/.exec(rest))) {
      i += match[0].length;
      continue;
    }

    // H'1F'  D'31'  B'0101'  O'37'  A'c'
    if ((match = /^([HhDdBbOoAa])'([^']*)'/.exec(rest))) {
      const prefix = match[1].toUpperCase();
      const body = match[2];
      if (prefix === "A") {
        if (body.length !== 1)
          throw new ExpressionError(`Illegal character constant. (${match[0]})`);
        tokens.push({ type: "number", value: body.charCodeAt(0) });
      } else {
        tokens.push({ type: "number", value: parseNumber(body, QUOTED_RADIX[prefix], match[0]) });
      }
      i += match[0].length;
      continue;
    }

    // 'c'
    if ((match = /^'(.)'/.exec(rest))) {
      tokens.push({ type: "number", value: match[1].charCodeAt(0) });
      i += match[0].length;
      continue;
    }

    // 0x1F
    if ((match = /^0[xX]([0-9A-Za-z]+)/.exec(rest))) {
      tokens.push({ type: "number", value: parseNumber(match[1], 16, match[0]) });
      i += match[0].length;
      continue;
    }

    // .31
    if ((match = /^\.([0-9A-Za-z]+)/.exec(rest))) {
      tokens.push({ type: "number", value: parseNumber(match[1], 10, match[0]) });
      i += match[0].length;
      continue;
    }

    // 1Fh, or a plain number in the default radix
    if ((match = /^[0-9][0-9A-Za-z]*/.exec(rest))) {
      const word = match[0];
      if (/[hH]$/.test(word)) {
        tokens.push({ type: "number", value: parseNumber(word.slice(0, -1), 16, word) });
      } else {
        tokens.push({ type: "number", value: parseNumber(word, radix, word) });
      }
      i += word.length;
      continue;
    }

    // $ = current address
    if (rest[0] === "$") {
      if (currentAddress === undefined) throw new ExpressionError("$ cannot be used here.");
      tokens.push({ type: "number", value: currentAddress });
      i += 1;
      continue;
    }

    // names (symbols, HIGH, LOW, UPPER)
    if ((match = /^[A-Za-z_?][A-Za-z0-9_?]*/.exec(rest))) {
      tokens.push({ type: "name", name: match[0] });
      i += match[0].length;
      continue;
    }

    // operators
    const op = OPERATORS.find((o) => rest.startsWith(o));
    if (op) {
      tokens.push({ type: "op", op });
      i += op.length;
      continue;
    }

    throw new ExpressionError(`Illegal character. (${rest[0]})`, 108);
  }

  return tokens;
}

// ---------- Parser / evaluator (precedence climbing) ----------

const BINARY_PRECEDENCE: Record<string, number> = {
  "||": 1,
  "&&": 2,
  "|": 3,
  "^": 4,
  "&": 5,
  "==": 6,
  "!=": 6,
  "<": 7,
  "<=": 7,
  ">": 7,
  ">=": 7,
  "<<": 8,
  ">>": 8,
  "+": 9,
  "-": 9,
  "*": 10,
  "/": 10,
  "%": 10,
};

const UNARY_NAMES = new Set(["HIGH", "LOW", "UPPER"]);

function applyBinary(op: string, a: number, b: number): number {
  switch (op) {
    case "||":
      return a || b ? 1 : 0;
    case "&&":
      return a && b ? 1 : 0;
    case "|":
      return a | b;
    case "^":
      return a ^ b;
    case "&":
      return a & b;
    case "==":
      return a === b ? 1 : 0;
    case "!=":
      return a !== b ? 1 : 0;
    case "<":
      return a < b ? 1 : 0;
    case "<=":
      return a <= b ? 1 : 0;
    case ">":
      return a > b ? 1 : 0;
    case ">=":
      return a >= b ? 1 : 0;
    case "<<":
      return a << b;
    case ">>":
      return a >> b;
    case "+":
      return a + b;
    case "-":
      return a - b;
    case "*":
      return a * b;
    case "/":
      if (b === 0) throw new ExpressionError("Divide by zero.");
      return Math.trunc(a / b);
    case "%":
      if (b === 0) throw new ExpressionError("Divide by zero.");
      return a % b;
    default:
      throw new ExpressionError(`Unknown operator. (${op})`);
  }
}

function applyUnary(op: string, value: number): number {
  switch (op) {
    case "-":
      return -value;
    case "~":
      return ~value;
    case "!":
      return value ? 0 : 1;
    case "HIGH":
      return (value >> 8) & 0xff;
    case "LOW":
      return value & 0xff;
    case "UPPER":
      return (value >> 16) & 0xff;
    default:
      throw new ExpressionError(`Unknown operator. (${op})`);
  }
}

export function evaluate(
  text: string,
  lookup: SymbolLookup,
  options: EvalOptions = {},
): EvalResult {
  const radix = options.radix ?? 16;

  try {
    const tokens = tokenize(text, radix, options.currentAddress);
    let pos = 0;

    if (tokens.length === 0) throw new ExpressionError("Missing argument(s).", 128);

    const peek = () => tokens[pos];

    // A single value: number, symbol, (expression), or unary operator + value
    const parsePrimary = (): number => {
      const token = tokens[pos++];
      if (!token) throw new ExpressionError("Expression ends too early.");

      if (token.type === "number") return token.value;

      if (token.type === "name") {
        const upper = token.name.toUpperCase();
        if (UNARY_NAMES.has(upper)) return applyUnary(upper, parsePrimary());

        const value = lookup(token.name);
        if (value === undefined) {
          throw new ExpressionError(`Symbol not previously defined. (${token.name})`, 113);
        }
        return value;
      }

      if (token.op === "(") {
        const value = parseBinary(0);
        const close = tokens[pos++];
        if (!close || close.type !== "op" || close.op !== ")") {
          throw new ExpressionError("Missing ')'.");
        }
        return value;
      }

      if (token.op === "-" || token.op === "~" || token.op === "!") {
        return applyUnary(token.op, parsePrimary());
      }

      throw new ExpressionError(`Unexpected '${token.op}'.`);
    };

    // Binary operators with precedence higher than minPrecedence
    const parseBinary = (minPrecedence: number): number => {
      let left = parsePrimary();
      for (;;) {
        const token = peek();
        if (!token || token.type !== "op") break;
        const precedence = BINARY_PRECEDENCE[token.op];
        if (precedence === undefined || precedence <= minPrecedence) break;
        pos++;
        const right = parseBinary(precedence);
        left = applyBinary(token.op, left, right);
      }
      return left;
    };

    const value = parseBinary(0);
    if (pos < tokens.length) {
      const extra = tokens[pos];
      const shown =
        extra.type === "number"
          ? String(extra.value)
          : extra.type === "name"
            ? extra.name
            : extra.op;
      throw new ExpressionError(`Unexpected '${shown}'.`);
    }

    return { ok: true, value };
  } catch (e) {
    if (e instanceof ExpressionError) return { ok: false, error: e.message, code: e.code };
    throw e;
  }
}
