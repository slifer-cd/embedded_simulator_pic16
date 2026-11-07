import { useRef, useState } from "react";
import type { KeyboardEvent, Ref } from "react";

type CodeEditorProps = {
  code: string;
  onChange: (code: string) => void;
  currentLine?: number; // line of the instruction the simulator runs next (highlighted)
  ref?: Ref<HTMLTextAreaElement>; // lets the parent select lines (e.g. from a message)
  breakpoints: ReadonlySet<number>; // lines with a breakpoint
  codeLines: ReadonlySet<number> | null; // lines with an instruction (null = not assembled yet)
  onToggleBreakpoint: (line: number) => void;
};

const LINE_HEIGHT_EM = 1.5; // must match line-height in App.css (.editor)
const TAB_SIZE = 8; // must match tab-size in App.css; MPASM code is usually aligned to 8 columns

// ---------- Tab key ----------
// Tab inserts spaces up to the next tab stop (columns 8, 16, 24, ...) instead of leaving the editor.
// Shift+Tab removes spaces back to the previous tab stop.
// With several lines selected, Tab / Shift+Tab indent / outdent every selected line.

// Column of a position on its line (a tab character counts up to the next tab stop)
function columnOf(text: string, position: number): number {
  const lineStart = text.lastIndexOf("\n", position - 1) + 1;
  let column = 0;
  for (let i = lineStart; i < position; i++) {
    column = text[i] === "\t" ? column + TAB_SIZE - (column % TAB_SIZE) : column + 1;
  }
  return column;
}

// Replace the selection with text. execCommand is deprecated, but it is still the only way
// that keeps the browser's undo (Ctrl+Z) working in a textarea; setRangeText is the fallback.
function replaceSelection(textarea: HTMLTextAreaElement, text: string): void {
  if (!document.execCommand("insertText", false, text)) {
    textarea.setRangeText(text, textarea.selectionStart, textarea.selectionEnd, "end");
    textarea.dispatchEvent(new Event("input", { bubbles: true })); // tell React the value changed
  }
}

// Indent (or outdent) every line touched by the selection
function shiftLines(textarea: HTMLTextAreaElement, outdent: boolean): void {
  const { value, selectionStart, selectionEnd } = textarea;
  const blockStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
  // a selection ending right at the start of a line does not include that line
  const end =
    selectionEnd > selectionStart && value[selectionEnd - 1] === "\n"
      ? selectionEnd - 1
      : selectionEnd;
  const nextNewline = value.indexOf("\n", end);
  const blockEnd = nextNewline === -1 ? value.length : nextNewline;

  const indent = " ".repeat(TAB_SIZE);
  const lines = value.slice(blockStart, blockEnd).split("\n");
  const shifted = lines.map((line) => {
    if (!outdent) return line === "" ? line : indent + line;
    const spaces = /^ */.exec(line)![0].length;
    return line.slice(Math.min(spaces, TAB_SIZE));
  });

  const newBlock = shifted.join("\n");
  textarea.setSelectionRange(blockStart, blockEnd);
  replaceSelection(textarea, newBlock);
  textarea.setSelectionRange(blockStart, blockStart + newBlock.length);
}

function handleTab(e: KeyboardEvent<HTMLTextAreaElement>): void {
  if (e.key !== "Tab" || e.ctrlKey || e.altKey || e.metaKey) return;
  e.preventDefault(); // stay in the editor

  const textarea = e.currentTarget;
  const { value, selectionStart, selectionEnd } = textarea;

  // Several lines selected: indent / outdent them all
  if (value.slice(selectionStart, selectionEnd).includes("\n")) {
    shiftLines(textarea, e.shiftKey);
    return;
  }

  if (e.shiftKey) {
    // Remove spaces before the cursor, back to the previous tab stop
    const column = columnOf(value, selectionStart);
    const wanted = column % TAB_SIZE || TAB_SIZE;
    let count = 0;
    while (count < wanted && value[selectionStart - count - 1] === " ") count++;
    if (count > 0) {
      textarea.setSelectionRange(selectionStart - count, selectionStart);
      replaceSelection(textarea, "");
    }
    return;
  }

  // Insert spaces up to the next tab stop
  const column = columnOf(value, selectionStart);
  replaceSelection(textarea, " ".repeat(TAB_SIZE - (column % TAB_SIZE)));
}

// Line (1-based) of a position in the text
function lineOf(text: string, position: number): number {
  let line = 1;
  for (let i = 0; i < position; i++) if (text[i] === "\n") line++;
  return line;
}

export function CodeEditor(props: CodeEditorProps) {
  const { code, onChange, currentLine, ref, breakpoints, codeLines, onToggleBreakpoint } = props;
  const gutterRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const lineCount = code.split("\n").length;
  const lineNumbers = Array.from({ length: lineCount }, (_, i) => i + 1);

  return (
    <div className="editor-wrap">
      <div className="editor-gutter" ref={gutterRef} aria-hidden="true">
        {/* Click a line number to set / clear a breakpoint (F9 does the same for the cursor's line).
            A breakpoint on a line without an instruction can't stop anything: shown hollow. */}
        {lineNumbers.map((n) => {
          const breakpoint = breakpoints.has(n);
          const inactive = breakpoint && codeLines !== null && !codeLines.has(n);
          const classes = [
            n === currentLine ? "current" : "",
            breakpoint ? "breakpoint" : "",
            inactive ? "inactive" : "",
          ];
          return (
            <div
              key={n}
              className={classes.join(" ").trim() || undefined}
              onClick={() => onToggleBreakpoint(n)}
              title={
                inactive
                  ? "Breakpoint on a line without an instruction: it never stops. Click to remove."
                  : breakpoint
                    ? "Breakpoint: Run stops before this line. Click to remove."
                    : "Click to set a breakpoint (or F9 in the editor)"
              }
            >
              {n}
            </div>
          );
        })}
      </div>

      <div className="editor-area">
        {/* Bar behind the text that marks the current line (moves with scrolling) */}
        {currentLine !== undefined && (
          <div
            className="editor-current"
            style={{ top: `calc(4px + ${(currentLine - 1) * LINE_HEIGHT_EM}em - ${scrollTop}px)` }}
          />
        )}
        <textarea
          ref={ref}
          className="editor"
          value={code}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "F9") {
              e.preventDefault();
              onToggleBreakpoint(lineOf(code, e.currentTarget.selectionStart));
              return;
            }
            handleTab(e);
          }}
          // keep the line numbers and the current-line bar scrolled together with the code
          onScroll={(e) => {
            const top = e.currentTarget.scrollTop;
            if (gutterRef.current) gutterRef.current.scrollTop = top;
            setScrollTop(top);
          }}
          spellCheck={false}
          wrap="off"
        />
      </div>
    </div>
  );
}
