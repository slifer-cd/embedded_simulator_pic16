import { useEffect, useRef, useState } from "react";
import { assemble } from "./assembler/assembler.ts";
import type { AssemblyResult } from "./assembler/assembler.ts";
import { generateErr } from "./assembler/output/err.ts";
import { generateHex } from "./assembler/output/hex.ts";
import { generateLst } from "./assembler/output/lst.ts";
import { CodeEditor } from "./components/CodeEditor.tsx";
import { FlashView } from "./components/FlashView.tsx";
import { MemoryView } from "./components/MemoryView.tsx";
import { MessagesView } from "./components/MessagesView.tsx";
import { Panel } from "./components/Panel.tsx";
import { PinsView } from "./components/PinsView.tsx";
import { RegistersView } from "./components/RegistersView.tsx";
import { StackView } from "./components/StackView.tsx";
import { StatusBar } from "./components/StatusBar.tsx";
import type { SimNote } from "./components/StatusBar.tsx";
import { Toolbar } from "./components/Toolbar.tsx";
import type { OutputFile } from "./components/Toolbar.tsx";
import { MEMORY } from "./chip/config.ts";
import { GPR_END, GPR_START } from "./chip/registers.ts";
import { Cpu } from "./simulator/cpu.ts";
import type { CpuSnapshot, StepResult } from "./simulator/cpu.ts";
import type { Drive } from "./simulator/pins.ts";
import { downloadText } from "./utils/download.ts";
import { scrollLineIntoView, selectLine } from "./utils/selectLine.ts";
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

const DEFAULT_FILE_NAME = "program"; // base name until a file is opened

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
  const [fileName, setFileName] = useState(DEFAULT_FILE_NAME); // base name for .asm/.hex/.lst/.err
  const [savedCode, setSavedCode] = useState(SAMPLE_CODE); // code as last opened / saved
  const unsaved = code !== savedCode;
  const [result, setResult] = useState<AssemblyResult | null>(null); // null = not assembled yet
  const [assembledCode, setAssembledCode] = useState(""); // the code the result was made from

  // Simulator: one Cpu object for the whole session; the UI shows snapshots of it
  const [cpu] = useState(() => new Cpu());
  // The latest snapshot ("now") and the one before it ("before", to highlight what changed)
  const [snapshots, setSnapshots] = useState<{
    now: CpuSnapshot;
    before: CpuSnapshot | null;
  } | null>(null); // null = no program loaded
  const sim = snapshots?.now ?? null;
  const previousSim = snapshots?.before ?? null;
  const [running, setRunning] = useState(false);
  const [simNote, setSimNote] = useState<SimNote | null>(null); // last warning / info from the simulator

  const editorRef = useRef<HTMLTextAreaElement>(null);

  // The result is out of date when the code was edited after the last assemble
  const outdated = result !== null && code !== assembledCode;

  // Why buttons are disabled (null = enabled), shown as their tooltip.
  // .lst / .err need an up-to-date build; .hex and the simulator also need it without errors.
  let buildProblem: string | null = null;
  if (result === null) buildProblem = "Assemble the code first";
  else if (outdated)
    buildProblem = "The code changed since the last assemble: press Assemble again";
  const errorProblem =
    buildProblem ??
    (result?.success ? null : "The build has errors: fix them first (see Messages)");
  const downloadProblem: Record<OutputFile, string | null> = {
    hex: errorProblem,
    lst: buildProblem,
    err: buildProblem,
  };

  // Simulation needs a successful build of the current code
  const canSimulate = errorProblem === null && sim !== null;
  const isRunning = running && canSimulate; // editing the code stops a running program

  // Program address -> source line, to highlight the next instruction in the editor
  const lineByAddress = new Map<number, number>();
  for (const word of result?.words ?? []) {
    if (word.address < MEMORY.PROGRAM_SIZE) lineByAddress.set(word.address, word.line);
  }
  // Program address -> label name (first label if there are several), for the Stack panel
  const labelByAddress = new Map<number, string>();
  for (const [name, symbol] of result?.symbols ?? []) {
    if (
      symbol.kind === "label" &&
      symbol.value < MEMORY.PROGRAM_SIZE &&
      !labelByAddress.has(symbol.value)
    ) {
      labelByAddress.set(symbol.value, name);
    }
  }

  // RAM address -> variable names (EQU / CBLOCK values inside general purpose RAM).
  // Bank 1 addresses 0x8C-0xCF are the same bytes as 0x0C-0x4F.
  const ramNames = new Map<number, string[]>();
  for (const [name, symbol] of result?.symbols ?? []) {
    if (symbol.kind !== "equ" && symbol.kind !== "cblock") continue;
    const address = symbol.value >= 0x80 ? symbol.value - 0x80 : symbol.value;
    if (address < GPR_START || address > GPR_END) continue;
    ramNames.set(address, [...(ramNames.get(address) ?? []), name]);
  }

  // EEPROM address -> label names (labels on DE data at ORG 0x2100)
  const eepromNames = new Map<number, string[]>();
  for (const [name, symbol] of result?.symbols ?? []) {
    const address = symbol.value - MEMORY.EEPROM_START;
    if (symbol.kind !== "label" || address < 0 || address >= MEMORY.EEPROM_SIZE) continue;
    eepromNames.set(address, [...(eepromNames.get(address) ?? []), name]);
  }

  const currentLine = canSimulate ? lineByAddress.get(sim.pc % MEMORY.PROGRAM_SIZE) : undefined;

  // New snapshot after a step / run tick; the old one becomes "before"
  const showSnapshot = (next: CpuSnapshot) => {
    setSnapshots((old) => ({ now: next, before: old?.now ?? null }));
  };

  const handleAssemble = () => {
    const newResult = assemble(code);
    setResult(newResult);
    setAssembledCode(code);

    // Load a successful build into the simulator (starts from reset)
    setRunning(false);
    setSimNote(null);
    if (newResult.success) {
      cpu.load(newResult.program, newResult.eeprom);
      setSnapshots({ now: cpu.snapshot(), before: null });
    } else {
      setSnapshots(null);
    }
  };

  const handleStep = () => {
    const step = cpu.step();
    showSnapshot(cpu.snapshot());
    setSimNote(noteFor(step, cpu.sleeping));
  };

  const handleRun = () => {
    setSimNote(null);
    setRunning(!running);
  };

  // The user connects an input pin to high / low / nothing (works while running too)
  const handleDrive = (port: "a" | "b", bit: number, drive: Drive) => {
    cpu.memory.pins.setDrive(port, bit, drive);
    showSnapshot(cpu.snapshot());
  };

  const handleReset = () => {
    setRunning(false);
    cpu.reset();
    setSnapshots({ now: cpu.snapshot(), before: null });
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
      showSnapshot(cpu.snapshot());
    }, RUN_TICK_MS);

    return () => clearInterval(id);
  }, [isRunning, cpu]);

  // Keep the next instruction visible in the editor while stepping / running
  useEffect(() => {
    if (currentLine !== undefined && editorRef.current) {
      scrollLineIntoView(editorRef.current, currentLine);
    }
  }, [currentLine]);

  // Open an .asm file into the editor (asks first if the current code is not saved)
  const handleOpen = async (file: File) => {
    if (unsaved && !window.confirm("Replace the current code? Unsaved changes will be lost.")) {
      return;
    }
    const text = (await file.text()).replace(/\r\n?/g, "\n"); // textarea uses "\n" only
    setCode(text);
    setSavedCode(text);
    setFileName(file.name.replace(/\.[^.]*$/, "") || DEFAULT_FILE_NAME);
  };

  const handleSave = () => {
    downloadText(`${fileName}.asm`, code);
    setSavedCode(code);
  };

  const handleDownload = (file: OutputFile) => {
    if (!result) return;
    const asmName = `${fileName}.asm`;
    const content =
      file === "hex"
        ? generateHex(result.words)
        : file === "lst"
          ? generateLst(result, asmName)
          : generateErr(result.messages, asmName);
    downloadText(`${fileName}.${file}`, content);
  };

  const handleSelectLine = (line: number) => {
    if (editorRef.current) selectLine(editorRef.current, line);
  };

  return (
    <div className="app">
      <Toolbar
        onOpen={handleOpen}
        onSave={handleSave}
        onAssemble={handleAssemble}
        onDownload={handleDownload}
        downloadProblem={downloadProblem}
        onRun={handleRun}
        onStep={handleStep}
        onReset={handleReset}
        simulateProblem={canSimulate ? null : (errorProblem ?? "Assemble the code first")}
        running={isRunning}
      />

      <StatusBar
        sim={canSimulate ? sim : null}
        running={isRunning}
        note={simNote}
        clockHz={CLOCK_HZ}
      />

      <main className="workspace">
        <Panel title={`Code · ${fileName}.asm${unsaved ? " •" : ""}`}>
          <CodeEditor ref={editorRef} code={code} onChange={setCode} currentLine={currentLine} />
        </Panel>

        <Panel title="Chip" />

        <Panel title="Registers">
          <RegistersView sim={canSimulate ? sim : null} previous={previousSim} />
        </Panel>

        <div className="side">
          <Panel title="Stack">
            <StackView
              sim={canSimulate ? sim : null}
              previous={previousSim}
              labelByAddress={labelByAddress}
              lineByAddress={lineByAddress}
            />
          </Panel>
          <Panel title="Pins">
            <PinsView sim={canSimulate ? sim : null} previous={previousSim} onDrive={handleDrive} />
          </Panel>
        </div>
      </main>

      <div className="memory">
        <Panel title="RAM">
          {canSimulate ? (
            <MemoryView
              values={sim.file}
              previous={previousSim?.file ?? null}
              start={GPR_START}
              end={GPR_END}
              names={ramNames}
            />
          ) : (
            <p className="todo">Assemble to load a program</p>
          )}
        </Panel>
        <Panel title="Flash">
          <FlashView result={result} outdated={outdated} onSelectLine={handleSelectLine} />
        </Panel>
        <Panel title="EEPROM">
          {canSimulate ? (
            <MemoryView
              values={sim.eeprom}
              previous={previousSim?.eeprom ?? null}
              start={0}
              end={MEMORY.EEPROM_SIZE - 1}
              names={eepromNames}
            />
          ) : (
            <p className="todo">Assemble to load a program</p>
          )}
        </Panel>
        <Panel title="Messages">
          <MessagesView result={result} outdated={outdated} onSelectLine={handleSelectLine} />
        </Panel>
      </div>
    </div>
  );
}

export default App;
