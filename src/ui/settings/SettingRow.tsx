import { useId, useState, type ReactNode } from "react";
import { HintLabel, Icon } from "@/ui/components";

/** A titled run of setting rows inside a section. No card of its own: rows sit on the page surface. */
export function SettingGroup({
  title,
  description,
  children,
  hint,
  actions,
  collapsible,
  tour,
}: {
  title?: string;
  description?: ReactNode;
  children: ReactNode;
  hint?: string;
  actions?: ReactNode;
  /** Folded away until opened: for settings few people change. */
  collapsible?: boolean;
  /** Where the setup guide points. */
  tour?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  if (collapsible && title)
    return (
      <section className="pp-set-group pp-set-group--fold" data-tour={tour} data-open={open ? "true" : undefined} aria-labelledby={id}>
        <h2 className="pp-set-group__title">
          <button type="button" id={id} className="pp-set-fold" aria-expanded={open} onClick={() => setOpen(!open)}>
            <Icon name="chevronRight" size={13} strokeWidth={2} />
            <HintLabel hint={hint}>{title}</HintLabel>
          </button>
        </h2>
        {open && <div className="pp-set-group__rows">{children}</div>}
      </section>
    );
  return (
    <section className="pp-set-group" data-tour={tour} aria-labelledby={title ? id : undefined}>
      {title && (hint || actions) ? (
        <div className="pp-set-group__head">
          <h2 id={id} className="pp-set-group__title">
            <HintLabel hint={hint}>{title}</HintLabel>
          </h2>
          {actions}
        </div>
      ) : (
        title && (
          <h2 id={id} className="pp-set-group__title">
            {title}
          </h2>
        )
      )}
      {description && (
        <p className="pp-set-group__description">{description}</p>
      )}
      <div className="pp-set-group__rows">{children}</div>
    </section>
  );
}

interface SettingRowProps {
  label: string;
  /** Labels the control by id, when the control is a plain input. */
  htmlFor?: string;
  description?: ReactNode;
  /** Optional explanation using the same hover treatment as other settings forms. */
  hint?: string;
  /** Shown under the description; marks the row invalid. */
  error?: string;
  /** Controls on the right. */
  children: ReactNode;
  /** Put the control under the text, for wide controls. */
  stacked?: boolean;
  /** Where the setup guide points. */
  tour?: string;
}

/** One setting: its name and a line of explanation on the left, the control on the right. */
export function SettingRow({
  label,
  htmlFor,
  description,
  hint,
  error,
  children,
  stacked,
  tour,
}: SettingRowProps) {
  return (
    <div
      className="pp-set-row"
      data-tour={tour}
      data-stacked={stacked ? "true" : undefined}
      data-invalid={error ? "true" : undefined}
    >
      <div className="pp-set-row__text">
        {hint ? (
          <HintLabel htmlFor={htmlFor} hint={hint}>
            {label}
          </HintLabel>
        ) : htmlFor ? (
          <label className="pp-set-row__label" htmlFor={htmlFor}>
            {label}
          </label>
        ) : (
          <span className="pp-set-row__label">{label}</span>
        )}
        {description && (
          <p className="pp-set-row__description">{description}</p>
        )}
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
