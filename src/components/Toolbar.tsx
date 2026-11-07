export type OutputFile = "hex" | "lst" | "err";

type ToolbarProps = {
  onAssemble: () => void;
  onDownload: (file: OutputFile) => void;
  canDownload: Record<OutputFile, boolean>; // which download buttons are enabled

  onRun: () => void; // starts or stops running
  onStep: () => void;
  onReset: () => void;
  canSimulate: boolean; // a successful, up-to-date build is loaded
  running: boolean;
};

const OUTPUT_FILES: OutputFile[] = ["hex", "lst", "err"];

export function Toolbar(props: ToolbarProps) {
  const { onAssemble, onDownload, canDownload, onRun, onStep, onReset, canSimulate, running } =
    props;
  const simulateHint = canSimulate ? undefined : "Assemble the current code without errors first";

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
        <button type="button" onClick={onRun} disabled={!canSimulate} title={simulateHint}>
          {running ? "Stop" : "Run"}
        </button>
        <button
          type="button"
          onClick={onStep}
          disabled={!canSimulate || running}
          title={simulateHint}
        >
          Step
        </button>
        <button type="button" onClick={onReset} disabled={!canSimulate} title={simulateHint}>
          Reset
        </button>
      </div>
    </header>
  );
}
