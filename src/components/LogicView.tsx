// Logic analyzer: the pin levels of RA0-RA4 and RB0-RB7 over the last N cycles,
// one waveform per pin, "now" on the right edge.

import type { LogicWindow } from "../simulator/logicTrace.ts";

type LogicViewProps = {
  window: LogicWindow | null; // null = nothing recorded (no program loaded)
  span: number; // cycles shown
  onSpanChange: (span: number) => void;
  clockHz: number;
};

const LOGIC_SPANS = [100, 1_000, 10_000, 100_000, 1_000_000];

const ROW = 18; // px per pin row (the SVG uses the same units vertically)
const WIDTH = 1000; // SVG units across (stretched to the panel width)

const PINS = [
  ...[0, 1, 2, 3, 4].map((bit) => ({ name: `RA${bit}`, port: "a" as const, bit })),
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((bit) => ({ name: `RB${bit}`, port: "b" as const, bit })),
];

// Cycles as time at this clock: "250 µs", "1.5 ms", "2 s"
function formatTime(cycles: number, clockHz: number): string {
  const seconds = (cycles * 4) / clockHz;
  if (seconds < 1e-3) return `${+(seconds * 1e6).toPrecision(3)} µs`;
  if (seconds < 1) return `${+(seconds * 1e3).toPrecision(3)} ms`;
  return `${+seconds.toPrecision(3)} s`;
}

function formatCycles(cycles: number): string {
  return cycles >= 1_000_000
    ? `${cycles / 1_000_000}M`
    : cycles >= 1000
      ? `${cycles / 1000}k`
      : `${cycles}`;
}

export function LogicView({ window, span, onSpanChange, clockHz }: LogicViewProps) {
  const header = (
    <div className="logic-header">
      <label>
        Show the last{" "}
        <select value={span} onChange={(e) => onSpanChange(Number(e.target.value))}>
          {LOGIC_SPANS.map((s) => (
            <option key={s} value={s}>
              {formatCycles(s)} cycles
            </option>
          ))}
        </select>
      </label>
      <span className="logic-time">= {formatTime(span, clockHz)} at this clock</span>
    </div>
  );
  if (!window) {
    return (
      <div className="logic">
        {header}
        <p className="todo">Assemble to record the pins</p>
      </div>
    );
  }

  const start = window.end - span;
  const x = (cycle: number) => (Math.max(0, cycle - start) / span) * WIDTH;

  // One step-shaped path per pin: high = top of the row, low = bottom
  const paths = PINS.map((pin, row) => {
    const levelOf = (a: number, b: number) => ((pin.port === "a" ? a : b) >> pin.bit) & 1;
    const y = (level: number) => row * ROW + (level ? 4 : ROW - 4);
    let level = levelOf(window.initialA, window.initialB);
    let d = `M0 ${y(level)}`;
    let edges = 0;
    window.cycles.forEach((cycle, i) => {
      const next = levelOf(window.a[i], window.b[i]);
      if (next === level) return;
      d += ` H${x(cycle).toFixed(1)} V${y(next)}`;
      level = next;
      edges++;
    });
    return { pin, d: `${d} H${WIDTH}`, high: level === 1, edges };
  });

  return (
    <div className="logic">
      {header}
      <div className="logic-chart">
        <div className="logic-names">
          {paths.map(({ pin, high, edges }) => (
            <div
              key={pin.name}
              style={{ height: ROW }}
              className={high ? "high" : undefined}
              title={`${pin.name}: now ${high ? 1 : 0}, ${edges} edge${edges === 1 ? "" : "s"} in the window`}
            >
              {pin.name}
            </div>
          ))}
        </div>
        <svg
          className="logic-waves"
          viewBox={`0 0 ${WIDTH} ${PINS.length * ROW}`}
          preserveAspectRatio="none"
          height={PINS.length * ROW}
          role="img"
          aria-label="Pin levels over time"
        >
          {PINS.map((pin, row) => (
            <line
              key={pin.name}
              className="logic-grid"
              x1={0}
              x2={WIDTH}
              y1={(row + 1) * ROW}
              y2={(row + 1) * ROW}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {paths.map(({ pin, d }) => (
            <path key={pin.name} className="logic-wave" d={d} vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
      </div>
      <div className="logic-axis">
        <span>−{formatTime(span, clockHz)}</span>
        <span>−{formatTime(span / 2, clockHz)}</span>
        <span>now (cycle {window.end})</span>
      </div>
    </div>
  );
}
