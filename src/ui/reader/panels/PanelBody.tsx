import type { ReactNode } from 'react';

/** The content part of a research panel, below its header and filters. */
export function PanelBody({ children }: { children: ReactNode }) {
  return <div className="pp-panel__body">{children}</div>;
}
