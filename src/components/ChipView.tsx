// Live block diagram of the PIC16F84A, drawn after the datasheet's block diagram
// (public/system.png, datasheet Figure 1-1). Each block shows its current value;
// a value that the last step changed is highlighted, like in the other panels.
//
// Coordinates follow the picture (1420 x 1180), so blocks can be compared with it.

import type { CpuSnapshot } from "../simulator/cpu.ts";
import type { HistoryEntry } from "../simulator/history.ts";
import { portLevels } from "../simulator/pins.ts";
import { activeBuses } from "../utils/chipPaths.ts";

type ChipViewProps = {
  sim: CpuSnapshot | null; // null = nothing loaded: the diagram without values
  previous: CpuSnapshot | null; // before the last step, to highlight changes
  instruction: string | null; // the instruction the next step runs (Instruction Register)
  clockHz: number;
  lastStep: HistoryEntry | null; // the step that led here: its buses light up
};

const TMR0 = 0x01;
const STATUS = 0x03;
const FSR = 0x04;
const EEDATA = 0x08;
const EEADR = 0x09;

const hex = (value: number, digits: number) =>
  `0x${value.toString(16).toUpperCase().padStart(digits, "0")}`;

function formatClock(hz: number): string {
  return hz >= 1_000_000 ? `${hz / 1_000_000} MHz` : `${hz / 1000} kHz`;
}

// ---------- Drawing helpers ----------

type BoxProps = {
  x: number;
  y: number;
  w: number;
  h: number;
  title?: string[]; // lines of the block name
  value?: string; // live value (big, monospace)
  note?: string; // small text under the value
  changed?: boolean;
  inline?: boolean; // one row: name on the left, value on the right (small blocks)
};

// A block: name at the top (or centred when there is no value), value below it
function Box({ x, y, w, h, title = [], value, note, changed, inline }: BoxProps) {
  const className = changed ? "chip-block changed" : "chip-block";
  if (inline) {
    return (
      <g className={className}>
        <rect x={x} y={y} width={w} height={h} />
        <text className="chip-title" x={x + 12} y={y + h / 2} dominantBaseline="middle">
          {title[0]}
        </text>
        <text
          className="chip-value"
          x={x + w - 12}
          y={y + h / 2}
          textAnchor="end"
          dominantBaseline="middle"
        >
          {value}
        </text>
      </g>
    );
  }

  const lineHeight = 24;
  const titleTop = value === undefined ? y + h / 2 - ((title.length - 1) * lineHeight) / 2 : y + 26;
  return (
    <g className={className}>
      <rect x={x} y={y} width={w} height={h} />
      {title.map((line, i) => (
        <text
          key={line}
          className="chip-title"
          textAnchor="middle"
          x={x + w / 2}
          y={titleTop + i * lineHeight}
          dominantBaseline="middle"
        >
          {line}
        </text>
      ))}
      {value !== undefined && (
        <text
          className="chip-value"
          textAnchor="middle"
          x={x + w / 2}
          y={y + 26 + title.length * lineHeight + 6}
          dominantBaseline="middle"
        >
          {value}
        </text>
      )}
      {note !== undefined && (
        <text
          className="chip-note"
          textAnchor="middle"
          x={x + w / 2}
          y={y + 26 + (title.length + 1) * lineHeight + 8}
          dominantBaseline="middle"
        >
          {note}
        </text>
      )}
    </g>
  );
}

// A bus / signal line with an arrow at the end (and at the start if both = true).
// on = the last step used it: drawn in the accent colour.
function Bus({
  d,
  both = false,
  label,
  on = false,
  arrow = true,
}: {
  d: string;
  both?: boolean;
  label?: [number, number, string];
  on?: boolean;
  arrow?: boolean; // false: a plain line (e.g. the data bus trunk)
}) {
  const marker = !arrow ? undefined : on ? "url(#chip-arrow-on)" : "url(#chip-arrow)";
  return (
    <g>
      <path
        className={on ? "chip-bus on" : "chip-bus"}
        d={d}
        markerEnd={marker}
        markerStart={both ? marker : undefined}
      />
      {label && (
        <text className="chip-label" x={label[0]} y={label[1]}>
          {label[2]}
        </text>
      )}
    </g>
  );
}

// A package pin: the crossed square of the datasheet, with its name
function Pin({
  x,
  y,
  label,
  labelX,
  labelY,
  level,
}: {
  x: number;
  y: number;
  label: string;
  labelX: number;
  labelY: number;
  level?: number; // 0 / 1 for I/O pins (shown as a filled square when high)
}) {
  return (
    <g className={level === 1 ? "chip-pin high" : "chip-pin"}>
      <rect x={x} y={y} width={40} height={40} />
      <path d={`M${x} ${y} L${x + 40} ${y + 40} M${x + 40} ${y} L${x} ${y + 40}`} />
      <text
        className="chip-title"
        x={labelX}
        y={labelY}
        textAnchor="start"
        dominantBaseline="middle"
      >
        {label}
      </text>
    </g>
  );
}

// ---------- The diagram ----------

export function ChipView({ sim, previous, instruction, clockHz, lastStep }: ChipViewProps) {
  const active = activeBuses(lastStep, previous, sim);
  // Value of a register now, and whether the last step changed it
  const reg = (address: number) => sim?.file[address];
  const changedReg = (address: number) =>
    sim !== null && previous !== null && previous.file[address] !== sim.file[address];
  const show = (value: number | undefined, digits = 2) =>
    value === undefined ? "" : hex(value, digits);

  const ports = sim ? portLevels(sim.file, sim.drives) : null;
  const previousPorts = previous ? portLevels(previous.file, previous.drives) : null;
  const status = reg(STATUS) ?? 0;
  const eeadr = (reg(EEADR) ?? 0) & 0x3f;
  const stackTop = sim?.stack[0];
  const bit = (value: number, n: number) => (value >> n) & 1;

  return (
    <div className="chip-view">
      <svg viewBox="0 0 1420 1180" role="img" aria-label="PIC16F84A block diagram with live values">
        <defs>
          <marker
            id="chip-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path className="chip-arrowhead" d="M0 0 L10 5 L0 10 z" />
          </marker>
          <marker
            id="chip-arrow-on"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path className="chip-arrowhead on" d="M0 0 L10 5 L0 10 z" />
          </marker>
        </defs>

        <rect className="chip-frame" x={8} y={8} width={1404} height={1164} />

        {/* ---------- Buses (drawn first, so the blocks cover their ends) ---------- */}
        <Bus on={active.has("pc-flash")} d="M360 77 H268" label={[318, 60, "13"]} />
        <Bus on={active.has("pc-stack")} d="M470 100 V166" both />
        {/* Data bus: the trunk, plus the branches to the PC (PCL) and to the I/O ports */}
        <Bus
          on={active.has("databus")}
          d="M970 858 V68 H745"
          arrow={false}
          label={[935, 745, "8"]}
        />
        <Bus on={active.has("databus-pc")} d="M745 68 H582" label={[700, 50, "Data Bus"]} />
        <Bus on={active.has("databus-io")} d="M970 858 H1022" />
        <Bus on={active.has("databus-ram")} d="M745 68 V131" />
        <Bus on={active.has("eedata")} d="M970 202 H1008" />
        <Bus on={active.has("eeadr")} d="M970 342 H1198" />
        <Bus on={active.has("eedata-eeprom")} d="M1164 202 H1198" both />
        <Bus on={active.has("eeadr-eeprom")} d="M1284 318 V282" />
        <Bus on={active.has("program-bus")} d="M180 257 V362" label={[58, 312, "Program Bus"]} />
        <text className="chip-label" x={192} y={322}>
          14
        </text>
        <Bus
          on={active.has("direct-addr")}
          d="M235 408 V465 H680 V397"
          label={[440, 450, "Direct Addr 5"]}
        />
        <Bus
          on={active.has("indirect-addr")}
          d="M800 487 V397"
          label={[815, 440, "Indirect Addr 7"]}
        />
        <Bus on={active.has("ram-addr")} d="M745 355 V299" label={[760, 333, "RAM Addr 7"]} />
        <Bus on={active.has("databus-fsr")} d="M970 508 H904" />
        <Bus on={active.has("databus-status")} d="M904 573 H1019" both />
        <Bus d="M180 408 V741" />
        <Bus on={active.has("literal")} d="M180 625 H750 V668" label={[490, 610, "8"]} />
        <Bus on={active.has("databus-mux")} d="M970 625 H858 V668" />
        <Bus on={active.has("mux-alu")} d="M805 714 V761" />
        <Bus on={active.has("alu-w")} d="M738 832 V896" />
        <Bus on={active.has("w-alu")} d="M740 942 V985 H590 V735 H650 V761" />
        <Bus on={active.has("alu-databus")} d="M738 858 H970" />
        <Bus d="M263 797 H332" both />
        <Bus d="M263 922 H332" both />
        <Bus d="M176 979 V1023" both />
        <Bus d="M380 1027 V975" />
        <Bus d="M505 1027 V975" />
        {/* RA4/T0CKI: the pin feeds TMR0 and is also a port pin (a plain line, joined at the dot) */}
        <path className="chip-bus" d="M1113 547 H1196" />
        <Bus d="M1168 547 V785 H1153" />
        <circle className="chip-arrowhead" cx={1168} cy={547} r={6} />
        <Bus d="M1137 843 H1192" both />
        <Bus d="M1137 915 H1192" both />
        <Bus d="M1094 1007 H1192" both />

        {/* ---------- Program side ---------- */}
        <Box x={98} y={52} w={165} h={205} title={["FLASH", "Program", "Memory", "1K x 14"]} />
        <Box
          inline
          x={360}
          y={52}
          w={218}
          h={48}
          title={["PC"]}
          value={sim ? hex(sim.pc, 4) : ""}
          changed={sim !== null && previous !== null && previous.pc !== sim.pc}
        />
        <Box
          x={360}
          y={170}
          w={220}
          h={92}
          title={["8 Level Stack (13-bit)"]}
          value={sim ? (stackTop === undefined ? "empty" : hex(stackTop, 4)) : undefined}
          note={sim ? `depth ${sim.stack.length} / 8` : undefined}
          changed={sim !== null && previous !== null && previous.stack.join() !== sim.stack.join()}
        />
        <Box
          x={48}
          y={366}
          w={265}
          h={70}
          title={["Instruction Register"]}
          value={instruction ?? undefined}
        />
        <Box x={97} y={745} w={162} h={103} title={["Instruction", "Decode &", "Control"]} />
        <Box
          x={97}
          y={872}
          w={162}
          h={103}
          title={["Timing", "Generation"]}
          value={formatClock(clockHz)}
          note={sim?.sleeping ? "SLEEP: stopped" : undefined}
          changed={sim?.sleeping}
        />

        {/* Reset / timers group */}
        <rect className="chip-group" x={336} y={676} width={218} height={295} />
        <Box x={352} y={690} w={186} h={64} title={["Power-up", "Timer"]} />
        <Box x={352} y={756} w={186} h={64} title={["Oscillator", "Start-up Timer"]} />
        <Box x={352} y={822} w={186} h={64} title={["Power-on", "Reset"]} />
        <Box x={352} y={888} w={186} h={68} title={["Watchdog", "Timer"]} />

        {/* ---------- Data side ---------- */}
        <Box
          x={622}
          y={135}
          w={250}
          h={160}
          title={["RAM", "File Registers", "68 x 8"]}
          value={sim ? `Bank ${bit(status, 5)}` : undefined}
          changed={
            sim !== null && previous !== null && bit(previous.file[STATUS], 5) !== bit(status, 5)
          }
        />
        <path className="chip-shape" d="M668 355 H822 L842 393 H648 Z" />
        <text className="chip-title" x={745} y={375} textAnchor="middle" dominantBaseline="middle">
          Addr Mux
        </text>
        <Box
          inline
          x={708}
          y={487}
          w={192}
          h={43}
          title={["FSR"]}
          value={show(reg(FSR))}
          changed={changedReg(FSR)}
        />
        <Box
          inline
          x={708}
          y={555}
          w={192}
          h={40}
          title={["STATUS"]}
          value={show(reg(STATUS))}
          changed={changedReg(STATUS)}
        />
        {sim && (
          <text className="chip-note" x={804} y={612} textAnchor="middle" dominantBaseline="middle">
            Z={bit(status, 2)} DC={bit(status, 1)} C={bit(status, 0)}
          </text>
        )}

        {/* MUX, ALU, W */}
        <path className="chip-shape" d="M704 672 H902 L872 714 H734 Z" />
        <text className="chip-title" x={803} y={693} textAnchor="middle" dominantBaseline="middle">
          MUX
        </text>
        <path
          className="chip-shape"
          d="M607 765 H700 L720 785 H740 L760 765 H850 L820 832 H637 Z"
        />
        <text className="chip-title" x={728} y={812} textAnchor="middle" dominantBaseline="middle">
          ALU
        </text>
        <Box
          x={640}
          y={900}
          w={190}
          h={70}
          title={["W reg"]}
          value={sim ? hex(sim.w, 2) : undefined}
          changed={sim !== null && previous !== null && previous.w !== sim.w}
        />

        {/* EEPROM */}
        <rect className="chip-group" x={990} y={108} width={385} height={277} />
        <text className="chip-title" x={1158} y={86} textAnchor="middle" dominantBaseline="middle">
          EEPROM Data Memory
        </text>
        <Box
          x={1012}
          y={160}
          w={150}
          h={84}
          title={["EEDATA"]}
          value={show(reg(EEDATA))}
          changed={changedReg(EEDATA)}
        />
        <Box
          x={1202}
          y={128}
          w={165}
          h={150}
          title={["EEPROM", "64 x 8"]}
          value={sim ? hex(sim.eeprom[eeadr], 2) : undefined}
          note={sim ? `at EEADR ${hex(eeadr, 2)}` : undefined}
          changed={
            sim !== null && previous !== null && previous.eeprom[eeadr] !== sim.eeprom[eeadr]
          }
        />
        <Box
          x={1202}
          y={300}
          w={165}
          h={72}
          title={["EEADR"]}
          value={show(reg(EEADR))}
          changed={changedReg(EEADR)}
        />

        {/* TMR0 */}
        <Box
          x={1023}
          y={457}
          w={128}
          h={230}
          title={["TMR0"]}
          value={show(reg(TMR0))}
          changed={changedReg(TMR0)}
        />

        {/* I/O ports */}
        <Box
          x={1027}
          y={740}
          w={122}
          h={322}
          title={["I/O Ports"]}
          value={ports ? `A ${hex(ports.a, 2).slice(2)}` : undefined}
          note={ports ? `B ${hex(ports.b, 2).slice(2)}` : undefined}
          changed={
            ports !== null &&
            previousPorts !== null &&
            (ports.a !== previousPorts.a || ports.b !== previousPorts.b)
          }
        />

        {/* ---------- Pins ---------- */}
        <Pin
          x={1196}
          y={527}
          label="RA4/T0CKI"
          labelX={1250}
          labelY={547}
          level={ports ? bit(ports.a, 4) : undefined}
        />
        <Pin
          x={1196}
          y={823}
          label="RA3:RA0"
          labelX={1250}
          labelY={843}
          level={ports && (ports.a & 0x0f) !== 0 ? 1 : 0}
        />
        <Pin
          x={1196}
          y={895}
          label="RB7:RB1"
          labelX={1250}
          labelY={915}
          level={ports && (ports.b & 0xfe) !== 0 ? 1 : 0}
        />
        <Pin
          x={1196}
          y={987}
          label="RB0/INT"
          labelX={1250}
          labelY={1007}
          level={ports ? bit(ports.b, 0) : undefined}
        />
        <Pin x={156} y={1027} label="OSC1, OSC2" labelX={110} labelY={1095} />
        <Pin x={360} y={1027} label="MCLR" labelX={350} labelY={1095} />
        <Pin x={485} y={1027} label="VDD, VSS" labelX={462} labelY={1095} />
      </svg>
    </div>
  );
}
