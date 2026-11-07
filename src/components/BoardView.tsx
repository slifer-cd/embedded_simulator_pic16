// The Board tab: LEDs and push buttons on the pins (see utils/board.ts).
// LEDs follow the pin levels of the latest snapshot; buttons drive their pin while held
// (mouse, touch, or Space / Enter when focused). A small form adds parts; × removes one.

import { useState } from "react";
import type { CpuSnapshot } from "../simulator/cpu.ts";
import { pinStates } from "../simulator/pins.ts";
import { BOARD_PINS, pinName, samePin } from "../utils/board.ts";
import type { BoardPart, LedColor, NewBoardPart, PinRef } from "../utils/board.ts";

type BoardViewProps = {
  sim: CpuSnapshot | null; // null = no program loaded: LEDs are off, buttons still work
  parts: BoardPart[];
  onAdd: (part: NewBoardPart) => void;
  onRemove: (id: number) => void;
  onPress: (part: BoardPart, pressed: boolean) => void; // a button is pressed / released
};

const LED_COLORS: LedColor[] = ["red", "green", "yellow"];

export function BoardView({ sim, parts, onAdd, onRemove, onPress }: BoardViewProps) {
  const [kind, setKind] = useState<"led" | "button">("led");
  const [pinIndex, setPinIndex] = useState(BOARD_PINS.findIndex((p) => p.name === "RB1"));
  const [activeLow, setActiveLow] = useState(false);
  const [color, setColor] = useState<LedColor>("red");
  const [pressed, setPressed] = useState<ReadonlySet<number>>(new Set()); // buttons held now

  const states = sim ? pinStates(sim.file, sim.drives) : null;
  const pinState = (pin: PinRef) => states?.find((s) => s.port === pin.port && s.bit === pin.bit);

  const pin: PinRef = { port: BOARD_PINS[pinIndex].port, bit: BOARD_PINS[pinIndex].bit };
  const buttonThere = parts.some((p) => p.kind === "button" && samePin(p.pin, pin));
  const canAdd = !(kind === "button" && buttonThere);

  const press = (part: BoardPart, down: boolean) => {
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
        <p className="todo">No parts yet: add an LED or a button below.</p>
      ) : (
        <div className="board-parts">
          {parts.map((part) => {
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
          onAdd(kind === "led" ? { kind, pin, activeLow, color } : { kind, pin, activeLow });
        }}
      >
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as "led" | "button")}
          aria-label="Part"
        >
          <option value="led">LED</option>
          <option value="button">Button</option>
        </select>
        <span>on</span>
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
        <select
          value={activeLow ? "low" : "high"}
          onChange={(e) => setActiveLow(e.target.value === "low")}
          aria-label="Active level"
          title={
            kind === "led"
              ? "Active high: lights at 1. Active low: lights at 0."
              : "Active high: reads 1 while held (pull-down). Active low: reads 0 while held (pull-up)."
          }
        >
          <option value="high">active high</option>
          <option value="low">active low</option>
        </select>
        {kind === "led" && (
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
          title={canAdd ? undefined : "This pin already has a button"}
        >
          Add
        </button>
      </form>
    </div>
  );
}
