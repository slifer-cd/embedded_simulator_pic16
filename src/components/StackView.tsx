import { MEMORY } from "../chip/config.ts";
import type { CpuSnapshot } from "../simulator/cpu.ts";

type StackViewProps = {
  sim: CpuSnapshot | null; // null = no program loaded
  previous: CpuSnapshot | null; // snapshot before the last step, to highlight a push
  labelByAddress: Map<number, string>; // program labels, to name return addresses
  lineByAddress: Map<number, number>; // program address -> source line
};

function hex(value: number, digits: number): string {
  return value.toString(16).toUpperCase().padStart(digits, "0");
}

export function StackView({ sim, previous, labelByAddress, lineByAddress }: StackViewProps) {
  if (!sim) {
    return <p className="todo">Assemble to load a program</p>;
  }

  const entries = sim.stack; // valid return addresses, newest first
  const pushed = previous !== null && entries.length > previous.stack.length;
  const emptySlots = MEMORY.STACK_DEPTH - entries.length;

  return (
    <div className="stack">
      <p className="stack-summary">
        Depth {entries.length} / {MEMORY.STACK_DEPTH}
      </p>

      <ol className="stack-list">
        {entries.map((address, index) => {
          const line = lineByAddress.get(address);
          const label = labelByAddress.get(address);
          return (
            <li
              key={index}
              className={index === 0 && pushed ? "changed" : undefined}
              title="Return address (the instruction after the CALL)"
            >
              <span className="stack-level">{index === 0 ? "Top" : index + 1}</span>
              <span className="stack-address">{hex(address, 4)}</span>
              <span className="stack-info">
                {label && <b>{label}</b>} {line !== undefined && `line ${line}`}
              </span>
            </li>
          );
        })}
        {Array.from({ length: emptySlots }, (_, i) => (
          <li key={`empty-${i}`} className="empty">
            <span className="stack-level">{entries.length + i + 1}</span>
            <span className="stack-address">----</span>
            <span className="stack-info" />
          </li>
        ))}
      </ol>
    </div>
  );
}
