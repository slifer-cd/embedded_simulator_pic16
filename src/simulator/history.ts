// Execution history for stepping back: the chip state BEFORE each of the last steps,
// in a ring buffer. The slots are created once and then reused (saveState fills them
// in place), so recording every step during Run stays cheap.
//
// record() before a step, noteStep() with its result after it. back() restores the state
// before the most recent step and forgets it. When the buffer is full, the oldest entry
// is overwritten. entries() lists the steps for the History panel.

import type { Cpu, CpuState, StepResult } from "./cpu.ts";

// What happened in a step (bits, several can be set)
export const STEP_EVENT = {
  interrupt: 1, // jumped to 0x0004 after the instruction
  watchdogReset: 2,
  wakeUpWatchdog: 4,
  wakeUpInterrupt: 8,
  asleep: 16, // the CPU was in SLEEP: no instruction ran, only time passed
} as const;

// One step, for the History panel
export type HistoryEntry = {
  stepsBack: number; // 1 = the last step; back(cpu, stepsBack) returns to before it
  address: number; // PC before the step
  word: number; // instruction word at that address
  cycles: number; // cycle count before the step
  events: number; // STEP_EVENT bits
};

export class History {
  readonly capacity: number;
  private readonly slots: CpuState[] = []; // filled up to capacity, then reused
  private readonly events: Uint8Array; // STEP_EVENT bits per slot
  private readonly words: Uint16Array; // instruction word per slot
  private next = 0; // slot the next record() writes to
  private count = 0; // entries that can be stepped back to

  constructor(capacity: number) {
    this.capacity = capacity;
    this.events = new Uint8Array(capacity);
    this.words = new Uint16Array(capacity);
  }

  get length(): number {
    return this.count;
  }

  // Save the state before a step
  record(cpu: Cpu): void {
    if (this.next < this.slots.length) cpu.saveState(this.slots[this.next]);
    else this.slots.push(cpu.saveState()); // only while the buffer is filling for the first time
    this.words[this.next] = cpu.memory.program[cpu.pc % cpu.memory.program.length];
    this.events[this.next] = cpu.sleeping ? STEP_EVENT.asleep : 0;
    this.next = (this.next + 1) % this.capacity;
    this.count = Math.min(this.count + 1, this.capacity);
  }

  // Add what happened in the step that was just recorded
  noteStep(step: StepResult): void {
    if (this.count === 0) return;
    const last = (this.next + this.capacity - 1) % this.capacity;
    if (step.interrupt) this.events[last] |= STEP_EVENT.interrupt;
    if (step.watchdogReset) this.events[last] |= STEP_EVENT.watchdogReset;
    if (step.wakeUp === "watchdog") this.events[last] |= STEP_EVENT.wakeUpWatchdog;
    if (step.wakeUp === "interrupt") this.events[last] |= STEP_EVENT.wakeUpInterrupt;
  }

  // Go back "steps" steps (1 = undo the last one). Returns false when there is nothing to go back to.
  back(cpu: Cpu, steps = 1): boolean {
    const n = Math.min(steps, this.count);
    if (n <= 0) return false;
    this.next = (this.next + this.capacity - n) % this.capacity;
    this.count -= n;
    cpu.restoreState(this.slots[this.next]);
    return true;
  }

  // The last "limit" steps, newest first
  entries(limit: number): HistoryEntry[] {
    const result: HistoryEntry[] = [];
    for (let back = 1; back <= Math.min(limit, this.count); back++) {
      const slot = (this.next + this.capacity - back) % this.capacity;
      const state = this.slots[slot];
      result.push({
        stepsBack: back,
        address: state.pc,
        word: this.words[slot],
        cycles: state.cycles,
        events: this.events[slot],
      });
    }
    return result;
  }

  // Forget everything (new program, power-on reset). The slots are kept for reuse.
  clear(): void {
    this.next = 0;
    this.count = 0;
  }
}
