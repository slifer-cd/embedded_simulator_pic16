import type { ReactNode } from "react";

type PanelProps = {
  title: string;
  children?: ReactNode; // when empty, the panel shows "Coming soon"
};

export function Panel({ title, children }: PanelProps) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      <div className="panel-body">{children ?? <p className="todo">Coming soon</p>}</div>
    </section>
  );
}
