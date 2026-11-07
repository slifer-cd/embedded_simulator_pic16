import { useState } from "react";
import { CodeEditor } from "./components/CodeEditor.tsx";
import { Panel } from "./components/Panel.tsx";
import { Toolbar } from "./components/Toolbar.tsx";
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

  // Temporary: Step 4 replaces this with a call to assemble(code)
  const handleAssemble = () => {
    console.log("Assemble clicked", code.split("\n").length, "lines");
  };

  return (
    <div className="app">
      <Toolbar onAssemble={handleAssemble} />

      <main className="workspace">
        <Panel title="Code">
          <CodeEditor code={code} onChange={setCode} />
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
        <Panel title="Messages" />
      </div>
    </div>
  );
}

export default App;
