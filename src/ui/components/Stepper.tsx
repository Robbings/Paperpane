import { Icon } from './Icon';
import './Stepper.css';

interface StepperProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  /** Accessible name. */
  label: string;
  /** How the value reads, e.g. as a percentage. */
  format?: (value: number) => string;
}

/** A number changed one step at a time: minus, the value, plus. */
export function Stepper({ value, min, max, step = 1, onChange, label, format = String }: StepperProps) {
  const set = (next: number) => onChange(Math.min(max, Math.max(min, next)));
  return (
    <div
      className="pp-stepper"
      role="spinbutton"
      tabIndex={0}
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuetext={format(value)}
      onKeyDown={(event) => {
        if (event.key === 'ArrowUp' || event.key === 'ArrowRight') set(value + step);
        else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') set(value - step);
        else if (event.key === 'Home') set(min);
        else if (event.key === 'End') set(max);
        else return;
        event.preventDefault();
      }}
    >
      <button type="button" tabIndex={-1} aria-label="减小" disabled={value <= min} onClick={() => set(value - step)}>
        <Icon name="minus" size={13} strokeWidth={1.8} />
      </button>
      <span className="pp-stepper__value">{format(value)}</span>
      <button type="button" tabIndex={-1} aria-label="增大" disabled={value >= max} onClick={() => set(value + step)}>
        <Icon name="plus" size={13} strokeWidth={1.8} />
      </button>
    </div>
  );
}
