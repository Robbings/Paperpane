import type { ReactNode } from 'react';
import { Tooltip } from './Tooltip';

/** A field label that explains itself when hovered, instead of a line of text under the field. */
export function HintLabel({ children, hint, htmlFor }: { children: ReactNode; hint?: string; htmlFor?: string }) {
  const label = htmlFor ? (
    <label htmlFor={htmlFor} className="pp-field__label">
      {children}
    </label>
  ) : (
    <span className="pp-field__label">{children}</span>
  );
  return <div className="pp-hint-label">{hint ? <Tooltip label={hint} placement="top">{label}</Tooltip> : label}</div>;
}
