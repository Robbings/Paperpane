import { useCallback, useEffect, useId, useLayoutEffect, useRef, type ComponentPropsWithRef, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import './TextField.css';

interface FieldFrameProps {
  id: string;
  label: string;
  /** Hide the label visually; it stays for screen readers. */
  hideLabel?: boolean;
  description?: ReactNode;
  /** Shown in place of the description; marks the field invalid. */
  error?: string;
  /** Right side of the label row, e.g. a character count. */
  meta?: ReactNode;
  children: ReactNode;
}

function FieldFrame({ id, label, hideLabel, description, error, meta, children }: FieldFrameProps) {
  return (
    <div className="pp-field" data-invalid={error ? 'true' : undefined}>
      {(!hideLabel || meta) && (
        <div className="pp-field__label-row">
          <label htmlFor={id} className={hideLabel ? 'pp-visually-hidden' : 'pp-field__label'}>
            {label}
          </label>
          {meta && <span className="pp-field__meta">{meta}</span>}
        </div>
      )}
      {hideLabel && !meta && (
        <label htmlFor={id} className="pp-visually-hidden">
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p id={`${id}-message`} className="pp-field__error">
          {error}
        </p>
      ) : (
        description && (
          <p id={`${id}-message`} className="pp-field__description">
            {description}
          </p>
        )
      )}
    </div>
  );
}

type InputBase = Omit<ComponentPropsWithRef<'input'>, 'value' | 'onChange' | 'size'>;

interface TextFieldProps extends InputBase {
  label: string;
  hideLabel?: boolean;
  value: string;
  onChange: (value: string) => void;
  description?: ReactNode;
  error?: string;
  icon?: IconName;
  /** Shows a clear button while there is text. */
  clearable?: boolean;
}

/** Single-line text input with label, description and error message. */
export function TextField({ label, hideLabel, value, onChange, description, error, icon, clearable, id, disabled, ...rest }: TextFieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <FieldFrame id={fieldId} label={label} hideLabel={hideLabel} description={description} error={error}>
      <div className="pp-input" data-disabled={disabled ? 'true' : undefined}>
        {icon && <Icon name={icon} size={15} className="pp-input__icon" />}
        <input
          id={fieldId}
          value={value}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || description ? `${fieldId}-message` : undefined}
          onChange={(event) => onChange(event.target.value)}
          {...rest}
        />
        {clearable && value && !disabled && (
          <button type="button" className="pp-input__clear" aria-label={`清除${label}`} onClick={() => onChange('')}>
            <Icon name="close" size={12} strokeWidth={2} />
          </button>
        )}
      </div>
    </FieldFrame>
  );
}

type TextareaBase = Omit<ComponentPropsWithRef<'textarea'>, 'value' | 'onChange'>;

interface TextAreaProps extends TextareaBase {
  label: string;
  hideLabel?: boolean;
  value: string;
  onChange: (value: string) => void;
  description?: ReactNode;
  error?: string;
  /** Grow with the content up to this many rows, then scroll. */
  maxRows?: number;
  /** Shows "n / max" next to the label. */
  maxLength?: number;
}

/** Multi-line text input that grows with its content. */
export function TextArea({ label, hideLabel, value, onChange, description, error, rows = 3, maxRows = 12, maxLength, id, ...rest }: TextAreaProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const ref = useRef<HTMLTextAreaElement>(null);

  const fit = useCallback(() => {
    const el = ref.current;
    // Not laid out (e.g. inside a dialog that is still closed): measuring now
    // would give 0, so wait until it is shown.
    if (!el || el.getClientRects().length === 0) return;
    const style = getComputedStyle(el);
    const line = parseFloat(style.lineHeight) || 20;
    const max = line * maxRows + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
    el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden';
  }, [maxRows]);

  useLayoutEffect(fit, [value, fit]);

  // Fit again when it becomes visible or its width changes (which re-wraps the text).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let width = -1;
    const observer = new ResizeObserver(([entry]) => {
      const next = entry?.contentRect.width ?? 0;
      if (next === width) return;
      width = next;
      fit();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [fit]);

  return (
    <FieldFrame
      id={fieldId}
      label={label}
      hideLabel={hideLabel}
      description={description}
      error={error}
      meta={maxLength ? `${value.length} / ${maxLength}` : undefined}
    >
      <textarea
        ref={ref}
        id={fieldId}
        className="pp-textarea"
        rows={rows}
        value={value}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || description ? `${fieldId}-message` : undefined}
        onChange={(event) => onChange(event.target.value)}
        {...rest}
      />
    </FieldFrame>
  );
}
