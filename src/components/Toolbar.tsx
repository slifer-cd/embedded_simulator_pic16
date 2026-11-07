export type OutputFile = "hex" | "lst" | "err";

type ToolbarProps = {
  onAssemble: () => void;
  onDownload: (file: OutputFile) => void;
  canDownload: Record<OutputFile, boolean>; // which download buttons are enabled
};

const OUTPUT_FILES: OutputFile[] = ["hex", "lst", "err"];

export function Toolbar({ onAssemble, onDownload, canDownload }: ToolbarProps) {
  return (
    <header className="toolbar">
      <h1>PIC16F84A Simulator</h1>
      <div className="buttons">
        <button type="button" onClick={onAssemble}>
          Assemble
        </button>
        {OUTPUT_FILES.map((file) => (
          <button
            key={file}
            type="button"
            onClick={() => onDownload(file)}
            disabled={!canDownload[file]}
            title={
              canDownload[file] ? `Download the .${file} file` : "Assemble the current code first"
            }
          >
            .{file}
          </button>
        ))}
        <span className="separator" />
        <button type="button" disabled>
          Run
        </button>
        <button type="button" disabled>
          Step
        </button>
        <button type="button" disabled>
          Reset
        </button>
      </div>
    </header>
  );
}
