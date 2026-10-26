import type { ComponentPropsWithRef } from 'react';
import { Icon, type IconName } from './Icon';
import { Tooltip } from './Tooltip';
import type { Placement } from './useAnchoredPosition';
import './IconButton.css';

interface IconButtonProps extends Omit<ComponentPropsWithRef<'button'>, 'children'> {
  icon: IconName;
  /** Accessible name; also shown as the tooltip. */
  label: string;
  size?: 'md' | 'lg';
  shape?: 'rounded' | 'pill';
  /** Marks a toggle or the current tab. */
  active?: boolean;
  /** Keyboard shortcut shown in the tooltip. */
  shortcut?: string;
  tooltipPlacement?: Placement;
  /** Turn the tooltip off, e.g. while the button's own menu is open. */
  tooltip?: boolean;
}

export function IconButton({
  icon,
  label,
  size = 'lg',
  shape = 'rounded',
  active,
  shortcut,
  tooltipPlacement = 'bottom',
  tooltip = true,
  className,
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <Tooltip label={label} shortcut={shortcut} placement={tooltipPlacement} labelsChild disabled={!tooltip}>
      <button
        type={type}
        className={className ? `pp-icon-btn ${className}` : 'pp-icon-btn'}
        aria-label={label}
        data-size={size}
        data-shape={shape}
        data-active={active ? 'true' : undefined}
        {...rest}
      >
        <Icon name={icon} size={size === 'md' ? 16 : 18} />
      </button>
    </Tooltip>
  );
}
