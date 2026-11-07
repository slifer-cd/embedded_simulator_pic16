import { useEffect, useRef, useState } from "react";
import { assemble } from "./assembler/assembler.ts";
import type { AssemblyResult } from "./assembler/assembler.ts";
import { generateErr } from "./assembler/output/err.ts";
import { generateHex } from "./assembler/output/hex.ts";
import { generateLst } from "./assembler/output/lst.ts";
import { CodeEditor } from "./components/CodeEditor.tsx";
import { FlashView } from "./components/FlashView.tsx";
import { MessagesView } from "./components/MessagesView.tsx";
import { Panel } from "./components/Panel.tsx";
import { StatusBar } from "./components/StatusBar.tsx";
import type { SimNote } from "./components/StatusBar.tsx";
import { Toolbar } from "./components/Toolbar.tsx";
import type { OutputFile } from "./components/Toolbar.tsx";
import { MEMORY } from "./chip/config.ts";
import { Cpu } from "./simulator/cpu.ts";
import type { CpuSnapshot, StepResult } from "./simulator/cpu.ts";
import { downloadText } from "./utils/download.ts";
import { selectLine } from "./utils/selectLine.ts";
import "./App.css";

const SAMPLE_CODE = `        LIST    P=16F84A
        #include <P16F84A.INC>

        ORG     0x000
        BSF     STATUS, RP0     ; bank 1
        CLRF    TRISB           ; PORTB = outputs
        BCF     STATUS, RP0     ; bank 0
        MOVLW   0xFF
        MOVWF   PORTB
loop    GOTO    loop

        END
`;

const FILE_NAME = "program"; // base name for the output files

const CLOCK_HZ = 4_000_000; // oscillator frequency (4 MHz -> 1 µs per instruction cycle)
const RUN_TICK_MS = 16; // how often the screen updates while running (~60 times a second)
const STEPS_PER_TICK = 1000; // instructions executed between screen updates

// What to tell the user after a step (null = nothing). Any note also stops Run.
function noteFor(step: StepResult, sleeping: boolean): SimNote | null {
  if (step.warnings.length > 0) return { kind: "warning", text: step.warnings[0] };
  if (step.endlessLoop) {
    const address = step.address.toString(16).toUpperCase().padStart(4, "0");
    return { kind: "info", text: `Program reached an endless loop (GOTO $) at 0x${address}.` };
  }
  if (sleeping) return { kind: "info", text: "CPU executed SLEEP (nothing wakes it up yet)." };
  return null;
}

function App() {
  const [code, setCode] = useState(SAMPLE_CODE);
  const [result, setResult] = useState<AssemblyResult | null>(null); // null = not assembled yet
  const [assembledCode, setAssembledCode] = useState(""); // the code the result was made from

  // Simulator: one Cpu object for the whole session; the UI shows snapshots of it
  const [cpu] = useState(() => new Cpu());
  const [sim, setSim] = useState<CpuSnapshot | null>(null); // null = no program loaded
  const [running, setRunning] = useState(false);
  const [simNote, setSimNote] = useState<SimNote | null>(null); // last warning / info from the simulator

  const editorRef = useRef<HTMLTextAreaElement>(null);

  // The result is out of date when the code was edited after the last assemble
  const outdated = result !== null && code !== assembledCode;

  // Every file needs an up-to-date result; .hex also needs a build without errors
  const upToDate = result !== null && !outdated;
  const canDownload: Record<OutputFile, boolean> = {
    hex: upToDate && result.success,
    lst: upToDate,
    err: upToDate,
  };

  // Simulation needs a successful build of the current code
  const canSimulate = upToDate && result.success && sim !== null;
  const isRunning = running && canSimulate; // editing the code stops a running program

  // Program address -> source line, to highlight the next instruction in the editor
  const lineByAddress = new Map<number, number>();
  for (const word of result?.words ?? []) {
    if (word.address < MEMORY.PROGRAM_SIZE) lineByAddress.set(word.address, word.line);
  }
  const currentLine = canSimulate ? lineByAddress.get(sim.pc % MEMORY.PROGRAM_SIZE) : undefined;

  const handleAssemble = () => {
    const newResult = assemble(code);
    setResult(newResult);
    setAssembledCode(code);

    // Load a successful build into the simulator (starts from reset)
    setRunning(false);
    setSimNote(null);
    if (newResult.success) {
      cpu.load(newResult.program, newResult.eeprom);
      setSim(cpu.snapshot());
    } else {
      setSim(null);
    }
  };

  const handleStep = () => {
    const step = cpu.step();
    setSim(cpu.snapshot());
    setSimNote(noteFor(step, cpu.sleeping));
  };

  const handleRun = () => {
    setSimNote(null);
    setRunning(!running);
  };

  const handleReset = () => {
    setRunning(false);
    cpu.reset();
    setSim(cpu.snapshot());
    setSimNote(null);
  };

  // Run loop: execute a batch of instructions, then update the screen.
  // Stops on a warning (stack overflow, invalid instruction, ...), at an endless loop (GOTO $)
  // or when the CPU goes to sleep.
  useEffect(() => {
    if (!isRunning) return;

    const id = setInterval(() => {
      for (let i = 0; i < STEPS_PER_TICK; i++) {
        const note = noteFor(cpu.step(), cpu.sleeping);
        if (note) {
          setSimNote(note);
          setRunning(false);
          break;
        }
      }
      setSim(cpu.snapshot());
    }, RUN_TICK_MS);

    return () => clearInterval(id);
  }, [isRunning, cpu]);

  const handleDownload = (file: OutputFile) => {
    if (!result) return;
    const asmName = `${FILE_NAME}.asm`;
    const content =
      file === "hex"
        ? generateHex(result.words)
        : file === "lst"
          ? generateLst(result, asmName)
          : generateErr(result.messages, asmName);
    downloadText(`${FILE_NAME}.${file}`, content);
  };

  const handleSelectLine = (line: number) => {
    if (editorRef.current) selectLine(editorRef.current, line);
  };

  return (
    <div className="app">
      <Toolbar
        onAssemble={handleAssemble}
        onDownload={handleDownload}
        canDownload={canDownload}
        onRun={handleRun}
        onStep={handleStep}
        onReset={handleReset}
        canSimulate={canSimulate}
        running={isRunning}
      />

      <StatusBar
        sim={canSimulate ? sim : null}
        running={isRunning}
        note={simNote}
        clockHz={CLOCK_HZ}
      />

      <main className="workspace">
        <Panel title="Code">
          <CodeEditor ref={editorRef} code={code} onChange={setCode} currentLine={currentLine} />
        </Panel>

        <Panel title="Chip" />

        <div className="side">
          <Panel title="Registers" />
          <Panel title="Stack" />
          <Panel title="Pins" />
        </div>
      </main>

      <div className="memory">
        <Panel title="RAM" />
        <Panel title="Flash">
          <FlashView result={result} onSelectLine={handleSelectLine} />
        </Panel>
        <Panel title="EEPROM" />
        <Panel title="Messages">
          <MessagesView result={result} outdated={outdated} onSelectLine={handleSelectLine} />
        </Panel>
      </div>
    </div>
  );
}

export default App;
