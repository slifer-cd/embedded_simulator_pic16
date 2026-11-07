// The Board tab: LEDs, push buttons and a 7-segment display on the pins (see utils/board.ts).
// LEDs follow the pin levels of the latest snapshot; buttons drive their pin while held
// (mouse, touch, or Space / Enter when focused). A small form adds parts; × removes one.

import { useState } from "react";
import type { CpuSnapshot } from "../simulator/cpu.ts";
import { pinStates } from "../simulator/pins.ts";
import { BOARD_PINS, pinName, samePin, SEGMENTS } from "../utils/board.ts";
import type { BoardPart, ButtonPart, LedColor, NewBoardPart, PinRef } from "../utils/board.ts";

type BoardViewProps = {
  sim: CpuSnapshot | null; // null = no program loaded: LEDs are off, buttons still work
  parts: BoardPart[];
  onAdd: (part: NewBoardPart) => void;
  onRemove: (id: number) => void;
  onPress: (part: ButtonPart, pressed: boolean) => void; // a button is pressed / released
};

const LED_COLORS: LedColor[] = ["red", "green", "yellow"];

// Segment shapes in a 66 x 100 box (a-g as hexagon bars, dp as a dot)
const SEGMENT_SHAPES: Record<(typeof SEGMENTS)[number], string> = {
  a: "13,4 47,4 51,8 47,12 13,12 9,8",
  b: "52,11 56,15 56,45 52,49 48,45 48,15",
  c: "52,51 56,55 56,85 52,89 48,85 48,55",
  d: "13,88 47,88 51,92 47,96 13,96 9,92",
  e: "8,51 12,55 12,85 8,89 4,85 4,55",
  f: "8,11 12,15 12,45 8,49 4,45 4,15",
  g: "13,46 47,46 51,50 47,54 13,54 9,50",
  dp: "",
};

function SevenSegment({ lit, color }: { lit: boolean[]; color: LedColor }) {
  return (
    <svg className={`board-seg7 ${color}`} viewBox="0 0 66 100" role="img" aria-hidden="true">
      <rect className="board-seg7-body" x={0} y={0} width={66} height={100} rx={4} />
      {SEGMENTS.map((segment, i) =>
        segment === "dp" ? (
          <circle key={segment} className={lit[i] ? "lit" : undefined} cx={60} cy={92} r={4} />
        ) : (
          <polygon
            key={segment}
            className={lit[i] ? "lit" : undefined}
            points={SEGMENT_SHAPES[segment]}
          />
        ),
      )}
    </svg>
  );
}

export function BoardView({ sim, parts, onAdd, onRemove, onPress }: BoardViewProps) {
  const [kind, setKind] = useState<"led" | "button" | "seg7">("led");
  const [pinIndex, setPinIndex] = useState(BOARD_PINS.findIndex((p) => p.name === "RB1"));
  const [activeLow, setActiveLow] = useState(false);
  const [color, setColor] = useState<LedColor>("red");
  const [pressed, setPressed] = useState<ReadonlySet<number>>(new Set()); // buttons held now

  const states = sim ? pinStates(sim.file, sim.drives) : null;
  const pinState = (pin: PinRef) => states?.find((s) => s.port === pin.port && s.bit === pin.bit);

  const pin: PinRef = { port: BOARD_PINS[pinIndex].port, bit: BOARD_PINS[pinIndex].bit };
  const buttonThere = parts.some((p) => p.kind === "button" && samePin(p.pin, pin));
  const displayThere = parts.some((p) => p.kind === "seg7");
  const canAdd = !(kind === "button" && buttonThere) && !(kind === "seg7" && displayThere);

  const press = (part: ButtonPart, down: boolean) => {
    if (pressed.has(part.id) === down) return;
    setPressed((old) => {
      const next = new Set(old);
      if (down) next.add(part.id);
      else next.delete(part.id);
      return next;
    });
    onPress(part, down);
  };

  return (
    <div className="board">
      {parts.length === 0 ? (
        <p className="todo">No parts yet: add an LED, a button or a 7-segment display below.</p>
      ) : (
        <div className="board-parts">
          {parts.map((part) => {
            if (part.kind === "seg7") {
              // Segment i is on RB<i>; lit when driven to the active level (not floating)
              const lit = SEGMENTS.map((_, bit) => {
                const s = pinState({ port: "b", bit });
                return s !== undefined && !s.floating && s.level === (part.activeLow ? 0 : 1);
              });
              const on = SEGMENTS.filter((_, i) => lit[i]).join(" ") || "none";
              return (
                <div key={part.id} className="board-part" aria-label={`7-segment display: ${on}`}>
                  <SevenSegment lit={lit} color={part.color} />
                  <span className="board-name">
                    PORTB
                    <span className="board-low"> ({part.activeLow ? "CA" : "CC"})</span>
                  </span>
                  <button
                    type="button"
                    className="board-remove"
                    aria-label="Remove the 7-segment display"
                    title="Remove"
                    onClick={() => onRemove(part.id)}
                  >
                    ×
                  </button>
                </div>
              );
            }

            const state = pinState(part.pin);
            const name = pinName(part.pin);
            const remove = (
              <button
                type="button"
                className="board-remove"
                aria-label={`Remove the ${part.kind === "led" ? "LED" : "button"} on ${name}`}
                title="Remove"
                onClick={() => onRemove(part.id)}
              >
                ×
              </button>
            );

            if (part.kind === "led") {
              // Lit when the pin is really driven to the active level (not when floating)
              const lit =
                state !== undefined && !state.floating && state.level === (part.activeLow ? 0 : 1);
              return (
                <div key={part.id} className="board-part">
                  <span
                    className={`board-led ${part.color}${lit ? " lit" : ""}`}
                    role="img"
                    aria-label={`LED on ${name}: ${lit ? "on" : "off"}`}
                  />
                  <span className="board-name">
                    {name}
                    {part.activeLow && <span className="board-low"> (low)</span>}
                  </span>
                  {remove}
                </div>
              );
            }

            const held = pressed.has(part.id);
            return (
              <div key={part.id} className="board-part">
                <button
                  type="button"
                  className={`board-button${held ? " held" : ""}`}
                  aria-pressed={held}
                  title={`Hold to press: ${name} reads ${part.activeLow ? "0" : "1"} while held (${
                    part.activeLow ? "pull-up" : "pull-down"
                  } resistor)`}
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId); // release counts even outside
                    press(part, true);
                  }}
                  onPointerUp={() => press(part, false)}
                  onPointerCancel={() => press(part, false)}
                  onKeyDown={(e) => {
                    if (e.key === " " || e.key === "Enter") {
                      e.preventDefault();
                      press(part, true);
                    }
                  }}
                  onKeyUp={(e) => {
                    if (e.key === " " || e.key === "Enter") press(part, false);
                  }}
                  onBlur={() => press(part, false)}
                />
                <span className="board-name">
                  {name}
                  {part.activeLow && <span className="board-low"> (low)</span>}
                </span>
                {remove}
              </div>
            );
          })}
        </div>
      )}

      {/* Add a part */}
      <form
        className="board-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!canAdd) return;
          if (kind === "led") onAdd({ kind, pin, activeLow, color });
          else if (kind === "button") onAdd({ kind, pin, activeLow });
          else onAdd({ kind, activeLow, color });
        }}
      >
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as "led" | "button" | "seg7")}
          aria-label="Part"
        >
          <option value="led">LED</option>
          <option value="button">Button</option>
          <option value="seg7">7-segment</option>
        </select>
        <span>on</span>
        {kind === "seg7" ? (
          <span title="Segments a-g on RB0-RB6, the decimal point on RB7">PORTB</span>
        ) : (
          <select
            value={pinIndex}
            onChange={(e) => setPinIndex(Number(e.target.value))}
            aria-label="Pin"
          >
            {BOARD_PINS.map((p, i) => (
              <option key={p.name} value={i}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        <select
          value={activeLow ? "low" : "high"}
          onChange={(e) => setActiveLow(e.target.value === "low")}
          aria-label="Active level"
          title={
            kind === "led"
              ? "Active high: lights at 1. Active low: lights at 0."
              : kind === "button"
                ? "Active high: reads 1 while held (pull-down). Active low: reads 0 while held (pull-up)."
                : "Common cathode: a 1 lights a segment. Common anode: a 0 lights it."
          }
        >
          <option value="high">{kind === "seg7" ? "common cathode" : "active high"}</option>
          <option value="low">{kind === "seg7" ? "common anode" : "active low"}</option>
        </select>
        {kind !== "button" && (
          <select
            value={color}
            onChange={(e) => setColor(e.target.value as LedColor)}
            aria-label="Colour"
          >
            {LED_COLORS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}
        <button
          type="submit"
          disabled={!canAdd}
          title={
            canAdd
              ? undefined
              : kind === "seg7"
                ? "There is already a 7-segment display on PORTB"
                : "This pin already has a button"
          }
        >
          Add
        </button>
      </form>
    </div>
  );
}
