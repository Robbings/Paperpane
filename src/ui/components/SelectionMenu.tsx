import { Fragment, useRef, type CSSProperties, type KeyboardEvent } from 'react';
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

/**
 * How actions are shown (under review): text · icon (name on hover) · both side by side ·
 * stacked (icon over a small name) · reveal (icon; the name slides out on hover).
 */
export type SelectionMenuLook = 'text' | 'icon' | 'both' | 'stacked' | 'reveal';

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
  look?: SelectionMenuLook;
  /**
   * What to show, in order: "colors" for the colour dots and action ids for
   * actions. Left out: hidden. Default: colours, then every action.
   */
  layout?: readonly string[];
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
  look = 'text',
  layout,
}: SelectionMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const sequence = (layout ?? ['colors', ...actions.map((a) => a.id)]).filter((id) => id === 'colors' || actions.some((a) => a.id === id));

  const colors = (
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
  );

  const renderAction = (action: SelectionMenuAction) =>
    look === 'icon' ? (
      <Tooltip key={action.id} label={action.label} placement="top" labelsChild>
        <button type="button" className="pp-selmenu__action" aria-label={action.label} onClick={() => onAction?.(action.id)}>
          <Icon name={action.icon} size={17} strokeWidth={1.5} />
        </button>
      </Tooltip>
    ) : (
      <button key={action.id} type="button" className="pp-selmenu__action" onClick={() => onAction?.(action.id)}>
        {look !== 'text' && <Icon name={action.icon} size={look === 'stacked' ? 17 : 15} strokeWidth={1.5} />}
        {look === 'reveal' ? (
          <span className="pp-selmenu__reveal">
            <span>{action.label}</span>
          </span>
        ) : (
          <span>{action.label}</span>
        )}
      </button>
    );

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
      data-look={look}
      style={style}
      onKeyDown={handleKeyDown}
    >
      {sequence.map((entry, index) => {
        // The colour dots sit apart from the actions: a line between them and their neighbours.
        const apart = index > 0 && (entry === 'colors' || sequence[index - 1] === 'colors');
        return (
          <Fragment key={entry}>
            {apart && <span className="pp-selmenu__sep" aria-hidden="true" />}
            {entry === 'colors' ? colors : renderAction(actions.find((a) => a.id === entry)!)}
          </Fragment>
        );
      })}

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
