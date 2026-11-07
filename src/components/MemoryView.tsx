// Hex grid of a block of memory, 8 bytes per row. Used for RAM now and EEPROM later.
//
//        0  1  2  3  4  5  6  7
//   08               00 00 00 00     <- addresses before "start" are left empty
//   10  00 00 00 00 00 00 00 00
//
// Named bytes (variables) are underlined; hover shows the name and value.
// Bytes changed by the last step are highlighted. A list of the named bytes follows the grid.

type MemoryViewProps = {
  values: ArrayLike<number>; // indexed by address
  previous: ArrayLike<number> | null; // values before the last step (null = no highlight)
  start: number; // first address shown
  end: number; // last address shown
  names: Map<number, string[]>; // address -> variable names
};

const COLUMNS = 8;

function hex(value: number, digits: number): string {
  return value.toString(16).toUpperCase().padStart(digits, "0");
}

export function MemoryView({ values, previous, start, end, names }: MemoryViewProps) {
  const firstRow = start - (start % COLUMNS);
  const rows: number[] = [];
  for (let row = firstRow; row <= end; row += COLUMNS) rows.push(row);

  const isChanged = (address: number) => previous !== null && previous[address] !== values[address];

  const named = [...names].sort(([a], [b]) => a - b);

  return (
    <div className="memview">
      <table className="memview-grid">
        <thead>
          <tr>
            <th />
            {Array.from({ length: COLUMNS }, (_, col) => (
              <th key={col}>{col.toString(16).toUpperCase()}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row}>
              <th>{hex(row, 2)}</th>
              {Array.from({ length: COLUMNS }, (_, col) => {
                const address = row + col;
                if (address < start || address > end) return <td key={col} />;

                const value = values[address];
                const varNames = names.get(address);
                const classes = [varNames ? "named" : "", isChanged(address) ? "changed" : ""];
                const title = `0x${hex(address, 2)}${varNames ? ` ${varNames.join(", ")}` : ""} = 0x${hex(value, 2)} (${value})`;
                return (
                  <td key={col} className={classes.join(" ").trim() || undefined} title={title}>
                    {hex(value, 2)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {named.length > 0 && (
        <table className="memview-vars">
          <tbody>
            {named.map(([address, varNames]) => (
              <tr key={address} className={isChanged(address) ? "changed" : undefined}>
                <th>{varNames.join(", ")}</th>
                <td className="memview-addr">{hex(address, 2)}</td>
                <td>{hex(values[address], 2)}</td>
                <td className="memview-dec">{values[address]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
