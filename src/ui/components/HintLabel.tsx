import type { ReactNode } from 'react';
import { Icon } from './Icon';
import { Tooltip } from './Tooltip';
import './HintLabel.css';

/** A field label with an optional "?" that explains it on hover, instead of a line of text under the field. */
export function HintLabel({ children, hint, htmlFor }: { children: ReactNode; hint?: string; htmlFor?: string }) {
  return (
    <div className="pp-hint-label">
      {htmlFor ? (
        <label htmlFor={htmlFor} className="pp-field__label">
          {children}
        </label>
      ) : (
        <span className="pp-field__label">{children}</span>
      )}
      {hint && (
        <Tooltip label={hint}>
          <span className="pp-hint-label__icon" tabIndex={0} aria-label={hint}>
            <Icon name="explain" size={13} />
          </span>
        </Tooltip>
      )}
    </div>
  );
}
