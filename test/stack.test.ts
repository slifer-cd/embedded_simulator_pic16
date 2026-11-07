import { describe, expect, it } from "vite-plus/test";
import { Stack } from "../src/simulator/stack.ts";

describe("stack", () => {
  it("returns addresses last in, first out", () => {
    const stack = new Stack();
    stack.push(0x010);
    stack.push(0x020);
    expect(stack.entries()).toEqual([0x020, 0x010]); // newest first
    expect(stack.pop()).toEqual({ address: 0x020, underflow: false });
    expect(stack.pop()).toEqual({ address: 0x010, underflow: false });
    expect(stack.depth).toBe(0);
  });

  it("keeps 13 bits", () => {
    const stack = new Stack();
    stack.push(0xffff);
    expect(stack.pop().address).toBe(0x1fff);
  });

  it("overwrites the oldest address on the 9th push (overflow)", () => {
    const stack = new Stack();
    for (let i = 1; i <= 8; i++) expect(stack.push(i).overflow).toBe(false);
    expect(stack.push(9).overflow).toBe(true);
    expect(stack.depth).toBe(8);
    expect(stack.entries()).toEqual([9, 8, 7, 6, 5, 4, 3, 2]); // 1 is lost
  });

  it("returns a leftover value when popping more than was pushed (underflow)", () => {
    const stack = new Stack();
    stack.push(0x123);
    stack.pop();
    const { address, underflow } = stack.pop();
    expect(underflow).toBe(true);
    expect(address).toBe(0); // slot 7: never written since reset
    expect(stack.depth).toBe(0);
  });

  it("is circular like the chip: after an overflow, 8 pops give the 8 newest", () => {
    const stack = new Stack();
    for (let i = 1; i <= 10; i++) stack.push(i);
    const popped = Array.from({ length: 8 }, () => stack.pop().address);
    expect(popped).toEqual([10, 9, 8, 7, 6, 5, 4, 3]);
  });

  it("saves and restores its state, and reset empties it", () => {
    const stack = new Stack();
    stack.push(0x100);
    stack.push(0x200);
    const saved = stack.save();
    stack.pop();
    stack.push(0x300);
    stack.restore(saved);
    expect(stack.entries()).toEqual([0x200, 0x100]);

    stack.reset();
    expect(stack.depth).toBe(0);
    expect(stack.entries()).toEqual([]);
  });

  it("fills an existing state object in place", () => {
    const stack = new Stack();
    const target = stack.save();
    stack.push(0x42);
    expect(stack.save(target)).toBe(target);
    expect(target.depth).toBe(1);
  });
});
