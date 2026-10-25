import type { ReactNode } from 'react';

interface PanelHeaderProps {
  title: string;
  /** Small text right after the title, e.g. a count. */
  meta?: ReactNode;
  /** Buttons or status at the end of the row. */
  actions?: ReactNode;
}

export function PanelHeader({ title, meta, actions }: PanelHeaderProps) {
  return (
    <div className="pp-panel__header">
      <h2 className="pp-panel__title">{title}</h2>
      {meta !== undefined && <span className="pp-panel__meta">{meta}</span>}
      <span className="pp-panel__spacer" />
      {actions}
    </div>
  );
}
