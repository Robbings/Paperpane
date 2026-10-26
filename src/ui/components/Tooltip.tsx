import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Kbd } from './Kbd';
import { layerFor, useAnchoredPosition, type Placement } from './useAnchoredPosition';
import './Tooltip.css';

interface TooltipProps {
  label: string;
  /** Keyboard shortcut shown after the label, e.g. "⌘F". */
  shortcut?: string;
  placement?: Placement;
  /**
   * Set when the child already carries this text as its accessible name
   * (icon buttons with aria-label): the tooltip is then visual only.
   * Otherwise it is linked as a description.
   */
  labelsChild?: boolean;
  disabled?: boolean;
  /** Class for the wrapper span, which is the element its parent lays out. */
  className?: string;
  children: ReactNode;
}

const SHOW_DELAY = 450;
/** Moving between neighbouring buttons right after a tooltip shows skips the delay. */
const WARM_WINDOW = 500;
let warmUntil = 0;

/** A small glass label for controls, replacing the browser's own title tooltip. */
export function Tooltip({ label, shortcut, placement = 'bottom', labelsChild, disabled, className, children }: TooltipProps) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const id = useId();
  const position = useAnchoredPosition(anchorRef, tipRef, open, placement, 6);

  const show = (immediate: boolean) => {
    if (disabled) return;
    window.clearTimeout(timer.current);
    if (immediate || performance.now() < warmUntil) setOpen(true);
    else timer.current = window.setTimeout(() => setOpen(true), SHOW_DELAY);
  };
  const hide = () => {
    window.clearTimeout(timer.current);
    if (open) warmUntil = performance.now() + WARM_WINDOW;
    setOpen(false);
  };

  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <span
      ref={anchorRef}
      className={className ? `pp-tooltip-anchor ${className}` : 'pp-tooltip-anchor'}
      aria-describedby={!labelsChild && open ? id : undefined}
      onPointerEnter={(event) => event.pointerType === 'mouse' && show(false)}
      onPointerLeave={hide}
      onPointerDown={hide}
      onFocus={(event) => (event.target as HTMLElement).matches(':focus-visible') && show(true)}
      onBlur={hide}
    >
      {children}
      {open &&
        createPortal(
          <div
            ref={tipRef}
            id={id}
            role="tooltip"
            aria-hidden={labelsChild ? true : undefined}
            className="pp-glass pp-tooltip"
            data-tone="float"
            data-side={position?.side}
            style={{ top: position?.top ?? 0, left: position?.left ?? 0, visibility: position ? undefined : 'hidden' }}
          >
            <span>{label}</span>
            {shortcut && <Kbd>{shortcut}</Kbd>}
          </div>,
          layerFor(anchorRef.current),
        )}
    </span>
  );
}
