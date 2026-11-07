import { REGISTERS } from "../chip/registers.ts";
import type { Register } from "../chip/registers.ts";
import type { CpuSnapshot } from "../simulator/cpu.ts";

type RegistersViewProps = {
  sim: CpuSnapshot | null; // null = no program loaded
  previous: CpuSnapshot | null; // snapshot before the last step, to highlight changes
};

// INDF and EECON2 have no storage, so there is no value to show
const SHOWN = REGISTERS.filter((reg) => reg.name !== "INDF" && reg.name !== "EECON2");

const STATUS = 0x03;
const PCLATH = 0x0a;

function hex(value: number, digits: number): string {
  return value.toString(16).toUpperCase().padStart(digits, "0");
}

// One cell per bit, bit 7 on the left. Hover shows the bit name.
// For registers with some named bits, the unnamed ones are unimplemented ("-").
function Bits({ reg, value, changedMask }: { reg: Register; value: number; changedMask: number }) {
  const hasNames = reg.bits.some((name) => name !== "");

  return (
    <span className="reg-bits">
      {reg.bits.map((name, index) => {
        const bit = 7 - index;
        if (hasNames && name === "") {
          return (
            <span key={bit} className="reg-bit unused" title={`bit ${bit}: unimplemented`}>
              -
            </span>
          );
        }
        const on = (value >> bit) & 1;
        const classes = ["reg-bit", on ? "on" : "", (changedMask >> bit) & 1 ? "changed" : ""];
        return (
          <span
            key={bit}
            className={classes.join(" ")}
            title={`bit ${bit}${name ? `: ${name}` : ""}`}
          >
            {on}
          </span>
        );
      })}
    </span>
  );
}

export function RegistersView({ sim, previous }: RegistersViewProps) {
  if (!sim) {
    return <p className="todo">Assemble to load a program</p>;
  }

  const changed = (now: number, before: number | undefined) =>
    before !== undefined && now !== before ? "changed" : undefined;

  const bank = (sim.file[STATUS] >> 5) & 1;

  return (
    <div className="registers">
      <table className="reg-table">
        <tbody>
          {/* CPU registers (no address) */}
          <tr>
            <th>W</th>
            <td className="reg-addr" />
            <td className={changed(sim.w, previous?.w)}>{hex(sim.w, 2)}</td>
            <td />
          </tr>
          <tr>
            <th>PC</th>
            <td className="reg-addr" />
            <td className={changed(sim.pc, previous?.pc)} title="13-bit program counter">
              {hex(sim.pc, 4)}
            </td>
            <td className="reg-note">
              PCLATH {hex(sim.file[PCLATH], 2)} · Bank {bank}
            </td>
          </tr>

          {/* Special function registers */}
          {SHOWN.map((reg) => {
            const value = sim.file[reg.address];
            const before = previous?.file[reg.address];
            const changedMask = before === undefined ? 0 : value ^ before;
            return (
              <tr key={reg.name}>
                <th>{reg.name}</th>
                <td className="reg-addr">{hex(reg.address, 2)}</td>
                <td className={changed(value, before)}>{hex(value, 2)}</td>
                <td>
                  <Bits reg={reg} value={value} changedMask={changedMask} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
