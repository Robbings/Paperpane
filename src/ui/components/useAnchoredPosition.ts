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

  if (side === 'left' || side === 'right') {
    const fitsRight = anchor.right + offset + floating.width <= vw - EDGE;
    const fitsLeft = anchor.left - offset - floating.width >= EDGE;
    const useRight = side === 'right' ? fitsRight || !fitsLeft : !fitsLeft && fitsRight;
    const left = useRight ? anchor.right + offset : anchor.left - offset - floating.width;
    const top = anchor.top + anchor.height / 2 - floating.height / 2;
    return { side: useRight ? 'right' : 'left', left, top: clamp(top, EDGE, vh - floating.height - EDGE) };
  }

  const fitsBelow = anchor.bottom + offset + floating.height <= vh - EDGE;
  const fitsAbove = anchor.top - offset - floating.height >= EDGE;
  const useBottom = side === 'bottom' ? fitsBelow || !fitsAbove : !fitsAbove && fitsBelow;
  const top = useBottom ? anchor.bottom + offset : anchor.top - offset - floating.height;
  const left =
    align === 'start' ? anchor.left
    : align === 'end' ? anchor.right - floating.width
    : anchor.left + anchor.width / 2 - floating.width / 2;
  return { side: useBottom ? 'bottom' : 'top', top, left: clamp(left, EDGE, vw - floating.width - EDGE) };
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
      setPosition(place(anchor.getBoundingClientRect(), floating.getBoundingClientRect(), placement, offset));
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
