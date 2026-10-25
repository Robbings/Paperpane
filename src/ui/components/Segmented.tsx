import './Segmented.css';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name of the whole group. */
  label: string;
  size?: 'sm' | 'md';
  /** Items share the full width equally. */
  stretch?: boolean;
  className?: string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  size = 'md',
  stretch,
  className,
}: SegmentedProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={className ? `pp-seg ${className}` : 'pp-seg'}
      data-size={size}
      data-stretch={stretch ? 'true' : undefined}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className="pp-seg__item"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
