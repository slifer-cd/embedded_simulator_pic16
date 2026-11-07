// Editor helpers for line numbers (1-based, same as assembler messages).

const PADDING_TOP = 4; // must match .editor padding-top in App.css

function lineHeightOf(textarea: HTMLTextAreaElement): number {
  const style = getComputedStyle(textarea);
  return parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5;
}

// Scroll so the line is in the middle of the view
function centerLine(textarea: HTMLTextAreaElement, index: number): void {
  const lineHeight = lineHeightOf(textarea);
  textarea.scrollTop = index * lineHeight - textarea.clientHeight / 2 + lineHeight / 2;
}

// Select a whole line and scroll it into the middle of the view
export function selectLine(textarea: HTMLTextAreaElement, line: number): void {
  const lines = textarea.value.split("\n");
  const index = Math.min(Math.max(line, 1), lines.length) - 1;

  // Character offset where the line starts: every earlier line + its "\n"
  let start = 0;
  for (let i = 0; i < index; i++) start += lines[i].length + 1;
  const end = start + lines[index].length;

  textarea.focus();
  textarea.setSelectionRange(start, end);

  // Browsers don't always scroll to the selection, so scroll by line height
  centerLine(textarea, index);
}

// Scroll only if the line is not fully visible (used to follow the simulator's current line)
export function scrollLineIntoView(textarea: HTMLTextAreaElement, line: number): void {
  const lineHeight = lineHeightOf(textarea);
  const index = Math.max(line, 1) - 1;
  const top = PADDING_TOP + index * lineHeight;
  const visibleTop = textarea.scrollTop;
  const visibleBottom = visibleTop + textarea.clientHeight;
  if (top >= visibleTop && top + lineHeight <= visibleBottom) return;
  centerLine(textarea, index);
}
