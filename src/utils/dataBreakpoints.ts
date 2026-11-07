// Data breakpoints: stop Run when a register / RAM byte (or W) changes, or when it becomes
// a given value. Checked after every step during Run, Step Over and Step Out.
//
// "becomes" stops once, on the step where the value turns into the target value; it
// does not stop again on every step while the value stays there.
// PORTA / PORTB are watched as the program reads them: the pin levels.

import { GPR_END, GPR_START, REGISTERS } from "../chip/registers.ts";

export const W_TARGET = -1; // "address" used for the W register (it is not in data memory)

export type DataBreakpoint = {
  target: number; // canonical data memory address, or W_TARGET
  value: number | null; // null = stop on any change; a number = stop when it becomes this value
  label: string; // name when it was added ("W", "TMR0", "count"), for the list and messages
};

export const dataBreakpointKey = (bp: DataBreakpoint) => `${bp.target}:${bp.value ?? "change"}`;

// Did this step hit the breakpoint?
export function dataBreakpointHit(bp: DataBreakpoint, before: number, after: number): boolean {
  if (bp.value === null) return after !== before;
  return after === bp.value && before !== bp.value;
}

// Targets for the dropdown: W, the special registers, then every RAM byte (with its names)
export function dataBreakpointTargets(ramNames: Map<number, string[]>) {
  const targets = [{ target: W_TARGET, label: "W" }];
  for (const reg of REGISTERS) {
    if (reg.name === "INDF" || reg.name === "EECON2") continue; // not real storage
    targets.push({ target: reg.address, label: reg.name });
  }
  for (let address = GPR_START; address <= GPR_END; address++) {
    const hex = `0x${address.toString(16).toUpperCase().padStart(2, "0")}`;
    const names = ramNames.get(address);
    targets.push({ target: address, label: names ? `${names.join(", ")} (${hex})` : `RAM ${hex}` });
  }
  return targets;
}

// Name for messages: "W", "TMR0", "count", "RAM 0x20"
export function targetName(target: number, ramNames: Map<number, string[]>): string {
  if (target === W_TARGET) return "W";
  const reg = REGISTERS.find((r) => r.address === target);
  if (reg) return reg.name;
  return ramNames.get(target)?.[0] ?? `RAM 0x${target.toString(16).toUpperCase().padStart(2, "0")}`;
}
