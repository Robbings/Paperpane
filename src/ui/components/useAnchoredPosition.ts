import { useLayoutEffect, useState, type RefObject } from 'react';

export type Placement = 'top' | 'bottom' | 'top-start' | 'top-end' | 'bottom-start' | 'bottom-end' | 'left' | 'right';

const EDGE = 8;

interface Position {
  top: number;
  left: number;
  /** The side actually used after flipping to stay on screen. */
  side: 'top' | 'bottom' | 'left' | 'right';
}

function place(anchor: DOMRect, floating: DOMRect, placement: Placement, offset: number): Position {
  const [side, align] = placement.split('-') as ['top' | 'bottom' | 'left' | 'right', 'start' | 'end' | undefined];
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // Floating elements cap their own size to the window (CSS max-height /
  // max-width with internal scrolling), so clamping both axes keeps every
  // edge, and every button inside, on screen.
  const clampX = (left: number) => clamp(left, EDGE, vw - floating.width - EDGE);
  const clampY = (top: number) => clamp(top, EDGE, vh - floating.height - EDGE);

  if (side === 'left' || side === 'right') {
    const spaceRight = vw - EDGE - (anchor.right + offset);
    const spaceLeft = anchor.left - offset - EDGE;
    const fitsRight = floating.width <= spaceRight;
    const fitsLeft = floating.width <= spaceLeft;
    // Preferred side if it fits, else the other if that fits, else the roomier one.
    const useRight = side === 'right' ? fitsRight || (!fitsLeft && spaceRight >= spaceLeft) : !fitsLeft && (fitsRight || spaceRight > spaceLeft);
    const left = useRight ? anchor.right + offset : anchor.left - offset - floating.width;
    const top = anchor.top + anchor.height / 2 - floating.height / 2;
    return { side: useRight ? 'right' : 'left', left: clampX(left), top: clampY(top) };
  }

  const spaceBelow = vh - EDGE - (anchor.bottom + offset);
  const spaceAbove = anchor.top - offset - EDGE;
  const fitsBelow = floating.height <= spaceBelow;
  const fitsAbove = floating.height <= spaceAbove;
  const useBottom = side === 'bottom' ? fitsBelow || (!fitsAbove && spaceBelow >= spaceAbove) : !fitsAbove && (fitsBelow || spaceBelow > spaceAbove);
  const top = useBottom ? anchor.bottom + offset : anchor.top - offset - floating.height;
  const left =
    align === 'start' ? anchor.left
    : align === 'end' ? anchor.right - floating.width
    : anchor.left + anchor.width / 2 - floating.width / 2;
  return { side: useBottom ? 'bottom' : 'top', top: clampY(top), left: clampX(left) };
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

/**
 * Positions a fixed floating element next to an anchor, flipping to the
 * other side and clamping to the window. Tracks scroll and resize while open.
 */
export function useAnchoredPosition(
  anchorRef: RefObject<HTMLElement | null>,
  floatingRef: RefObject<HTMLElement | null>,
  open: boolean,
  placement: Placement = 'bottom',
  offset = 8,
): Position | null {
  const [position, setPosition] = useState<Position | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    const update = () => {
      const anchor = anchorRef.current;
      const floating = floatingRef.current;
      if (!anchor || !floating) return;
      // Entrance transforms temporarily shrink the visual rectangle. Position
      // using the final layout size so enlarged menus stay inside the viewport.
      setPosition(place(anchor.getBoundingClientRect(), new DOMRect(0, 0, floating.offsetWidth, floating.offsetHeight), placement, offset));
    };
    update();
    const resize = new ResizeObserver(update);
    if (floatingRef.current) resize.observe(floatingRef.current);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      resize.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [anchorRef, floatingRef, open, placement, offset]);

  return position;
}

/**
 * Where a floating layer should mount: inside the open <dialog> its anchor is
 * in (dialogs sit in the top layer, above anything placed in the body), else
 * in the body.
 */
export function layerFor(anchor: Element | null | undefined): HTMLElement {
  return (anchor?.closest('dialog[open]') as HTMLElement | null) ?? document.body;
}
