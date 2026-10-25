import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import type { DockPlacement } from './types';

interface SplitterProps {
  placement: DockPlacement;
  value: number;
  min: number;
  max: number;
  /** Receives the size the pointer or keyboard asks for; the caller clamps it. */
  onResize: (size: number) => void;
  /** Size from the pointer position, so the edge follows the pointer. */
  sizeFromPointer: (clientX: number, clientY: number) => number;
  /** True while a pointer drag is in progress (layout animation pauses). */
  onDragChange?: (dragging: boolean) => void;
}

const STEP = 16;
const BIG_STEP = 64;

export function Splitter({ placement, value, min, max, onResize, sizeFromPointer, onDragChange }: SplitterProps) {
  const dragging = useRef(false);

  const endDrag = () => {
    if (!dragging.current) return;
    dragging.current = false;
    onDragChange?.(false);
    document.body.style.removeProperty('cursor');
    document.body.style.removeProperty('user-select');
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragging.current = true;
    onDragChange?.(true);
    document.body.style.cursor = placement === 'right' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (dragging.current) onResize(sizeFromPointer(event.clientX, event.clientY));
  };

  // The handle sits on the edge facing the paper, so growing means moving
  // left (right dock) or up (bottom dock).
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? BIG_STEP : STEP;
    const grow = placement === 'right' ? 'ArrowLeft' : 'ArrowUp';
    const shrink = placement === 'right' ? 'ArrowRight' : 'ArrowDown';
    const next =
      event.key === grow ? value + step
      : event.key === shrink ? value - step
      : event.key === 'Home' ? min
      : event.key === 'End' ? max
      : undefined;
    if (next !== undefined) {
      event.preventDefault();
      onResize(next);
    }
  };

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label={placement === 'right' ? '调整研究区宽度' : '调整研究区高度'}
      aria-orientation={placement === 'right' ? 'vertical' : 'horizontal'}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      className="pp-splitter"
      data-placement={placement}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      onKeyDown={onKeyDown}
    />
  );
}
