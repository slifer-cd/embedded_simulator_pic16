type ToolbarProps = {
  onAssemble: () => void;
};

export function Toolbar({ onAssemble }: ToolbarProps) {
  return (
    <header className="toolbar">
      <h1>PIC16F84A Simulator</h1>
      <div className="buttons">
        <button type="button" onClick={onAssemble}>
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
  );
}
