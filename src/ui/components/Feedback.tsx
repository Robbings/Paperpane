import type { CSSProperties, ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import './Feedback.css';

interface ProgressBarProps {
  /** 0 to 1; omit when the length of the work is unknown (indeterminate). */
  value?: number;
  /** Accessible name, e.g. "提取文字". */
  label: string;
  /** Visible text under the bar, e.g. "第 12 / 30 页". */
  detail?: ReactNode;
}

/**
 * Real progress only: pass `value` when the logic layer can measure it,
 * otherwise leave it out and the bar shows activity without a number.
 */
export function ProgressBar({ value, label, detail }: ProgressBarProps) {
  const known = value !== undefined;
  const percent = known ? Math.round(Math.min(Math.max(value, 0), 1) * 100) : undefined;
  return (
    <div className="pp-progress">
      <div
        className="pp-progress__track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={known ? 0 : undefined}
        aria-valuemax={known ? 100 : undefined}
        aria-valuenow={percent}
        data-indeterminate={known ? undefined : 'true'}
      >
        <span className="pp-progress__bar" style={known ? { width: `${percent}%` } : undefined} />
      </div>
      {detail && <div className="pp-progress__detail">{detail}</div>}
    </div>
  );
}

/** Small busy indicator for buttons and inline status. */
export function Spinner({ size = 14, label }: { size?: number; label?: string }) {
  return (
    <span
      className="pp-spinner"
      style={{ width: size, height: size } as CSSProperties}
      role={label ? 'status' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}

interface SkeletonProps {
  /** Text lines to imitate; the last one is shorter. */
  lines?: number;
  /** A block instead of lines, e.g. a thumbnail. */
  height?: number;
  width?: number | string;
}

/** Placeholder shapes while content loads. */
export function Skeleton({ lines = 3, height, width }: SkeletonProps) {
  if (height !== undefined) {
    return <span className="pp-skeleton pp-skeleton--block" style={{ height, width: width ?? '100%' }} aria-hidden="true" />;
  }
  return (
    <span className="pp-skeleton-lines" style={{ width: width ?? '100%' }} aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => (
        <span key={index} className="pp-skeleton" style={{ width: index === lines - 1 && lines > 1 ? '62%' : '100%' }} />
      ))}
    </span>
  );
}

interface EmptyStateProps {
  icon: IconName;
  title: string;
  description?: ReactNode;
  /** Buttons that resolve the empty or failed state. */
  actions?: ReactNode;
  tone?: 'neutral' | 'danger';
}

/** Explains why a region is empty or failed, and what to do next. */
export function EmptyState({ icon, title, description, actions, tone = 'neutral' }: EmptyStateProps) {
  return (
    <div className="pp-empty" data-tone={tone}>
      <span className="pp-empty__icon" aria-hidden="true">
        <Icon name={icon} size={22} strokeWidth={1.5} />
      </span>
      <p className="pp-empty__title">{title}</p>
      {description && <div className="pp-empty__description">{description}</div>}
      {actions && <div className="pp-empty__actions">{actions}</div>}
    </div>
  );
}

interface BadgeProps {
  tone?: 'neutral' | 'accent' | 'ok' | 'warn' | 'danger';
  children: ReactNode;
}

/** A short label: counts, "演示", model capabilities, statuses. */
export function Badge({ tone = 'neutral', children }: BadgeProps) {
  return (
    <span className="pp-badge" data-tone={tone}>
      {children}
    </span>
  );
}
