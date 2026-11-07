import { useRef } from "react";
import { EXAMPLES } from "../utils/examples.ts";
import type { Example } from "../utils/examples.ts";
import { RUN_SPEEDS } from "../utils/runSpeed.ts";
import type { RunSpeed } from "../utils/runSpeed.ts";

export type OutputFile = "hex" | "lst" | "err";

type ToolbarProps = {
  onOpen: (file: File) => void; // user picked an .asm file to load into the editor
  onOpenExample: (example: Example) => void; // user picked one of the programs in examples/
  onSave: () => void; // save the editor contents as .asm

  onAssemble: () => void;
  onDownload: (file: OutputFile) => void;
  downloadProblem: Record<OutputFile, string | null>; // why a download is disabled (null = enabled)

  onRun: () => void; // starts or stops running
  runSpeed: RunSpeed;
  onRunSpeedChange: (speed: RunSpeed) => void;
  onStep: () => void;
  onStepBack: () => void; // undo the last step
  canStepBack: boolean; // there is a step in the history
  onStepOver: () => void; // on a CALL: run the subroutine and stop after it
  onStepOut: () => void; // run until the current subroutine returns
  onReset: () => void; // power-on reset
  onMclr: () => void; // MCLR reset (the reset pin), keeps RAM and the port latches
  simulateProblem: string | null; // why simulation is disabled (null = enabled)
  running: boolean;
};

const OUTPUT_FILES: OutputFile[] = ["hex", "lst", "err"];

export function Toolbar(props: ToolbarProps) {
  const { onOpen, onOpenExample, onSave, onAssemble, onDownload, downloadProblem } = props;
  const { onRun, runSpeed, onRunSpeedChange, onStep, onStepOver, onStepOut, onReset, onMclr } =
    props;
  const { onStepBack, canStepBack, simulateProblem, running } = props;
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
        {/* Always shows "Examples…": picking a program loads it, the list itself keeps no choice */}
        <select
          className="toolbar-select"
          value=""
          onChange={(e) => {
            const example = EXAMPLES.find((ex) => ex.name === e.target.value);
            if (example) onOpenExample(example);
          }}
          title="Load an example program into the editor"
        >
          <option value="" disabled hidden>
            Examples…
          </option>
          {EXAMPLES.map((example) => (
            <option key={example.name} value={example.name}>
              {example.name}
            </option>
          ))}
        </select>
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
        <select
          className="run-speed"
          value={runSpeed}
          onChange={(e) => onRunSpeedChange(e.target.value as RunSpeed)}
          title="Run speed. The simulated time is the same at every speed."
        >
          {RUN_SPEEDS.map((speed) => (
            <option key={speed.id} value={speed.id}>
              {speed.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onStepBack}
          disabled={simulateProblem !== null || running || !canStepBack}
          title={
            simulateProblem ??
            (canStepBack
              ? "Step Back: undo the last step (the last 1000 steps are kept, also from Run)"
              : "Nothing to step back to yet")
          }
        >
          Step Back
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
          onClick={onStepOver}
          disabled={simulateProblem !== null || running}
          title={
            simulateProblem ??
            "Step Over: on a CALL, run the whole subroutine and stop after it returns (Stop aborts it). Otherwise a normal Step."
          }
        >
          Step Over
        </button>
        <button
          type="button"
          onClick={onStepOut}
          disabled={simulateProblem !== null || running}
          title={
            simulateProblem ??
            "Step Out: run until the current subroutine or interrupt routine returns, and stop at the return address (Stop aborts it)."
          }
        >
          Step Out
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
