import { useRef, type CSSProperties, type KeyboardEvent } from 'react';
import { Icon, type IconName } from './Icon';
import { Tooltip } from './Tooltip';
import './SelectionMenu.css';

export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink' | 'purple';

export const highlightColors: readonly HighlightColor[] = ['yellow', 'green', 'blue', 'pink', 'purple'];

const colorLabels: Record<HighlightColor, string> = {
  yellow: '黄色',
  green: '绿色',
  blue: '蓝色',
  pink: '粉色',
  purple: '紫色',
};

export interface SelectionMenuAction {
  id: string;
  label: string;
  icon: IconName;
}

interface SelectionMenuProps {
  /** Accessible name, e.g. "选区操作" or "高亮操作". */
  label: string;
  actions: readonly SelectionMenuAction[];
  /** Set when the menu belongs to an existing highlight. */
  currentColor?: HighlightColor;
  onColor?: (color: HighlightColor) => void;
  onAction?: (id: string) => void;
  /** Shows a separated delete button at the end. */
  onDelete?: () => void;
  onDismiss?: () => void;
  className?: string;
  /** The caller positions the menu (it is laid out at its natural width). */
  style?: CSSProperties;
}

const dotStyle = (color: HighlightColor) => ({ '--pp-dot': `var(--pp-hl-${color}-dot)` }) as CSSProperties;

export function SelectionMenu({
  label,
  actions,
  currentColor,
  onColor,
  onAction,
  onDelete,
  onDismiss,
  className,
  style,
}: SelectionMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Toolbar keyboard model: arrows move between items, Esc closes.
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      onDismiss?.();
      return;
    }
    const items = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('button') ?? []);
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const target =
      event.key === 'ArrowRight' ? items[(index + 1) % items.length]
      : event.key === 'ArrowLeft' ? items[(index - 1 + items.length) % items.length]
      : event.key === 'Home' ? items[0]
      : event.key === 'End' ? items[items.length - 1]
      : undefined;
    if (target) {
      event.preventDefault();
      target.focus();
    }
  };

  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label={label}
      className={className ? `pp-glass pp-selmenu ${className}` : 'pp-glass pp-selmenu'}
      data-tone="float"
      style={style}
      onKeyDown={handleKeyDown}
    >
      <div className="pp-selmenu__colors">
        {highlightColors.map((color) => {
          const isCurrent = color === currentColor;
          const name = `${colorLabels[color]}高亮${isCurrent ? '（当前）' : ''}`;
          return (
            <Tooltip key={color} label={name} placement="top" labelsChild>
              <button
                type="button"
                className="pp-selmenu__swatch"
                aria-label={name}
                aria-pressed={currentColor ? isCurrent : undefined}
                style={dotStyle(color)}
                onClick={() => onColor?.(color)}
              >
                <span className="pp-selmenu__dot" />
              </button>
            </Tooltip>
          );
        })}
      </div>

      <span className="pp-selmenu__sep" aria-hidden="true" />

      {actions.map((action) => (
        // Text only: short labels read faster than icons and keep the bar small over the paper.
        <button key={action.id} type="button" className="pp-selmenu__action" onClick={() => onAction?.(action.id)}>
          {action.label}
        </button>
      ))}

      {onDelete && (
        <>
          <span className="pp-selmenu__sep" aria-hidden="true" />
          <Tooltip label="删除高亮" placement="top" labelsChild>
            <button type="button" className="pp-selmenu__delete" aria-label="删除高亮" onClick={onDelete}>
              <Icon name="trash" size={15} strokeWidth={1.5} />
            </button>
          </Tooltip>
        </>
      )}
    </div>
  );
}
