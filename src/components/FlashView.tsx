import type { AssemblyResult } from "../assembler/assembler.ts";
import { CONFIG_ADDRESS, MEMORY } from "../chip/config.ts";
import { disassemble } from "../chip/disassembler.ts";

type FlashViewProps = {
  result: AssemblyResult | null; // null = not assembled yet
  onSelectLine: (line: number) => void; // click a row -> show its source line
};

function hex(value: number, digits: number): string {
  return value.toString(16).toUpperCase().padStart(digits, "0");
}

export function FlashView({ result, onSelectLine }: FlashViewProps) {
  if (!result) {
    return <p className="todo">Press Assemble</p>;
  }

  // Only the program memory words the code uses, in address order
  const words = result.words
    .filter((w) => w.address < MEMORY.PROGRAM_SIZE)
    .sort((a, b) => a.address - b.address);

  // Labels by address (a few labels can point to the same address)
  const labels = new Map<number, string[]>();
  for (const [name, symbol] of result.symbols) {
    if (symbol.kind !== "label" || symbol.value >= MEMORY.PROGRAM_SIZE) continue;
    labels.set(symbol.value, [...(labels.get(symbol.value) ?? []), name]);
  }

  const configWord = result.words.find((w) => w.address === CONFIG_ADDRESS);

  return (
    <div className="flash">
      <p className="flash-summary">
        {words.length} / {MEMORY.PROGRAM_SIZE} words used
        {configWord && ` · Config ${hex(configWord.value, 4)}`}
      </p>

      {words.length === 0 ? (
        <p className="todo">No code</p>
      ) : (
        <table className="flash-table">
          <thead>
            <tr>
              <th>Addr</th>
              <th>Word</th>
              <th>Label</th>
              <th>Instruction</th>
            </tr>
          </thead>
          <tbody>
            {words.map((w) => (
              <tr key={w.address} onClick={() => onSelectLine(w.line)} title={`Line ${w.line}`}>
                <td>{hex(w.address, 4)}</td>
                <td>{hex(w.value, 4)}</td>
                <td className="flash-label">{labels.get(w.address)?.join(", ")}</td>
                <td>{disassemble(w.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
