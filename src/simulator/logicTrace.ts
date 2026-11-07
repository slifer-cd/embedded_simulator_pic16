// Logic analyzer recording: the PORTA / PORTB pin levels over time.
//
// Only CHANGES are stored: (cycle, PORTA levels, PORTB levels), in a ring buffer.
// The pin levels are a function of the output latches, TRIS, OPTION (PORTB pull-ups) and
// the external drives (pins.ts). sample() runs after every step but only compares those
// few bytes (and the drives' version number); the levels are computed only when one of
// them changed, so recording costs almost nothing while Run is going.

import type { Cpu } from "./cpu.ts";
import { portLevels } from "./pins.ts";

const PORTA = 0x05;
const PORTB = 0x06;
const OPTION_REG = 0x81;
const TRISA = 0x85;
const TRISB = 0x86;

// Changes in a time window, for drawing: the levels before the window start, then each change
export type LogicWindow = {
  start: number; // first cycle of the window
  end: number; // last cycle (now)
  initialA: number;
  initialB: number;
  cycles: number[]; // cycle of each change inside the window
  a: number[];
  b: number[];
};

export class LogicTrace {
  readonly capacity: number;
  private readonly cycleAt: Float64Array;
  private readonly levelsA: Uint8Array;
  private readonly levelsB: Uint8Array;
  private first = 0; // index of the oldest entry
  private count = 0;
  // What the levels were computed from last time
  private readonly inputs = new Int32Array(6).fill(-1); // PORTA, PORTB, TRISA, TRISB, OPTION, drives

  constructor(capacity: number) {
    this.capacity = capacity;
    this.cycleAt = new Float64Array(capacity);
    this.levelsA = new Uint8Array(capacity);
    this.levelsB = new Uint8Array(capacity);
  }

  get length(): number {
    return this.count;
  }

  // Forget everything (new program, power-on reset); the next sample() starts the recording
  clear(): void {
    this.first = 0;
    this.count = 0;
    this.inputs.fill(-1);
  }

  // After a step (or a pin drive change): record the levels if they changed
  sample(cpu: Cpu): void {
    const file = cpu.memory.file;
    const inputs = [
      file[PORTA],
      file[PORTB],
      file[TRISA],
      file[TRISB],
      file[OPTION_REG],
      cpu.memory.pins.version,
    ];
    let same = true;
    for (let i = 0; i < inputs.length; i++) {
      if (this.inputs[i] !== inputs[i]) {
        same = false;
        this.inputs[i] = inputs[i];
      }
    }
    if (same) return;

    const { a, b } = portLevels(file, cpu.memory.pins.drives);
    if (this.count > 0) {
      const last = this.index(this.count - 1);
      if (this.levelsA[last] === a && this.levelsB[last] === b) return; // inputs moved, levels didn't
    }
    this.push(cpu.cycles, a, b);
  }

  // Step Back: forget the changes after "cycle" (they haven't happened any more)
  truncate(cycle: number): void {
    while (this.count > 1 && this.cycleAt[this.index(this.count - 1)] > cycle) this.count--;
    this.inputs.fill(-1); // compare from scratch at the next sample
  }

  // The changes between start and end (the levels at "start" come from the last earlier change)
  window(start: number, end: number): LogicWindow {
    const result: LogicWindow = { start, end, initialA: 0, initialB: 0, cycles: [], a: [], b: [] };
    for (let i = 0; i < this.count; i++) {
      const k = this.index(i);
      const cycle = this.cycleAt[k];
      if (cycle > end) break;
      if (cycle <= start) {
        result.initialA = this.levelsA[k];
        result.initialB = this.levelsB[k];
      } else {
        result.cycles.push(cycle);
        result.a.push(this.levelsA[k]);
        result.b.push(this.levelsB[k]);
      }
    }
    return result;
  }

  private index(i: number): number {
    return (this.first + i) % this.capacity;
  }

  private push(cycle: number, a: number, b: number): void {
    // Two changes in the same cycle (e.g. a click right after a step): keep the newest
    if (this.count > 0 && this.cycleAt[this.index(this.count - 1)] === cycle) {
      const last = this.index(this.count - 1);
      this.levelsA[last] = a;
      this.levelsB[last] = b;
      return;
    }
    if (this.count === this.capacity) {
      this.first = (this.first + 1) % this.capacity; // full: drop the oldest
      this.count--;
    }
    const k = this.index(this.count);
    this.cycleAt[k] = cycle;
    this.levelsA[k] = a;
    this.levelsB[k] = b;
    this.count++;
  }
}
