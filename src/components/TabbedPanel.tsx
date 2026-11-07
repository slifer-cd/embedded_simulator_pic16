import type { ReactNode } from "react";

// A panel whose header is a row of tabs; only the selected tab's content is shown.
// keepMounted: the other tabs stay in the page, hidden (e.g. the code editor keeps its
// undo history and cursor while the Chip tab is open).

type Tab = { id: string; label: string; content: ReactNode };

type TabbedPanelProps = {
  tabs: Tab[];
  selected: string; // id of the shown tab
  onSelect: (id: string) => void;
  keepMounted?: boolean;
};

export function TabbedPanel({ tabs, selected, onSelect, keepMounted = false }: TabbedPanelProps) {
  const current = tabs.find((tab) => tab.id === selected) ?? tabs[0];
  return (
    <section className="panel">
      <div className="panel-tabs" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === current.id}
            className={tab.id === current.id ? "selected" : undefined}
            onClick={() => onSelect(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {keepMounted ? (
        tabs.map((tab) => (
          <div key={tab.id} className="panel-body" role="tabpanel" hidden={tab.id !== current.id}>
            {tab.content}
          </div>
        ))
      ) : (
        <div className="panel-body" role="tabpanel">
          {current.content}
        </div>
      )}
    </section>
  );
}
