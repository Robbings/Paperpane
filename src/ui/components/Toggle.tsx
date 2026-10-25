import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';
import './Toggle.css';

interface ToggleBaseProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: ReactNode;
  disabled?: boolean;
}

/** An on/off setting that takes effect immediately (role="switch"). */
export function Switch({ checked, onChange, label, description, disabled, hideLabel }: ToggleBaseProps & { /** Just the switch, e.g. in a list row that already names the item. */ hideLabel?: boolean }) {
  const id = useId();
  if (hideLabel) {
    return (
      <button
        type="button"
        role="switch"
        className="pp-switch"
        aria-label={label}
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
      >
        <span className="pp-switch__thumb" />
      </button>
    );
  }
  return (
    <div className="pp-toggle" data-disabled={disabled ? 'true' : undefined}>
      <div className="pp-toggle__text">
        <label htmlFor={id} className="pp-toggle__label">
          {label}
        </label>
        {description && (
          <p id={`${id}-description`} className="pp-toggle__description">
            {description}
          </p>
        )}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        className="pp-switch"
        aria-checked={checked}
        aria-describedby={description ? `${id}-description` : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
      >
        <span className="pp-switch__thumb" />
      </button>
    </div>
  );
}

interface CheckboxProps extends ToggleBaseProps {
  /** Partly selected, e.g. "select all" with some rows chosen. */
  indeterminate?: boolean;
}

/** A choice in a list or form (native checkbox, custom look). */
export function Checkbox({ checked, onChange, label, description, disabled, indeterminate }: CheckboxProps) {
  const id = useId();
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = Boolean(indeterminate);
  }, [indeterminate]);

  return (
    <div className="pp-toggle pp-toggle--check" data-disabled={disabled ? 'true' : undefined}>
      <span className="pp-checkbox">
        <input
          ref={ref}
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          aria-describedby={description ? `${id}-description` : undefined}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className="pp-checkbox__box" aria-hidden="true">
          {indeterminate ? <Icon name="minus" size={12} strokeWidth={2.4} /> : checked && <Icon name="check" size={12} strokeWidth={2.4} />}
        </span>
      </span>
      <div className="pp-toggle__text">
        <label htmlFor={id} className="pp-toggle__label">
          {label}
        </label>
        {description && (
          <p id={`${id}-description`} className="pp-toggle__description">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}
