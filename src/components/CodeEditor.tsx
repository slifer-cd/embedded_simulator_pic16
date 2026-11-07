import { useRef } from "react";
import type { Ref } from "react";

type CodeEditorProps = {
  code: string;
  onChange: (code: string) => void;
  ref?: Ref<HTMLTextAreaElement>; // lets the parent select lines (e.g. from a message)
};

export function CodeEditor({ code, onChange, ref }: CodeEditorProps) {
  const gutterRef = useRef<HTMLDivElement>(null);

  // "1\n2\n3..." one number per line of code
  const lineCount = code.split("\n").length;
  const lineNumbers = Array.from({ length: lineCount }, (_, i) => i + 1).join("\n");

  return (
    <div className="editor-wrap">
      <div className="editor-gutter" ref={gutterRef} aria-hidden="true">
        {lineNumbers}
      </div>
      <textarea
        ref={ref}
        className="editor"
        value={code}
        onChange={(e) => onChange(e.target.value)}
        // keep the line numbers scrolled together with the code
        onScroll={(e) => {
          if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop;
        }}
        spellCheck={false}
        wrap="off"
      />
    </div>
  );
}
