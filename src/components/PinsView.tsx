import type { CpuSnapshot } from "../simulator/cpu.ts";
import { pinStates } from "../simulator/pins.ts";
import type { Drive, PinState } from "../simulator/pins.ts";

type PinsViewProps = {
  sim: CpuSnapshot | null; // null = no program loaded
  previous: CpuSnapshot | null; // to highlight pins whose level changed
  onDrive: (port: "a" | "b", bit: number, drive: Drive) => void; // user changes an input
};

// Clicking an input cycles: not connected -> high -> low -> not connected
function nextDrive(drive: Drive): Drive {
  if (drive === null) return 1;
  if (drive === 1) return 0;
  return null;
}

function driveText(drive: Drive): string {
  if (drive === null) return "open";
  return drive ? "high" : "low";
}

function PinRow({
  pin,
  changed,
  onDrive,
}: {
  pin: PinState;
  changed: boolean;
  onDrive: PinsViewProps["onDrive"];
}) {
  const levelTitle = pin.floating
    ? "Floating: nothing drives this pin (reads 0)"
    : pin.pullUp && pin.drive === null
      ? "Pulled up by the PORTB weak pull-up"
      : `Level ${pin.level}`;

  return (
    <tr className={changed ? "changed" : undefined}>
      <td className="pin-number" title="Pin number on the 18-pin package">
        {pin.number}
      </td>
      <th>{pin.label}</th>
      <td className={`pin-dir ${pin.output ? "out" : "in"}`}>{pin.output ? "out" : "in"}</td>
      <td>
        <span
          className={`pin-led ${pin.level ? "high" : "low"} ${pin.floating ? "floating" : ""}`}
          title={levelTitle}
        />
        <span className="pin-level">{pin.floating ? "?" : pin.level}</span>
      </td>
      <td>
        {pin.output ? (
          <span className="pin-note">
            latch {pin.latch}
            {pin.port === "a" && pin.bit === 4 && pin.latch === 1 && " (open-drain)"}
          </span>
        ) : (
          <button
            type="button"
            className="pin-drive"
            onClick={() => onDrive(pin.port, pin.bit, nextDrive(pin.drive))}
            title="Click: open → high → low"
          >
            {driveText(pin.drive)}
          </button>
        )}
      </td>
    </tr>
  );
}

export function PinsView({ sim, previous, onDrive }: PinsViewProps) {
  if (!sim) {
    return <p className="todo">Assemble to load a program</p>;
  }

  const pins = pinStates(sim.file, sim.drives);
  const before = previous ? pinStates(previous.file, previous.drives) : null;

  return (
    <table className="pins">
      <tbody>
        {pins.map((pin, index) => (
          <PinRow
            key={pin.name}
            pin={pin}
            changed={before !== null && before[index].level !== pin.level}
            onDrive={onDrive}
          />
        ))}
      </tbody>
    </table>
  );
}
