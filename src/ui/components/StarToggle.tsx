import { Tooltip } from './Tooltip';
import './StarToggle.css';

const STAR = 'M12 4.2l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4-3.9-3.8 5.4-.8z';

interface StarToggleProps {
  starred: boolean;
  /** Omit for a display-only star. */
  onChange?: (starred: boolean) => void;
  size?: 'sm' | 'md';
}

/** A "favourite" mark: one star that is either on or off. */
export function StarToggle({ starred, onChange, size = 'md' }: StarToggleProps) {
  const px = size === 'sm' ? 17 : 19;
  const icon = (
    <svg viewBox="0 0 24 24" width={px} height={px} aria-hidden="true" className="pp-star__icon">
      <path d={STAR} />
    </svg>
  );
  if (!onChange) {
    return starred ? (
      <span className="pp-star" data-on="true" role="img" aria-label="已标星">
        {icon}
      </span>
    ) : null;
  }
  const label = starred ? '取消标星' : '标星';
  return (
    <Tooltip label={label} labelsChild>
      <button
        type="button"
        className="pp-star"
        data-size={size}
        data-on={starred ? 'true' : undefined}
        aria-label="标星"
        aria-pressed={starred}
        onClick={(event) => {
          event.stopPropagation();
          onChange(!starred);
        }}
      >
        {icon}
      </button>
    </Tooltip>
  );
}
