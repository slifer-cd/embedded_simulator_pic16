import { useEffect, useRef, useState } from "react";
import { assemble } from "./assembler/assembler.ts";
import type { AssemblyResult } from "./assembler/assembler.ts";
import { generateErr } from "./assembler/output/err.ts";
import { generateHex } from "./assembler/output/hex.ts";
import { generateLst } from "./assembler/output/lst.ts";
import { CodeEditor } from "./components/CodeEditor.tsx";
import { FlashView } from "./components/FlashView.tsx";
import { BreakpointsView } from "./components/BreakpointsView.tsx";
import { HistoryView } from "./components/HistoryView.tsx";
import { TabbedPanel } from "./components/TabbedPanel.tsx";
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
import { clockProblem, decodeConfig, MEMORY } from "./chip/config.ts";
import { GPR_END, GPR_START } from "./chip/registers.ts";
import { Cpu } from "./simulator/cpu.ts";
import { History } from "./simulator/history.ts";
import type { HistoryEntry } from "./simulator/history.ts";
import type { CpuSnapshot, StepResult } from "./simulator/cpu.ts";
import type { Drive } from "./simulator/pins.ts";
import { downloadText } from "./utils/download.ts";
import { moveBreakpoints } from "./utils/moveBreakpoints.ts";
import { DEFAULT_RUN_SPEED, RUN_SPEEDS } from "./utils/runSpeed.ts";
import type { RunSpeed } from "./utils/runSpeed.ts";
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

const DEFAULT_CLOCK_HZ = 4_000_000; // oscillator frequency (4 MHz -> 1 µs per instruction cycle)
const RUN_TICK_MS = 16; // how often the screen updates while running (~60 times a second)
const RUN_WORK_MS = 12; // at most this long simulating per tick, so the page stays responsive
const RUN_CATCH_UP_MS = 100; // after a pause (e.g. a background tab) don't try to catch up more
const RUN_RATE_MS = 500; // how often the measured speed (x real time) is updated
const HISTORY_SIZE = 1000; // steps that Step Back can undo
const HISTORY_ROWS = 200; // newest steps listed in the History panel

// Where a Step Over / Step Out run stops: when the stack is back at "depth" and (if pc is
// given) the PC is at "pc". Comparing the depth too makes recursive CALLs work.
type RunTarget = { label: string; pc: number | null; depth: number; startCycles: number };

// What to tell the user after a step (null = nothing). Any note also stops Run.
function noteFor(step: StepResult, cpu: Cpu): SimNote | null {
  if (step.warnings.length > 0) return { kind: "warning", text: step.warnings[0] };
  if (step.watchdogReset) {
    return {
      kind: "warning",
      text: "Watchdog reset: the WDT timed out (TO = 0). Use CLRWDT in the program, or __CONFIG _WDT_OFF.",
    };
  }
  if (step.endlessLoop) {
    const address = step.address.toString(16).toUpperCase().padStart(4, "0");
    return { kind: "info", text: `Program reached an endless loop (GOTO $) at 0x${address}.` };
  }
  if (cpu.sleeping && !cpu.canWake) {
    return {
      kind: "info",
      text: "CPU executed SLEEP and nothing can wake it (watchdog off, no INT / RB change / EEPROM interrupt enabled).",
    };
  }
  return null;
}

// Extra info shown after a single Step only (Run must not stop on these)
function stepInfo(step: StepResult, cpu: Cpu): SimNote | null {
  if (step.wakeUp === "watchdog") {
    return { kind: "info", text: "Watchdog woke the CPU from SLEEP (TO = 0, PD = 0)." };
  }
  if (step.wakeUp === "interrupt") {
    return {
      kind: "info",
      text: "An interrupt woke the CPU from SLEEP: it runs the instruction after SLEEP (then jumps to 0x0004 if GIE = 1).",
    };
  }
  if (cpu.sleeping) {
    return {
      kind: "info",
      text: "Sleeping until the watchdog or an enabled INT / RB change / EEPROM interrupt wakes the CPU.",
    };
  }
  if (step.interrupt) {
    const address = step.address.toString(16).toUpperCase().padStart(4, "0");
    return { kind: "info", text: `Interrupt after 0x${address}: GIE cleared, jumped to 0x0004.` };
  }
  return null;
}

function App() {
  const [code, setCode] = useState(SAMPLE_CODE);
  const [breakpoints, setBreakpoints] = useState<ReadonlySet<number>>(new Set()); // source lines
  const [bottomTab, setBottomTab] = useState("history"); // History / Breakpoints tab
  const [fileName, setFileName] = useState(DEFAULT_FILE_NAME); // base name for .asm/.hex/.lst/.err
  const [savedCode, setSavedCode] = useState(SAMPLE_CODE); // code as last opened / saved
  const unsaved = code !== savedCode;
  const [result, setResult] = useState<AssemblyResult | null>(null); // null = not assembled yet
  const [assembledCode, setAssembledCode] = useState(""); // the code the result was made from

  // Simulator: one Cpu object for the whole session; the UI shows snapshots of it
  const [cpu] = useState(() => new Cpu());
  // States before the last steps, for Step Back (recorded before every step, also during Run)
  const [history] = useState(() => new History(HISTORY_SIZE));
  // What the History panel shows (a copy: the History object itself keeps changing)
  const [historyView, setHistoryView] = useState<{ rows: HistoryEntry[]; length: number }>({
    rows: [],
    length: 0,
  });
  const showHistory = () => {
    setHistoryView({ rows: history.entries(HISTORY_ROWS), length: history.length });
  };
  // The latest snapshot ("now") and the one before it ("before", to highlight what changed)
  const [snapshots, setSnapshots] = useState<{
    now: CpuSnapshot;
    before: CpuSnapshot | null;
  } | null>(null); // null = no program loaded
  const sim = snapshots?.now ?? null;
  const previousSim = snapshots?.before ?? null;
  const [running, setRunning] = useState(false);
  const [simNote, setSimNote] = useState<SimNote | null>(null); // last warning / info from the simulator
  const [clockHz, setClockHz] = useState(DEFAULT_CLOCK_HZ); // oscillator frequency (also set in the CPU)
  const [runSpeed, setRunSpeed] = useState<RunSpeed>(DEFAULT_RUN_SPEED);
  const [runRate, setRunRate] = useState<number | null>(null); // measured speed: 1 = real time
  const [runTarget, setRunTarget] = useState<RunTarget | null>(null); // Step Over / Out in progress

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

  // Clock outside the range of the oscillator mode chosen in __CONFIG (_XT_OSC etc.)
  const clockWarning = result?.success
    ? clockProblem(decodeConfig(result.config).oscillator, clockHz)
    : null;
  const isRunning = running && canSimulate; // editing the code stops a running program

  // Program address -> source line, to highlight the next instruction in the editor
  const lineByAddress = new Map<number, number>();
  for (const word of result?.words ?? []) {
    if (word.address < MEMORY.PROGRAM_SIZE) lineByAddress.set(word.address, word.line);
  }
  // Lines with an instruction in the last build (null = nothing assembled), for breakpoint marks
  const codeLines = result ? new Set(lineByAddress.values()) : null;

  // Breakpoints panel: line, source text and the address Run stops at (first word of the line)
  const addressByLine = new Map<number, number>();
  for (const word of result?.words ?? []) {
    if (word.address < MEMORY.PROGRAM_SIZE && !addressByLine.has(word.line)) {
      addressByLine.set(word.line, word.address);
    }
  }
  const sourceLines = code.split("\n");
  const breakpointRows = [...breakpoints]
    .sort((a, b) => a - b)
    .map((line) => ({
      line,
      text: (sourceLines[line - 1] ?? "").trim(),
      address: addressByLine.get(line) ?? null,
    }));

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
    setRunTarget(null);
    setSimNote(null);
    if (newResult.success) {
      cpu.load(newResult.program, newResult.eeprom, newResult.config);
      history.clear();
      showHistory();
      setSnapshots({ now: cpu.snapshot(), before: null });
    } else {
      setSnapshots(null);
    }
  };

  const handleStep = () => {
    history.record(cpu);
    const step = cpu.step();
    history.noteStep(step);
    showHistory();
    showSnapshot(cpu.snapshot());
    setSimNote(noteFor(step, cpu) ?? stepInfo(step, cpu));
  };

  const handleRun = () => {
    setSimNote(null);
    setRunRate(null); // measured again from the start of this run
    setRunTarget(null); // Stop also ends a Step Over / Out
    setRunning(!running);
  };

  // Code edited: move the breakpoints with their lines (see utils/moveBreakpoints.ts)
  const handleCodeChange = (next: string) => {
    setBreakpoints(moveBreakpoints(code, next, breakpoints));
    setCode(next);
  };

  // Set or clear a breakpoint on a source line (also while running)
  const handleToggleBreakpoint = (line: number) => {
    setBreakpoints((old) => {
      const next = new Set(old);
      if (next.has(line)) next.delete(line);
      else next.add(line);
      return next;
    });
  };

  // Step Back: restore the state before the last step (pin drives included, see MemoryState)
  const handleStepBack = () => {
    handleGoBack(1);
  };

  // Go back several steps at once (a click in the History panel)
  const handleGoBack = (steps: number) => {
    if (!history.back(cpu, steps)) return;
    showHistory();
    showSnapshot(cpu.snapshot());
    setSimNote({
      kind: "info",
      text: `Stepped back (${history.length} more step${history.length === 1 ? "" : "s"} in the history).`,
    });
  };

  // Step Over: on a CALL, run the whole subroutine (at Max speed, Stop still works) and stop
  // at the instruction after the CALL. On any other instruction it is a normal Step.
  const handleStepOver = () => {
    if (cpu.sleeping || cpu.nextInstruction?.mnemonic !== "CALL") {
      handleStep();
      return;
    }
    setSimNote(null);
    setRunTarget({
      label: "Step Over",
      pc: (cpu.pc + 1) & 0x1fff,
      depth: cpu.stack.depth,
      startCycles: cpu.cycles,
    });
    setRunning(true);
  };

  // The user connects an input pin to high / low / nothing (works while running too)
  const handleDrive = (port: "a" | "b", bit: number, drive: Drive) => {
    cpu.memory.pins.setDrive(port, bit, drive);
    showSnapshot(cpu.snapshot());
  };

  // Step Out: run until the current subroutine (or interrupt routine) returns, and stop at
  // the return address. With an empty stack there is nothing to return from.
  const handleStepOut = () => {
    if (cpu.stack.depth === 0) {
      setSimNote({ kind: "info", text: "Step Out: not inside a subroutine (the stack is empty)." });
      return;
    }
    setSimNote(null);
    setRunTarget({
      label: "Step Out",
      pc: null, // any address: the first return to the level below
      depth: cpu.stack.depth - 1,
      startCycles: cpu.cycles,
    });
    setRunning(true);
  };

  const handleReset = () => {
    setRunning(false);
    setRunTarget(null);
    cpu.reset();
    history.clear();
    showHistory();
    setSnapshots({ now: cpu.snapshot(), before: null });
    setSimNote(null);
  };

  // A new clock: cycles stay the same, a cycle takes 4 / f. Running and the program are not touched.
  const handleClockChange = (hz: number) => {
    cpu.setClock(hz);
    setClockHz(hz);
  };

  // MCLR pin pulled low: the chip restarts at 0x0000 but keeps RAM and the port latches.
  // Run is not stopped (like pressing the reset button on a running board).
  const handleMclr = () => {
    const inSleep = cpu.sleeping;
    cpu.reset("mclr");
    if (runTarget) {
      // The stack is cleared: a Step Over / Out can't reach its target any more
      setRunTarget(null);
      setRunning(false);
    }
    showSnapshot(cpu.snapshot()); // highlight what the reset changed
    setSimNote({
      kind: "info",
      text: inSleep
        ? "MCLR reset during SLEEP (TO = 1, PD = 0): the program starts again at 0x0000."
        : "MCLR reset (TO and PD unchanged): the program starts again at 0x0000.",
    });
  };

  // Run loop: every tick, run what the speed allows for the time since the last tick, then
  // update the screen. Stops on a warning (stack overflow, invalid instruction, ...), at an
  // endless loop (GOTO $) or at SLEEP when nothing can wake the CPU.
  useEffect(() => {
    if (!isRunning) return;

    const speedId = runTarget ? "max" : runSpeed; // Step Over / Out runs as fast as it can

    // Breakpoints: program address -> source line (the first word of each breakpoint line)
    const breakAt = new Map<number, number>();
    const linesDone = new Set<number>();
    for (const word of result?.words ?? []) {
      if (word.address >= MEMORY.PROGRAM_SIZE || !breakpoints.has(word.line)) continue;
      if (linesDone.has(word.line)) continue;
      breakAt.set(word.address, word.line);
      linesDone.add(word.line);
    }
    const { perSecond } = RUN_SPEEDS.find((speed) => speed.id === speedId)!;
    const cyclesPerSecond = clockHz / 4; // real time: one instruction cycle = 4 clocks
    // last: time of the last tick; owed: instructions (fixed speeds) or cycles (real time) not run yet;
    // rateStart / rateCycles: the window over which the actual speed is measured
    const start = performance.now();
    const pace = { last: start, owed: 0, rateStart: start, rateCycles: 0 };

    const id = setInterval(() => {
      const now = performance.now();
      const seconds = Math.min(now - pace.last, RUN_CATCH_UP_MS) / 1000;
      pace.last = now;

      // What this tick may run
      let maxSteps = Infinity;
      let maxCycles = Infinity;
      if (perSecond !== null) {
        pace.owed += perSecond * seconds;
        maxSteps = Math.floor(pace.owed);
        pace.owed -= maxSteps;
      } else if (speedId === "realtime") {
        pace.owed = Math.min(
          pace.owed + cyclesPerSecond * seconds,
          cyclesPerSecond * (RUN_CATCH_UP_MS / 1000),
        );
        maxCycles = pace.owed;
      }

      const deadline = now + RUN_WORK_MS;
      const startCycles = cpu.cycles;
      let steps = 0;
      while (steps < maxSteps && cpu.cycles - startCycles < maxCycles) {
        // Too slow for this speed (or "max"): stop for this tick and let the page draw
        if (steps % 1024 === 1023 && performance.now() > deadline) break;
        history.record(cpu);
        const step = cpu.step();
        history.noteStep(step);
        const note = noteFor(step, cpu);
        steps++;
        if (note) {
          setSimNote(note);
          setRunning(false);
          setRunTarget(null);
          break;
        }
        // Breakpoint: stop BEFORE the instruction runs (checked after a step, so a run that
        // starts on a breakpoint moves on). Not while sleeping: the PC doesn't move then.
        const breakLine = cpu.sleeping ? undefined : breakAt.get(cpu.pc);
        if (breakLine !== undefined) {
          const address = cpu.pc.toString(16).toUpperCase().padStart(4, "0");
          setSimNote({ kind: "info", text: `Breakpoint at line ${breakLine} (0x${address}).` });
          setRunning(false);
          setRunTarget(null);
          break;
        }
        // Step Over / Out: back at the target?
        const reached =
          runTarget !== null &&
          cpu.stack.depth === runTarget.depth &&
          (runTarget.pc === null || cpu.pc === runTarget.pc);
        if (reached) {
          const cycles = cpu.cycles - runTarget.startCycles;
          setSimNote({ kind: "info", text: `${runTarget.label}: ${cycles} cycles.` });
          setRunning(false);
          setRunTarget(null);
          break;
        }
      }
      const ran = cpu.cycles - startCycles;
      if (speedId === "realtime") pace.owed -= ran;

      // Actual speed: simulated time / wall-clock time, over the last RUN_RATE_MS
      pace.rateCycles += ran;
      if (now - pace.rateStart >= RUN_RATE_MS) {
        setRunRate(pace.rateCycles / (cyclesPerSecond * ((now - pace.rateStart) / 1000)));
        pace.rateStart = now;
        pace.rateCycles = 0;
      }

      if (steps > 0) {
        showSnapshot(cpu.snapshot());
        setHistoryView({ rows: history.entries(HISTORY_ROWS), length: history.length });
      }
    }, RUN_TICK_MS);

    return () => clearInterval(id);
  }, [isRunning, cpu, history, runSpeed, clockHz, runTarget, breakpoints, result]);

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
    setBreakpoints(new Set()); // they belonged to the old file
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
        onStepBack={handleStepBack}
        canStepBack={historyView.length > 0}
        onStepOver={handleStepOver}
        onStepOut={handleStepOut}
        onReset={handleReset}
        runSpeed={runSpeed}
        onRunSpeedChange={setRunSpeed}
        onMclr={handleMclr}
        simulateProblem={canSimulate ? null : (errorProblem ?? "Assemble the code first")}
        running={isRunning}
      />

      <StatusBar
        sim={canSimulate ? sim : null}
        running={isRunning}
        note={simNote}
        clockHz={clockHz}
        onClockChange={handleClockChange}
        clockWarning={clockWarning}
        runRate={
          isRunning && !runTarget && (runSpeed === "realtime" || runSpeed === "max")
            ? runRate
            : null
        }
        behind={runSpeed === "realtime" && runRate !== null && runRate < 0.9}
      />

      <main className="workspace">
        <Panel title={`Code · ${fileName}.asm${unsaved ? " •" : ""}`}>
          <CodeEditor
            ref={editorRef}
            code={code}
            onChange={handleCodeChange}
            currentLine={currentLine}
            breakpoints={breakpoints}
            codeLines={codeLines}
            onToggleBreakpoint={handleToggleBreakpoint}
          />
        </Panel>

        <Panel title="Registers">
          <RegistersView sim={canSimulate ? sim : null} previous={previousSim} />
        </Panel>

        <div className="side">
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
          <Panel title="Pins">
            <PinsView sim={canSimulate ? sim : null} previous={previousSim} onDrive={handleDrive} />
          </Panel>
        </div>

        <div className="side">
          <Panel title="Stack">
            <StackView
              sim={canSimulate ? sim : null}
              previous={previousSim}
              labelByAddress={labelByAddress}
              lineByAddress={lineByAddress}
            />
          </Panel>
          <Panel title="Flash">
            <FlashView result={result} outdated={outdated} onSelectLine={handleSelectLine} />
          </Panel>
        </div>
      </main>

      <div className="bottom">
        <Panel title="Messages">
          <MessagesView result={result} outdated={outdated} onSelectLine={handleSelectLine} />
        </Panel>
        <TabbedPanel
          selected={bottomTab}
          onSelect={setBottomTab}
          tabs={[
            {
              id: "history",
              label: "History",
              content: (
                <HistoryView
                  rows={historyView.rows}
                  length={historyView.length}
                  capacity={HISTORY_SIZE}
                  onSelect={handleGoBack}
                  disabled={isRunning}
                />
              ),
            },
            {
              id: "breakpoints",
              label: breakpoints.size > 0 ? `Breakpoints (${breakpoints.size})` : "Breakpoints",
              content: (
                <BreakpointsView
                  rows={breakpointRows}
                  outdated={outdated}
                  onSelect={handleSelectLine}
                  onRemove={handleToggleBreakpoint}
                  onClearAll={() => setBreakpoints(new Set())}
                />
              ),
            },
          ]}
        />
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
        <Panel title="Chip" />
      </div>
    </div>
  );
}

export default App;
