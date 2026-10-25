import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from './Icon';
import './Menu.css';

export type MenuEntry =
  | { kind?: 'item'; id: string; label: string; icon?: IconName; checked?: boolean; disabled?: boolean }
  | { kind: 'separator'; id: string };

interface MenuProps {
  /** Accessible name of the menu. */
  label: string;
  entries: readonly MenuEntry[];
  /** Viewport point the menu opens from: a pointer position or a button corner. */
  anchor: { x: number; y: number };
  /** Open to the left of the anchor (for buttons near the right edge). */
  align?: 'start' | 'end';
  /** The button that toggles the menu; pressing it is not an outside click. */
  triggerRef?: RefObject<HTMLElement | null>;
  onSelect: (id: string) => void;
  onClose: () => void;
}

const EDGE = 8;

/** A glass popover menu rendered in a portal, clamped to the window. */
export function Menu({ label, entries, anchor, align = 'start', triggerRef, onSelect, onClose }: MenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    const { width, height } = menu.getBoundingClientRect();
    const preferredLeft = align === 'end' ? anchor.x - width : anchor.x;
    const left = Math.min(Math.max(preferredLeft, EDGE), window.innerWidth - width - EDGE);
    const fitsBelow = anchor.y + height + EDGE <= window.innerHeight;
    const top = fitsBelow ? anchor.y : Math.max(anchor.y - height, EDGE);
    setPosition({ top, left });
    menu.querySelector<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)')?.focus();
  }, [anchor.x, anchor.y, align]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!ref.current?.contains(target) && !triggerRef?.current?.contains(target)) onClose();
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('resize', onClose);
    window.addEventListener('blur', onClose);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose, triggerRef]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      onClose();
      return;
    }
    const items = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)') ?? []);
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const target =
      event.key === 'ArrowDown' ? items[(index + 1) % items.length]
      : event.key === 'ArrowUp' ? items[(index - 1 + items.length) % items.length]
      : event.key === 'Home' ? items[0]
      : event.key === 'End' ? items[items.length - 1]
      : undefined;
    if (target) {
      event.preventDefault();
      target.focus();
    }
  };

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      className="pp-glass pp-menu"
      data-tone="float"
      style={position ?? { visibility: 'hidden', top: anchor.y, left: anchor.x }}
      onKeyDown={onKeyDown}
      onContextMenu={(event) => {
        // React events bubble through the portal; keep a right-click here from reopening a parent's menu.
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      {entries.map((entry) =>
        entry.kind === 'separator' ? (
          <div key={entry.id} role="separator" className="pp-menu__sep" />
        ) : (
          <button
            key={entry.id}
            type="button"
            role={entry.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
            aria-checked={entry.checked}
            disabled={entry.disabled}
            className="pp-menu__item"
            onClick={() => {
              onSelect(entry.id);
              onClose();
            }}
          >
            <span className="pp-menu__lead" aria-hidden="true">
              {entry.checked ? <Icon name="check" size={14} strokeWidth={1.8} /> : entry.icon ? <Icon name={entry.icon} size={16} strokeWidth={1.5} /> : null}
            </span>
            <span>{entry.label}</span>
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}
