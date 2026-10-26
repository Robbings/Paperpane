import { useCallback, useEffect, useImperativeHandle, useRef, useState, type HTMLAttributes, type PointerEvent, type Ref } from 'react';
import './ScrollArea.css';

interface ScrollAreaProps extends HTMLAttributes<HTMLDivElement> {
  /** The scrolling element, for callers that read or set its position. */
  viewportRef?: Ref<HTMLDivElement>;
  /** Class for the scrolling element (padding, max-height). Other props also go to it. */
  viewportClassName?: string;
}

const MIN_THUMB = 28;
const HIDE_DELAY = 800;

/**
 * A vertical scroll container with a thin floating thumb instead of the
 * system scrollbar. The thumb shows while scrolling or when the pointer is
 * over the area, and can be dragged. Wheel and keyboard scrolling stay native.
 */
export function ScrollArea({ viewportRef, viewportClassName, className, children, onScroll, ...rest }: ScrollAreaProps) {
  const viewport = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  useImperativeHandle(viewportRef, () => viewport.current as HTMLDivElement, []);
  const [metrics, setMetrics] = useState({ top: 0, height: 0, view: 0 });
  const [visible, setVisible] = useState(false);
  const [dragging, setDragging] = useState(false);
  const hideTimer = useRef<number | undefined>(undefined);
  const hovering = useRef(false);
  const drag = useRef<{ start: number; startScroll: number; ratio: number } | null>(null);

  const read = useCallback(() => {
    const el = viewport.current;
    if (el) setMetrics({ top: el.scrollTop, height: el.scrollHeight, view: el.clientHeight });
  }, []);

  const reveal = useCallback(() => {
    setVisible(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      if (!hovering.current && !drag.current) setVisible(false);
    }, HIDE_DELAY);
  }, []);

  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    // The content can change size while the viewport does not: watch the children too.
    const resize = new ResizeObserver(read);
    const observeAll = () => {
      resize.disconnect();
      resize.observe(el);
      Array.from(el.children).forEach((child) => resize.observe(child));
      read();
    };
    const mutations = new MutationObserver(observeAll);
    mutations.observe(el, { childList: true });
    observeAll();
    return () => {
      resize.disconnect();
      mutations.disconnect();
      window.clearTimeout(hideTimer.current);
    };
  }, [read]);

  const trackHeight = track.current?.clientHeight ?? metrics.view;
  const scrollable = metrics.height - metrics.view;
  let thumb: { size: number; position: number; ratio: number } | null = null;
  if (scrollable > 1 && trackHeight > 0) {
    const size = Math.max(MIN_THUMB, (trackHeight * metrics.view) / metrics.height);
    thumb = { size, position: ((trackHeight - size) * metrics.top) / scrollable, ratio: scrollable / (trackHeight - size) };
  }

  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    const el = viewport.current;
    if (!el || !thumb || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { start: event.clientY, startScroll: el.scrollTop, ratio: thumb.ratio };
    setDragging(true);
    document.body.style.userSelect = 'none';
  };
  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    const el = viewport.current;
    if (el && drag.current) el.scrollTop = drag.current.startScroll + (event.clientY - drag.current.start) * drag.current.ratio;
  };
  const endDrag = () => {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);
    document.body.style.removeProperty('user-select');
    reveal();
  };
  // Clicking the track pages toward the click.
  const pageTo = (event: PointerEvent<HTMLDivElement>) => {
    const el = viewport.current;
    if (!el || !thumb || event.target !== event.currentTarget) return;
    const offset = event.clientY - event.currentTarget.getBoundingClientRect().top;
    el.scrollBy({ top: (offset < thumb.position ? -1 : 1) * metrics.view * 0.9, behavior: 'smooth' });
  };

  return (
    <div
      className={className ? `pp-scrollarea ${className}` : 'pp-scrollarea'}
      onPointerEnter={() => {
        hovering.current = true;
        reveal();
      }}
      onPointerLeave={() => {
        hovering.current = false;
        reveal();
      }}
    >
      <div
        ref={viewport}
        className={viewportClassName ? `pp-scrollarea__viewport ${viewportClassName}` : 'pp-scrollarea__viewport'}
        onScroll={(event) => {
          read();
          reveal();
          onScroll?.(event);
        }}
        {...rest}
      >
        {children}
      </div>
      <div
        ref={track}
        className="pp-scrollarea__bar"
        data-visible={(visible || dragging) && thumb ? 'true' : 'false'}
        data-dragging={dragging ? 'true' : undefined}
        aria-hidden="true"
        onPointerDown={pageTo}
      >
        {thumb && (
          <div
            className="pp-scrollarea__thumb"
            style={{ height: thumb.size, transform: `translateY(${thumb.position}px)` }}
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onLostPointerCapture={endDrag}
          />
        )}
      </div>
    </div>
  );
}
