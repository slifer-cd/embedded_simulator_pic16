// Keep breakpoints on their code when lines are added or removed above them.
//
// The old and new text are compared line by line:
//   - the lines that are the same at the TOP keep their numbers
//   - the lines that are the same at the BOTTOM move by (new line count - old line count)
//   - the changed lines in between: a breakpoint stays at the same place in the block if
//     the block still has that many lines (e.g. a line edited, or split by Enter in the
//     middle), else it moves to the block's last line; if the whole block was deleted,
//     its breakpoints are removed.
//
// Examples (breakpoint on line 5):
//   Enter at the START of line 5  -> line 5 moved down: breakpoint -> 6
//   Enter at the END of line 5    -> line 5 stays:       breakpoint stays on 5
//   lines 1-2 deleted             -> breakpoint -> 3
//   line 5 deleted                -> breakpoint removed

export function moveBreakpoints(
  oldText: string,
  newText: string,
  breakpoints: ReadonlySet<number>,
): ReadonlySet<number> {
  if (breakpoints.size === 0 || oldText === newText) return breakpoints;

  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const shortest = Math.min(oldLines.length, newLines.length);

  // Same lines at the top
  let top = 0;
  while (top < shortest && oldLines[top] === newLines[top]) top++;

  // Same lines at the bottom (not overlapping the top part)
  let bottom = 0;
  while (
    bottom < shortest - top &&
    oldLines[oldLines.length - 1 - bottom] === newLines[newLines.length - 1 - bottom]
  ) {
    bottom++;
  }

  const oldChanged = oldLines.length - top - bottom; // lines in the changed block, before
  const newChanged = newLines.length - top - bottom; // ... and after the edit
  const shift = newLines.length - oldLines.length;

  const moved = new Set<number>();
  for (const line of breakpoints) {
    const index = line - 1; // 0-based
    if (index < top) {
      moved.add(line); // above the edit
    } else if (index >= top + oldChanged) {
      moved.add(line + shift); // below the edit
    } else if (newChanged > 0) {
      const offset = Math.min(index - top, newChanged - 1); // inside the edited block
      moved.add(top + offset + 1);
    } // else: the block was deleted, and the breakpoint with it
  }
  return moved;
}
