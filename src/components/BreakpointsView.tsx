// Breakpoints panel.
//   Line breakpoints: line, address, the source line. Click a row to show the line in the
//     editor, × to remove one.
//   Data breakpoints: stop when W / a register / a RAM byte changes or becomes a value.
//     A small form adds them; × removes one.
// Clear all removes both kinds.

import { useState } from "react";
import { dataBreakpointKey, dataBreakpointTargets, W_TARGET } from "../utils/dataBreakpoints.ts";
import type { DataBreakpoint } from "../utils/dataBreakpoints.ts";

export type BreakpointRow = {
  line: number;
  text: string; // the source line, trimmed
  address: number | null; // where Run stops; null = no instruction on this line (never stops)
};

type BreakpointsViewProps = {
  rows: BreakpointRow[]; // line breakpoints, sorted by line
  outdated: boolean; // code edited since the last assemble: addresses are not known
  onSelect: (line: number) => void;
  onRemove: (line: number) => void;
  onClearAll: () => void;
  dataBreakpoints: DataBreakpoint[];
  ramNames: Map<number, string[]>; // RAM address -> variable names, for the target list
  onAddData: (target: number, value: number | null) => void;
  onRemoveData: (key: string) => void;
};

function hex(value: number, digits: number): string {
  return value.toString(16).toUpperCase().padStart(digits, "0");
}

// "1F", "0x1F" or "1Fh" -> 31; null when it is not a byte in hex
function parseHexByte(text: string): number | null {
  const digits = text.trim().replace(/^0x/i, "").replace(/h$/i, "");
  if (!/^[0-9a-f]{1,2}$/i.test(digits)) return null;
  return parseInt(digits, 16);
}

export function BreakpointsView(props: BreakpointsViewProps) {
  const { rows, outdated, onSelect, onRemove, onClearAll } = props;
  const { dataBreakpoints, ramNames, onAddData, onRemoveData } = props;

  // The "add a data breakpoint" form
  const [target, setTarget] = useState(W_TARGET);
  const [mode, setMode] = useState<"change" | "value">("change");
  const [valueText, setValueText] = useState("00");
  const value = parseHexByte(valueText);
  const canAdd = mode === "change" || value !== null;

  const total = rows.length + dataBreakpoints.length;

  return (
    <div className="breakpoints">
      <div className="breakpoints-header">
        <span>
          {total === 0
            ? "No breakpoints. Click a line number in the editor (or F9)."
            : `${total} breakpoint${total === 1 ? "" : "s"}`}
        </span>
        {total > 0 && (
          <button type="button" onClick={onClearAll}>
            Clear all
          </button>
        )}
      </div>

      {rows.length > 0 && (
        <table className="breakpoints-table">
          <tbody>
            {rows.map((row) => (
              <tr key={row.line} onClick={() => onSelect(row.line)} title="Show this line">
                <td className="breakpoints-line">{row.line}</td>
                <td className="breakpoints-address">
                  {outdated ? "" : row.address === null ? "no instruction" : hex(row.address, 4)}
                </td>
                <td className="breakpoints-text">{row.text}</td>
                <td>
                  <button
                    type="button"
                    className="breakpoints-remove"
                    aria-label={`Remove the breakpoint on line ${row.line}`}
                    title="Remove"
                    onClick={(e) => {
                      e.stopPropagation(); // don't also select the line
                      onRemove(row.line);
                    }}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {dataBreakpoints.length > 0 && (
        <table className="breakpoints-table data">
          <tbody>
            {dataBreakpoints.map((bp) => {
              const key = dataBreakpointKey(bp);
              return (
                <tr key={key}>
                  <td className="breakpoints-line">◆</td>
                  <td className="breakpoints-text">
                    {bp.label} {bp.value === null ? "changes" : `becomes ${hex(bp.value, 2)}`}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="breakpoints-remove"
                      aria-label={`Remove the data breakpoint: ${bp.label}`}
                      title="Remove"
                      onClick={() => onRemoveData(key)}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* Add a data breakpoint */}
      <form
        className="breakpoints-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (canAdd) onAddData(target, mode === "change" ? null : value);
        }}
      >
        <span>Stop when</span>
        <select
          value={target}
          onChange={(e) => setTarget(Number(e.target.value))}
          aria-label="Register or RAM byte"
        >
          {dataBreakpointTargets(ramNames).map((t) => (
            <option key={t.target} value={t.target}>
              {t.label}
            </option>
          ))}
        </select>
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as "change" | "value")}
          aria-label="Condition"
        >
          <option value="change">changes</option>
          <option value="value">becomes</option>
        </select>
        {mode === "value" && (
          <input
            className={value === null ? "invalid" : undefined}
            value={valueText}
            onChange={(e) => setValueText(e.target.value)}
            size={4}
            aria-label="Value (hex)"
            title="Value in hex: 1F, 0x1F or 1Fh"
          />
        )}
        <button type="submit" disabled={!canAdd} title={canAdd ? undefined : "Value: 00-FF in hex"}>
          Add
        </button>
      </form>
    </div>
  );
}
