// Virtual components on the pins (the Board tab).
//
// LED:    lights when its pin is driven to the active level (active high: LED from the pin
//         to ground; active low: LED from VDD to the pin). A floating pin lights nothing.
// Button: a push button with a resistor, like on a real board:
//           active low  = pull-up:   released -> pin reads 1, held -> 0
//           active high = pull-down: released -> pin reads 0, held -> 1
//         It drives the pin through the same "external drive" as the Pins panel.
// 7-segment display: on PORTB, segments a-g on RB0-RB6 and the decimal point on RB7
//         (the usual wiring). Common cathode: a 1 lights a segment; common anode: a 0.
//
//              a
//            -----
//         f |     | b
//           |  g  |
//            -----
//         e |     | c
//           |     |
//            -----  . dp
//              d

export type PinRef = { port: "a" | "b"; bit: number };

export type LedColor = "red" | "green" | "yellow";

// A part as the user describes it; BoardPart adds the id it gets on the board
export type NewBoardPart =
  | { kind: "led"; pin: PinRef; activeLow: boolean; color: LedColor }
  | { kind: "button"; pin: PinRef; activeLow: boolean }
  | { kind: "seg7"; activeLow: boolean; color: LedColor }; // activeLow = common anode

export type BoardPart = NewBoardPart & { id: number };
export type ButtonPart = Extract<BoardPart, { kind: "button" }>;

export const SEGMENTS = ["a", "b", "c", "d", "e", "f", "g", "dp"] as const; // RB0 ... RB7

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
