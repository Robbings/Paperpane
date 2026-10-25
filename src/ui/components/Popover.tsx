import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useAnchoredPosition, type Placement } from './useAnchoredPosition';
import './Popover.css';

interface PopoverProps {
  /** The element the popover points at, usually its trigger button. */
  anchorRef: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  /** Accessible name of the popover. */
  label: string;
  placement?: Placement;
  /** Width in px; content decides when omitted. */
  width?: number;
  className?: string;
  children: ReactNode;
}

/**
 * A non-modal glass panel anchored to an element: previews, small forms,
 * citation cards. Closes on Esc or a click outside, and hands focus back to
 * the anchor if it was inside.
 */
export function Popover({ anchorRef, open, onClose, label, placement = 'bottom', width, className, children }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const position = useAnchoredPosition(anchorRef, ref, open, placement);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element;
      // Menus and suggestion lists opened from inside the popover live in
      // their own layers; using them is not an outside click.
      if (ref.current?.contains(target) || anchorRef.current?.contains(target) || target.closest?.('[data-pp-floating]')) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      if (ref.current?.contains(document.activeElement)) anchorRef.current?.focus();
      onClose();
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={label}
      className={className ? `pp-glass pp-popover ${className}` : 'pp-glass pp-popover'}
      data-tone="float"
      data-side={position?.side}
      style={{
        width,
        top: position?.top ?? 0,
        left: position?.left ?? 0,
        visibility: position ? undefined : 'hidden',
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
