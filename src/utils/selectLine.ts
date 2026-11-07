// Select a whole line in a textarea and scroll it into the middle of the view.
// line is 1-based (same as assembler messages).

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
  const style = getComputedStyle(textarea);
  const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5;
  textarea.scrollTop = index * lineHeight - textarea.clientHeight / 2 + lineHeight / 2;
}
