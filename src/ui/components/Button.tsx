import type { ComponentPropsWithRef, ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import './Button.css';

type ButtonVariant = 'plain' | 'primary' | 'quiet' | 'danger';

// ComponentPropsWithRef keeps ref, events, disabled and aria-* flowing to the
// native button, so the component also works under asChild-style wrappers.
interface ButtonProps extends ComponentPropsWithRef<'button'> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  shape?: 'rounded' | 'pill';
  icon?: IconName;
  children: ReactNode;
}

export function Button({
  variant = 'plain',
  size = 'md',
  shape = 'rounded',
  icon,
  className,
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={className ? `pp-btn ${className}` : 'pp-btn'}
      data-variant={variant}
      data-size={size}
      data-shape={shape}
      {...rest}
    >
      {icon && <Icon name={icon} size={size === 'sm' ? 14 : 16} strokeWidth={1.6} />}
      <span>{children}</span>
    </button>
  );
}
