// .err writer: one line per error / warning / message, in MPASM style:
//
//   Error[113]   program.asm 12 : Symbol not previously defined. (UNDEF)
//   Warning[203] program.asm 5 : Found opcode in column 1. (MOVLW)
//   Message[302] program.asm 7 : Register in operand not in bank 0. Ensure that bank bits are correct.
//
// A build without problems gives an empty file (like MPASM).

import type { AssemblerMessage, Severity } from "../lexer.ts";

const SEVERITY_LABEL: Record<Severity, string> = {
  error: "Error",
  warning: "Warning",
  message: "Message",
};

// "Error[113]", or "Error" when the message has no MPASM number
export function messageTag(message: AssemblerMessage): string {
  const label = SEVERITY_LABEL[message.severity];
  return message.code === undefined ? label : `${label}[${message.code}]`;
}

export function generateErr(messages: AssemblerMessage[], fileName: string): string {
  const lines = messages.map(
    (m) => `${messageTag(m).padEnd(12)} ${fileName} ${m.line} : ${m.text}`,
  );
  return lines.length === 0 ? "" : `${lines.join("\r\n")}\r\n`;
}
