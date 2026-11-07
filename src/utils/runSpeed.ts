// Run speeds for the Run button.
//
//   fixed speeds: a number of instructions per second, slow enough to watch the code
//   real time:    as many cycles per second as the real chip runs (clock / 4)
//   max:          as fast as the browser can, while keeping the page responsive
//
// The simulated time (Cycles / Time in the status bar) is the same at every speed;
// only how fast it goes by on screen changes.

export const RUN_SPEEDS = [
  { id: "10", label: "10 instr/s", perSecond: 10 },
  { id: "100", label: "100 instr/s", perSecond: 100 },
  { id: "1000", label: "1000 instr/s", perSecond: 1000 },
  { id: "realtime", label: "Real time", perSecond: null },
  { id: "max", label: "Max", perSecond: null },
] as const;

export type RunSpeed = (typeof RUN_SPEEDS)[number]["id"];

export const DEFAULT_RUN_SPEED: RunSpeed = "realtime";
