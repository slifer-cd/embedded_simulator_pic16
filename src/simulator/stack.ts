// Hardware stack: 8 levels of 13-bit return addresses.
//
// It is not part of data memory: only CALL / interrupts push and RETURN / RETLW / RETFIE pop.
// Like the real chip it is circular and has no error flags:
//   - a 9th push overwrites the oldest level
//   - popping more than was pushed returns an old leftover value
// The simulator keeps an extra "depth" counter only to warn about these cases.

import { MEMORY } from "../chip/config.ts";

const PC_MASK = 0x1fff; // 13-bit program counter

export type PushResult = { overflow: boolean }; // true: the oldest return address was lost
export type PopResult = { address: number; underflow: boolean }; // true: address is a leftover value

export type StackState = { slots: Uint16Array; pointer: number; depth: number };

export class Stack {
  readonly slots = new Uint16Array(MEMORY.STACK_DEPTH);
  pointer = 0; // slot the next push writes to (wraps 7 -> 0)
  depth = 0; // valid return addresses (0-8), simulator only

  push(address: number): PushResult {
    const overflow = this.depth === MEMORY.STACK_DEPTH;

    this.slots[this.pointer] = address & PC_MASK;
    this.pointer = (this.pointer + 1) % MEMORY.STACK_DEPTH;
    if (!overflow) this.depth++;

    return { overflow };
  }

  pop(): PopResult {
    const underflow = this.depth === 0;

    this.pointer = (this.pointer + MEMORY.STACK_DEPTH - 1) % MEMORY.STACK_DEPTH;
    if (!underflow) this.depth--;

    return { address: this.slots[this.pointer], underflow };
  }

  // Fills "into" when given (no new objects: used by the history ring buffer)
  save(into?: StackState): StackState {
    if (!into) return { slots: this.slots.slice(), pointer: this.pointer, depth: this.depth };
    into.slots.set(this.slots);
    into.pointer = this.pointer;
    into.depth = this.depth;
    return into;
  }

  restore(state: StackState): void {
    this.slots.set(state.slots);
    this.pointer = state.pointer;
    this.depth = state.depth;
  }

  // Power-on reset: pointer and depth back to 0 (slot contents are unknown on the chip; cleared here)
  reset(): void {
    this.slots.fill(0);
    this.pointer = 0;
    this.depth = 0;
  }

  // For the Stack panel: entries from the most recent push (top) down, only the valid ones
  entries(): number[] {
    const result: number[] = [];
    for (let i = 1; i <= this.depth; i++) {
      result.push(this.slots[(this.pointer - i + MEMORY.STACK_DEPTH) % MEMORY.STACK_DEPTH]);
    }
    return result;
  }
}
