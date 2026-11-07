// Watch list: chosen registers / RAM variables with their value in hex, decimal and binary.
// A value the last step changed is highlighted. A watch on a named RAM variable follows the
// name: after editing and re-assembling, it shows the variable at its new address.
// PORTA / PORTB show the pin levels (what the program reads).

import { useState } from "react";
import type { CpuSnapshot } from "../simulator/cpu.ts";
import { portLevels } from "../simulator/pins.ts";
import { dataBreakpointTargets, targetName, W_TARGET } from "../utils/dataBreakpoints.ts";

export type Watch = {
  target: number; // address (canonical), or W_TARGET
  variable: string | null; // RAM variable name to follow, or null
};

type WatchViewProps = {
  sim: CpuSnapshot | null;
  previous: CpuSnapshot | null;
  watches: Watch[];
  ramNames: Map<number, string[]>; // RAM address -> names (current build)
  variables: Map<string, number>; // RAM variable name -> address (current build)
  onAdd: (watch: Watch) => void;
  onRemove: (index: number) => void;
  onAddAllVariables: () => void;
};

const PORTA = 0x05;
const PORTB = 0x06;

// The value of a target in a snapshot (PORTA / PORTB: pin levels)
function valueIn(sim: CpuSnapshot, target: number): number {
  if (target === W_TARGET) return sim.w;
  if (target === PORTA || target === PORTB) {
    const levels = portLevels(sim.file, sim.drives);
    return target === PORTA ? levels.a : levels.b;
  }
  return sim.file[target];
}

export function WatchView(props: WatchViewProps) {
  const { sim, previous, watches, ramNames, variables, onAdd, onRemove, onAddAllVariables } = props;
  const [target, setTarget] = useState(W_TARGET);
  const targets = dataBreakpointTargets(ramNames);

  return (
    <div className="watch">
      {watches.length === 0 ? (
        <p className="todo">Nothing watched yet: add a register or a variable below.</p>
      ) : (
        <table className="watch-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Addr</th>
              <th>Hex</th>
              <th>Dec</th>
              <th>Binary</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {watches.map((watch, i) => {
              // A variable watch uses the variable's address in the current build
              const address =
                watch.variable === null ? watch.target : variables.get(watch.variable);
              const name = watch.variable ?? targetName(watch.target, ramNames);
              const value = sim && address !== undefined ? valueIn(sim, address) : null;
              const changed =
                value !== null && previous !== null && address !== undefined
                  ? valueIn(previous, address) !== value
                  : false;
              return (
                <tr
                  key={`${watch.variable ?? watch.target}`}
                  className={changed ? "changed" : undefined}
                >
                  <th>{name}</th>
                  <td className="watch-addr">
                    {address === undefined
                      ? "not found"
                      : address === W_TARGET
                        ? ""
                        : address.toString(16).toUpperCase().padStart(2, "0")}
                  </td>
                  <td>{value === null ? "" : value.toString(16).toUpperCase().padStart(2, "0")}</td>
                  <td>{value ?? ""}</td>
                  <td className="watch-bin">
                    {value === null ? "" : value.toString(2).padStart(8, "0")}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="watch-remove"
                      aria-label={`Stop watching ${name}`}
                      title="Remove"
                      onClick={() => onRemove(i)}
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

      <form
        className="watch-form"
        onSubmit={(e) => {
          e.preventDefault();
          // A named RAM byte is watched by its (first) name, so it follows the variable
          const variable = ramNames.get(target)?.[0] ?? null;
          onAdd({ target, variable });
        }}
      >
        <select
          value={target}
          onChange={(e) => setTarget(Number(e.target.value))}
          aria-label="Register or variable to watch"
        >
          {targets.map((t) => (
            <option key={t.target} value={t.target}>
              {t.label}
            </option>
          ))}
        </select>
        <button type="submit">Watch</button>
        <button
          type="button"
          onClick={onAddAllVariables}
          disabled={variables.size === 0}
          title={
            variables.size === 0
              ? "No RAM variables (EQU / CBLOCK) in the last build"
              : "Watch every RAM variable of the program"
          }
        >
          + all variables
        </button>
      </form>
    </div>
  );
}
