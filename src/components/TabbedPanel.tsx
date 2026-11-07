import type { ReactNode } from "react";

// A panel whose header is a row of tabs; only the selected tab's content is shown.

type Tab = { id: string; label: string; content: ReactNode };

type TabbedPanelProps = {
  tabs: Tab[];
  selected: string; // id of the shown tab
  onSelect: (id: string) => void;
};

export function TabbedPanel({ tabs, selected, onSelect }: TabbedPanelProps) {
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
      <div className="panel-body" role="tabpanel">
        {current.content}
      </div>
    </section>
  );
}
