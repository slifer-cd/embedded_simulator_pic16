// Execution history: the last steps, newest first. Clicking a row goes back to the
// moment BEFORE that instruction ran (so it is the next one to run again).

import { disassemble } from "../chip/disassembler.ts";
import { STEP_EVENT } from "../simulator/history.ts";
import type { HistoryEntry } from "../simulator/history.ts";

type HistoryViewProps = {
  rows: HistoryEntry[]; // newest first
  length: number; // all steps kept (rows may show fewer)
  capacity: number;
  onSelect: (stepsBack: number) => void; // go back to before this step
  disabled: boolean; // while running: look, but don't go back
};

function hex(value: number): string {
  return value.toString(16).toUpperCase().padStart(4, "0");
}

function eventText(events: number): string {
  const parts: string[] = [];
  if (events & STEP_EVENT.wakeUpWatchdog) parts.push("woke up (WDT)");
  if (events & STEP_EVENT.wakeUpInterrupt) parts.push("woke up (interrupt)");
  if (events & STEP_EVENT.interrupt) parts.push("interrupt → 0004");
  if (events & STEP_EVENT.watchdogReset) parts.push("WDT reset");
  return parts.join(", ");
}

export function HistoryView({ rows, length, capacity, onSelect, disabled }: HistoryViewProps) {
  if (length === 0) return <p className="todo">No steps yet</p>;

  return (
    <div className="history">
      <p className="history-summary">
        {length} of {capacity} steps kept{rows.length < length && `, newest ${rows.length} shown`}.
        {!disabled && " Click a row to go back to before it."}
      </p>
      <table className="history-table">
        <thead>
          <tr>
            <th>Cycle</th>
            <th>Addr</th>
            <th>Instruction</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const asleep = (row.events & STEP_EVENT.asleep) !== 0;
            const go = () => {
              if (!disabled) onSelect(row.stepsBack);
            };
            return (
              <tr
                key={row.stepsBack}
                className={disabled ? "disabled" : undefined}
                tabIndex={disabled ? undefined : 0}
                onClick={go}
                onKeyDown={(e) => {
                  if (e.key === "Enter") go();
                }}
                title={
                  disabled
                    ? undefined
                    : `Go back ${row.stepsBack} step${row.stepsBack === 1 ? "" : "s"}`
                }
              >
                <td>{row.cycles}</td>
                <td>{hex(row.address)}</td>
                <td className={asleep ? "history-asleep" : undefined}>
                  {asleep ? "(sleeping)" : disassemble(row.word)}
                </td>
                <td className="history-event">{eventText(row.events)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
