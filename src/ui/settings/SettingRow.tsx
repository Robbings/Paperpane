import { useId, type ReactNode } from 'react';

/** A titled run of setting rows inside a section. No card of its own: rows sit on the page surface. */
export function SettingGroup({ title, description, children }: { title?: string; description?: ReactNode; children: ReactNode }) {
  const id = useId();
  return (
    <section className="pp-set-group" aria-labelledby={title ? id : undefined}>
      {title && (
        <h2 id={id} className="pp-set-group__title">
          {title}
        </h2>
      )}
      {description && <p className="pp-set-group__description">{description}</p>}
      <div className="pp-set-group__rows">{children}</div>
    </section>
  );
}

interface SettingRowProps {
  label: string;
  /** Labels the control by id, when the control is a plain input. */
  htmlFor?: string;
  description?: ReactNode;
  /** Shown under the description; marks the row invalid. */
  error?: string;
  /** Controls on the right. */
  children: ReactNode;
  /** Put the control under the text, for wide controls. */
  stacked?: boolean;
}

/** One setting: its name and a line of explanation on the left, the control on the right. */
export function SettingRow({ label, htmlFor, description, error, children, stacked }: SettingRowProps) {
  return (
    <div className="pp-set-row" data-stacked={stacked ? 'true' : undefined} data-invalid={error ? 'true' : undefined}>
      <div className="pp-set-row__text">
        {htmlFor ? (
          <label className="pp-set-row__label" htmlFor={htmlFor}>
            {label}
          </label>
        ) : (
          <span className="pp-set-row__label">{label}</span>
        )}
        {description && <p className="pp-set-row__description">{description}</p>}
        {error && (
          <p className="pp-set-row__error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="pp-set-row__control">{children}</div>
    </div>
  );
}
