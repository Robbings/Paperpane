import type { ComponentPropsWithRef } from 'react';
import { Icon, type IconName } from './Icon';
import './IconButton.css';

interface IconButtonProps extends Omit<ComponentPropsWithRef<'button'>, 'children'> {
  icon: IconName;
  /** Accessible name; also shown as the native tooltip. */
  label: string;
  size?: 'md' | 'lg';
  shape?: 'rounded' | 'pill';
  /** Marks a toggle or the current tab. */
  active?: boolean;
}

export function IconButton({
  icon,
  label,
  size = 'lg',
  shape = 'rounded',
  active,
  className,
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      className={className ? `pp-icon-btn ${className}` : 'pp-icon-btn'}
      aria-label={label}
      title={label}
      data-size={size}
      data-shape={shape}
      data-active={active ? 'true' : undefined}
      {...rest}
    >
      <Icon name={icon} size={size === 'md' ? 16 : 18} />
    </button>
  );
}
