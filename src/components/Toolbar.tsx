import { useRef } from "react";

export type OutputFile = "hex" | "lst" | "err";

type ToolbarProps = {
  onOpen: (file: File) => void; // user picked an .asm file to load into the editor
  onSave: () => void; // save the editor contents as .asm

  onAssemble: () => void;
  onDownload: (file: OutputFile) => void;
  downloadProblem: Record<OutputFile, string | null>; // why a download is disabled (null = enabled)

  onRun: () => void; // starts or stops running
  onStep: () => void;
  onReset: () => void; // power-on reset
  onMclr: () => void; // MCLR reset (the reset pin), keeps RAM and the port latches
  simulateProblem: string | null; // why simulation is disabled (null = enabled)
  running: boolean;
};

const OUTPUT_FILES: OutputFile[] = ["hex", "lst", "err"];

export function Toolbar(props: ToolbarProps) {
  const { onOpen, onSave, onAssemble, onDownload, downloadProblem } = props;
  const { onRun, onStep, onReset, onMclr, simulateProblem, running } = props;
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <header className="toolbar">
      <h1>PIC16F84A Simulator</h1>
      <div className="buttons">
        {/* Hidden file picker, opened by the Open button */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".asm,.inc,.txt"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onOpen(file);
            e.target.value = ""; // so the same file can be opened again
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          title="Open an .asm file"
        >
          Open
        </button>
        <button type="button" onClick={onSave} title="Save the code as an .asm file">
          Save
        </button>
        <span className="separator" />

        <button type="button" onClick={onAssemble}>
          Assemble
        </button>
        {OUTPUT_FILES.map((file) => (
          <button
            key={file}
            type="button"
            onClick={() => onDownload(file)}
            disabled={downloadProblem[file] !== null}
            title={downloadProblem[file] ?? `Download the .${file} file`}
          >
            .{file}
          </button>
        ))}
        <span className="separator" />

        <button
          type="button"
          onClick={onRun}
          disabled={simulateProblem !== null}
          title={simulateProblem ?? undefined}
        >
          {running ? "Stop" : "Run"}
        </button>
        <button
          type="button"
          onClick={onStep}
          disabled={simulateProblem !== null || running}
          title={simulateProblem ?? undefined}
        >
          Step
        </button>
        <button
          type="button"
          onClick={onReset}
          disabled={simulateProblem !== null}
          title={simulateProblem ?? "Power-on reset: like switching the power off and on"}
        >
          Reset
        </button>
        <button
          type="button"
          onClick={onMclr}
          disabled={simulateProblem !== null}
          title={
            simulateProblem ??
            "MCLR reset: pull the MCLR pin low, like a reset button on the board. RAM and the port latches keep their values; Run keeps going."
          }
        >
          MCLR
        </button>
      </div>
    </header>
  );
}
