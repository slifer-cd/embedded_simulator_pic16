import { useRef, useState } from "react";
import { assemble } from "./assembler/assembler.ts";
import type { AssemblyResult } from "./assembler/assembler.ts";
import { generateErr } from "./assembler/output/err.ts";
import { generateHex } from "./assembler/output/hex.ts";
import { generateLst } from "./assembler/output/lst.ts";
import { CodeEditor } from "./components/CodeEditor.tsx";
import { FlashView } from "./components/FlashView.tsx";
import { MessagesView } from "./components/MessagesView.tsx";
import { Panel } from "./components/Panel.tsx";
import { Toolbar } from "./components/Toolbar.tsx";
import type { OutputFile } from "./components/Toolbar.tsx";
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

function App() {
  const [code, setCode] = useState(SAMPLE_CODE);
  const [result, setResult] = useState<AssemblyResult | null>(null); // null = not assembled yet
  const [assembledCode, setAssembledCode] = useState(""); // the code the result was made from

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

  const handleAssemble = () => {
    setResult(assemble(code));
    setAssembledCode(code);
  };

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
      <Toolbar onAssemble={handleAssemble} onDownload={handleDownload} canDownload={canDownload} />

      <main className="workspace">
        <Panel title="Code">
          <CodeEditor ref={editorRef} code={code} onChange={setCode} />
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
