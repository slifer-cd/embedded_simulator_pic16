// List of the breakpoints: line, address, the source line. Click a row to show the line
// in the editor, × to remove one breakpoint, Clear all to remove them all.

export type BreakpointRow = {
  line: number;
  text: string; // the source line, trimmed
  address: number | null; // where Run stops; null = no instruction on this line (never stops)
};

type BreakpointsViewProps = {
  rows: BreakpointRow[]; // sorted by line
  outdated: boolean; // code edited since the last assemble: addresses are not known
  onSelect: (line: number) => void;
  onRemove: (line: number) => void;
  onClearAll: () => void;
};

function hex(value: number): string {
  return value.toString(16).toUpperCase().padStart(4, "0");
}

export function BreakpointsView(props: BreakpointsViewProps) {
  const { rows, outdated, onSelect, onRemove, onClearAll } = props;

  if (rows.length === 0) {
    return <p className="todo">No breakpoints. Click a line number in the editor (or F9).</p>;
  }

  return (
    <div className="breakpoints">
      <div className="breakpoints-header">
        <span>
          {rows.length} breakpoint{rows.length === 1 ? "" : "s"}
        </span>
        <button type="button" onClick={onClearAll}>
          Clear all
        </button>
      </div>
      <table className="breakpoints-table">
        <tbody>
          {rows.map((row) => (
            <tr key={row.line} onClick={() => onSelect(row.line)} title="Show this line">
              <td className="breakpoints-line">{row.line}</td>
              <td className="breakpoints-address">
                {outdated ? "" : row.address === null ? "no instruction" : hex(row.address)}
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
    </div>
  );
}
