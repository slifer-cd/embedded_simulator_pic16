import { useState } from "react";
import type { ReactNode } from "react";
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

function Panel({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      <div className="panel-body">{children ?? <p className="todo">Coming soon</p>}</div>
    </section>
  );
}

function App() {
  const [code, setCode] = useState(SAMPLE_CODE);

  return (
    <div className="app">
      <header className="toolbar">
        <h1>PIC16F84A Simulator</h1>
        <div className="buttons">
          <button type="button" disabled>
            Assemble
          </button>
          <button type="button" disabled>
            .hex
          </button>
          <button type="button" disabled>
            .lst
          </button>
          <button type="button" disabled>
            .err
          </button>
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

      <main className="workspace">
        <Panel title="Code">
          <textarea
            className="editor"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            spellCheck={false}
          />
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
