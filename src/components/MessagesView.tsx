import type { AssemblyResult } from "../assembler/assembler.ts";
import type { Severity } from "../assembler/lexer.ts";

type MessagesViewProps = {
  result: AssemblyResult | null; // null = not assembled yet
  outdated: boolean; // code was edited after the last assemble
  onSelectLine: (line: number) => void; // called when a message is clicked
};

const SEVERITY_LABEL: Record<Severity, string> = {
  error: "Error",
  warning: "Warning",
  message: "Message",
};

// "1 error", "2 errors"
function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

export function MessagesView({ result, outdated, onSelectLine }: MessagesViewProps) {
  if (!result) {
    return <p className="todo">Press Assemble</p>;
  }

  const { messages, errorCount, warningCount, messageCount } = result;

  return (
    <div className="messages">
      {outdated && (
        <p className="outdated-hint">Code changed since the last assemble. Press Assemble again.</p>
      )}

      <p className={`messages-summary ${result.success ? "success" : "error"}`}>
        {result.success ? "Build succeeded" : "Build failed"}: {plural(errorCount, "error")},{" "}
        {plural(warningCount, "warning")}, {plural(messageCount, "message")}
      </p>

      <ul className="messages-list">
        {messages.map((m, index) => (
          <li key={index} className={m.severity}>
            <button type="button" className="messages-row" onClick={() => onSelectLine(m.line)}>
              <span className="messages-line">Line {m.line}</span>
              <span className="messages-severity">
                {SEVERITY_LABEL[m.severity]}
                {m.code !== undefined && `[${m.code}]`}
              </span>
              <span className="messages-text">{m.text}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
