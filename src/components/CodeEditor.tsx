type CodeEditorProps = {
  code: string;
  onChange: (code: string) => void;
};

export function CodeEditor({ code, onChange }: CodeEditorProps) {
  return (
    <textarea
      className="editor"
      value={code}
      onChange={(e) => onChange(e.target.value)}
      spellCheck={false}
    />
  );
}
