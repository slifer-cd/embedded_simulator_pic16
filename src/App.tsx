import { useRef, useState } from "react";
import { assemble } from "./assembler/assembler.ts";
import type { AssemblyResult } from "./assembler/assembler.ts";
import { CodeEditor } from "./components/CodeEditor.tsx";
import { MessagesView } from "./components/MessagesView.tsx";
import { Panel } from "./components/Panel.tsx";
import { Toolbar } from "./components/Toolbar.tsx";
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

function App() {
  const [code, setCode] = useState(SAMPLE_CODE);
  const [result, setResult] = useState<AssemblyResult | null>(null); // null = not assembled yet
  const [assembledCode, setAssembledCode] = useState(""); // the code the result was made from

  const editorRef = useRef<HTMLTextAreaElement>(null);

  // The result is out of date when the code was edited after the last assemble
  const outdated = result !== null && code !== assembledCode;

  const handleAssemble = () => {
    setResult(assemble(code));
    setAssembledCode(code);
  };

  const handleSelectLine = (line: number) => {
    if (editorRef.current) selectLine(editorRef.current, line);
  };

  return (
    <div className="app">
      <Toolbar onAssemble={handleAssemble} />

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
        <Panel title="Flash" />
        <Panel title="EEPROM" />
        <Panel title="Messages">
          <MessagesView result={result} outdated={outdated} onSelectLine={handleSelectLine} />
        </Panel>
      </div>
    </div>
  );
}

export default App;
