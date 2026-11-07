import type { CpuSnapshot } from "../simulator/cpu.ts";

export type SimNote = { kind: "warning" | "info"; text: string };

type StatusBarProps = {
  sim: CpuSnapshot | null; // null = no program loaded
  running: boolean;
  note: SimNote | null; // last simulator warning (stack overflow, ...) or info (endless loop, ...)
  clockHz: number; // oscillator frequency, for the elapsed time
  onClockChange: (hz: number) => void;
  clockWarning: string | null; // the clock doesn't fit the oscillator mode in __CONFIG
  runRate: number | null; // measured speed while running (1 = real time), null = not shown
  behind: boolean; // Real time speed is set, but the simulator can't keep up
};

// x real time: 2 digits below 1, 1 digit up to 10, whole numbers above
function formatRate(rate: number): string {
  if (rate < 0.01) return "<×0.01";
  if (rate < 1) return `×${rate.toFixed(2)}`;
  if (rate < 10) return `×${rate.toFixed(1)}`;
  return `×${Math.round(rate)}`;
}

// Common crystals / oscillators for the PIC16F84A (the -04 part runs up to 4 MHz, the -20 up to 20 MHz)
const CLOCK_OPTIONS = [
  { hz: 32_768, label: "32.768 kHz" },
  { hz: 1_000_000, label: "1 MHz" },
  { hz: 4_000_000, label: "4 MHz" },
  { hz: 10_000_000, label: "10 MHz" },
  { hz: 20_000_000, label: "20 MHz" },
] as const;

function hex(value: number, digits: number): string {
  return `0x${value.toString(16).toUpperCase().padStart(digits, "0")}`;
}

// 1 instruction cycle = 4 oscillator clocks
function elapsedTime(cycles: number, clockHz: number): string {
  const seconds = (cycles * 4) / clockHz;
  if (seconds < 1e-3) return `${(seconds * 1e6).toFixed(0)} µs`;
  if (seconds < 1) return `${(seconds * 1e3).toFixed(3)} ms`;
  return `${seconds.toFixed(3)} s`;
}

export function StatusBar(props: StatusBarProps) {
  const { sim, running, note, clockHz, onClockChange, clockWarning, runRate, behind } = props;
  // Changing the clock changes how long a cycle is (4 / f), not the cycle count.
  // The EEPROM write time and the watchdog period stay the same in ms.
  const clockSelect = (
    <label className="status-clock" title="Oscillator frequency: one instruction cycle = 4 clocks">
      Clock{" "}
      <select value={clockHz} onChange={(e) => onClockChange(Number(e.target.value))}>
        {CLOCK_OPTIONS.map((option) => (
          <option key={option.hz} value={option.hz}>
            {option.label}
          </option>
        ))}
      </select>
      {clockWarning && <span className="status-clock-warning"> ⚠ {clockWarning}</span>}
    </label>
  );

  if (!sim) {
    return (
      <div className="status-bar">
        <span className="status-note">Assemble a program without errors to simulate it.</span>
        {clockSelect}
      </div>
    );
  }

  const state = running ? "Running" : sim.sleeping ? "Sleeping" : "Stopped";

  return (
    <div className="status-bar">
      <span className={`status-state ${state.toLowerCase()}`}>{state}</span>
      <span>PC {hex(sim.pc, 4)}</span>
      <span>W {hex(sim.w, 2)}</span>
      <span>Cycles {sim.cycles}</span>
      <span>Time {elapsedTime(sim.cycles, clockHz)}</span>
      {runRate !== null && (
        <span
          className={`status-rate${behind ? " behind" : ""}`}
          title={
            behind
              ? "The simulator can't run this clock in real time: it runs as fast as it can"
              : "Simulated time / real time"
          }
        >
          {formatRate(runRate)} real time{behind && " (can't keep up)"}
        </span>
      )}
      {clockSelect}
      {note && (
        <span className={`status-note ${note.kind}`}>
          {note.kind === "warning" ? "⚠" : "ℹ"} {note.text}
        </span>
      )}
    </div>
  );
}
