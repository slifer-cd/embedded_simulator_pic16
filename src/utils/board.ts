// Virtual components on the pins (the Board tab).
//
// LED:    lights when its pin is driven to the active level (active high: LED from the pin
//         to ground; active low: LED from VDD to the pin). A floating pin lights nothing.
// Button: a push button with a resistor, like on a real board:
//           active low  = pull-up:   released -> pin reads 1, held -> 0
//           active high = pull-down: released -> pin reads 0, held -> 1
//         It drives the pin through the same "external drive" as the Pins panel.

export type PinRef = { port: "a" | "b"; bit: number };

export type LedColor = "red" | "green" | "yellow";

// A part as the user describes it; BoardPart adds the id it gets on the board
export type NewBoardPart =
  | { kind: "led"; pin: PinRef; activeLow: boolean; color: LedColor }
  | { kind: "button"; pin: PinRef; activeLow: boolean };

export type BoardPart = NewBoardPart & { id: number };

// Every I/O pin, for the "on pin" dropdown
export const BOARD_PINS: (PinRef & { name: string })[] = [
  ...[0, 1, 2, 3, 4].map((bit) => ({ port: "a" as const, bit, name: `RA${bit}` })),
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((bit) => ({ port: "b" as const, bit, name: `RB${bit}` })),
];

export const pinName = (pin: PinRef) => `R${pin.port.toUpperCase()}${pin.bit}`;

export const samePin = (a: PinRef, b: PinRef) => a.port === b.port && a.bit === b.bit;

// The level a button puts on its pin
export const buttonLevel = (activeLow: boolean, pressed: boolean): 0 | 1 =>
  pressed === activeLow ? 0 : 1;
