import { useEffect, useRef, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from './Icon';
import { IconButton } from './IconButton';
import './Toast.css';

export type ToastTone = 'neutral' | 'success' | 'warning' | 'error';

export interface ToastOptions {
  message: string;
  tone?: ToastTone;
  /** One action, e.g. "撤销" after a delete or "重试" after a failure. */
  action?: { label: string; onAction: () => void };
  /** Milliseconds; errors stay until dismissed unless one is given. */
  duration?: number;
}

interface ToastEntry extends ToastOptions {
  id: number;
  tone: ToastTone;
}

const MAX_VISIBLE = 3;
let entries: ToastEntry[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

/**
 * Show a short message at the top of the page. Callable from anywhere,
 * including logic code; render one <Toaster /> per page to display them.
 */
export const toast = {
  show(options: ToastOptions): number {
    const entry: ToastEntry = { ...options, tone: options.tone ?? 'neutral', id: nextId++ };
    entries = [...entries, entry].slice(-MAX_VISIBLE);
    emit();
    return entry.id;
  },
  dismiss(id: number): void {
    entries = entries.filter((entry) => entry.id !== id);
    emit();
  },
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const toneIcon: Record<ToastTone, IconName | null> = {
  neutral: null,
  success: 'check',
  warning: 'exclaim',
  error: 'close',
};

function defaultDuration(entry: ToastEntry): number | null {
  if (entry.duration !== undefined) return entry.duration;
  if (entry.tone === 'error') return null;
  return entry.action ? 6000 : 3500;
}

function ToastItem({ entry }: { entry: ToastEntry }) {
  const timer = useRef<number | undefined>(undefined);
  const remaining = useRef(defaultDuration(entry));
  const startedAt = useRef(0);

  const start = () => {
    if (remaining.current === null) return;
    startedAt.current = performance.now();
    timer.current = window.setTimeout(() => toast.dismiss(entry.id), remaining.current);
  };
  // Hovering or focusing a toast pauses its countdown.
  const pause = () => {
    if (remaining.current === null) return;
    window.clearTimeout(timer.current);
    remaining.current = Math.max(800, remaining.current - (performance.now() - startedAt.current));
  };

  useEffect(() => {
    start();
    return () => window.clearTimeout(timer.current);
  }, []); // once per toast

  const icon = toneIcon[entry.tone];
  return (
    <div
      className="pp-glass pp-toast"
      data-tone-kind={entry.tone}
      data-tone="float"
      role={entry.tone === 'error' ? 'alert' : 'status'}
      onPointerEnter={pause}
      onPointerLeave={start}
      onFocus={pause}
      onBlur={start}
    >
      {icon && (
        <span className="pp-toast__icon" aria-hidden="true">
          <Icon name={icon} size={14} strokeWidth={2} />
        </span>
      )}
      <span className="pp-toast__message">{entry.message}</span>
      {entry.action && (
        <button
          type="button"
          className="pp-toast__action"
          onClick={() => {
            entry.action?.onAction();
            toast.dismiss(entry.id);
          }}
        >
          {entry.action.label}
        </button>
      )}
      <IconButton icon="close" label="关闭提示" size="md" shape="pill" tooltip={false} onClick={() => toast.dismiss(entry.id)} />
    </div>
  );
}

/** Renders the toast stack. Place once per page. */
export function Toaster({ top = 64 }: { /** Distance from the window top, below the toolbar. */ top?: number }) {
  const current = useSyncExternalStore(subscribe, () => entries);
  return createPortal(
    <div className="pp-toaster" style={{ top }} aria-live="polite">
      {current.map((entry) => (
        <ToastItem key={entry.id} entry={entry} />
      ))}
    </div>,
    document.body,
  );
}
