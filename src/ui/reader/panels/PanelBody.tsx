import type { ReactNode } from 'react';

/**
 * The reading part of a research panel: an opaque surface that runs to the
 * card's edges below the header and filters, which stay on the glass.
 */
export function PanelBody({ children }: { children: ReactNode }) {
  return <div className="pp-panel__body">{children}</div>;
}
