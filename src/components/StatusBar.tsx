import type { CpuSnapshot } from "../simulator/cpu.ts";

export type SimNote = { kind: "warning" | "info"; text: string };

type StatusBarProps = {
  sim: CpuSnapshot | null; // null = no program loaded
  running: boolean;
  note: SimNote | null; // last simulator warning (stack overflow, ...) or info (endless loop, ...)
  clockHz: number; // oscillator frequency, for the elapsed time
};

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

export function StatusBar({ sim, running, note, clockHz }: StatusBarProps) {
  if (!sim) {
    return <div className="status-bar">Assemble a program without errors to simulate it.</div>;
  }

  const state = running ? "Running" : sim.sleeping ? "Sleeping" : "Stopped";

  return (
    <div className="status-bar">
      <span className={`status-state ${state.toLowerCase()}`}>{state}</span>
      <span>PC {hex(sim.pc, 4)}</span>
      <span>W {hex(sim.w, 2)}</span>
      <span>Cycles {sim.cycles}</span>
      <span>
        Time {elapsedTime(sim.cycles, clockHz)} @ {clockHz / 1e6} MHz
      </span>
      {note && (
        <span className={`status-note ${note.kind}`}>
          {note.kind === "warning" ? "⚠" : "ℹ"} {note.text}
        </span>
      )}
    </div>
  );
}
