import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
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
  /** Milliseconds before it starts to fade; hover or focus pauses the countdown. */
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

/**
 * Mounted toasters, oldest first. Only one shows the stack: the newest inside a
 * dialog if any (it sits above the backdrop and is not inert), else the newest.
 */
let hosts: { inline: boolean }[] = [];
const activeHost = () => hosts.filter((h) => h.inline).at(-1) ?? hosts.at(-1);

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

/** How long a toast takes to fade out once its time is up. */
const FADE = 900;

function defaultDuration(entry: ToastEntry): number | null {
  if (entry.duration !== undefined) return entry.duration;
  if (entry.tone === 'error') return 5000;
  return entry.action ? 4000 : 1800;
}

function ToastItem({ entry }: { entry: ToastEntry }) {
  const timer = useRef<number | undefined>(undefined);
  const fadeTimer = useRef<number | undefined>(undefined);
  const [fading, setFading] = useState(false);
  const remaining = useRef(defaultDuration(entry));
  const startedAt = useRef(0);
  const running = useRef(false);
  // Hover and focus are tracked separately: the countdown only runs while
  // the pointer is outside the toast *and* focus is outside it.
  const hovered = useRef(false);
  const focused = useRef(false);

  // Hovering or focusing a fading toast brings it back; leaving lets it fade again.
  const pause = () => {
    if (!running.current || remaining.current === null) return;
    window.clearTimeout(timer.current);
    window.clearTimeout(fadeTimer.current);
    running.current = false;
    setFading(false);
    remaining.current = Math.max(1200, remaining.current - (performance.now() - startedAt.current));
  };
  const resume = () => {
    if (running.current || remaining.current === null) return;
    running.current = true;
    startedAt.current = performance.now();
    timer.current = window.setTimeout(() => {
      setFading(true);
      fadeTimer.current = window.setTimeout(() => toast.dismiss(entry.id), FADE);
    }, remaining.current);
  };
  const update = () => (hovered.current || focused.current ? pause() : resume());

  useEffect(() => {
    resume();
    return () => {
      window.clearTimeout(timer.current);
      window.clearTimeout(fadeTimer.current);
      running.current = false;
    };
  }, []); // once per toast

  const icon = toneIcon[entry.tone];
  return (
    <div
      className="pp-glass pp-toast"
      data-tone-kind={entry.tone}
      data-fading={fading ? 'true' : undefined}
      data-tone="float"
      role={entry.tone === 'error' ? 'alert' : 'status'}
      onPointerEnter={() => {
        hovered.current = true;
        update();
      }}
      onPointerLeave={() => {
        hovered.current = false;
        update();
      }}
      onFocus={() => {
        focused.current = true;
        update();
      }}
      onBlur={(event) => {
        // Moving between the toast's own buttons keeps focus inside.
        focused.current = event.currentTarget.contains(event.relatedTarget as Node | null);
        update();
      }}
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

/** Renders the toast stack. Place once per page; Dialog adds its own while open. */
export function Toaster({
  top = 64,
  inline = false,
}: {
  /** Distance from the window top, below the toolbar. */
  top?: number;
  /** Render in place instead of on <body>, e.g. inside a modal dialog. */
  inline?: boolean;
}) {
  const [host] = useState(() => ({ inline }));
  useLayoutEffect(() => {
    hosts = [...hosts, host];
    emit();
    return () => {
      hosts = hosts.filter((h) => h !== host);
      emit();
    };
  }, [host]);
  const current = useSyncExternalStore(subscribe, () => (activeHost() === host ? entries : null));
  if (!current) return null;
  const stack = (
    <div className="pp-toaster" style={{ top }} aria-live="polite">
      {current.map((entry) => (
        <ToastItem key={entry.id} entry={entry} />
      ))}
    </div>
  );
  return inline ? stack : createPortal(stack, document.body);
}
