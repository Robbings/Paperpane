import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';

interface Metrics {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  scrollLeft: number;
  scrollWidth: number;
  clientWidth: number;
}

interface OverlayScrollbarProps {
  /** The scroll container; its native scrollbars are hidden in CSS. */
  target: RefObject<HTMLElement | null>;
  /** Shown beside the vertical thumb while dragging, e.g. "第 3 / 6 页". */
  dragLabel?: string;
}

type Axis = 'y' | 'x';

const MIN_THUMB = 36;
const HIDE_DELAY = 900;
/** Pointer distance from the paper area's edge that reveals the bars. */
const REVEAL_DISTANCE = 28;

const empty: Metrics = { scrollTop: 0, scrollHeight: 0, clientHeight: 0, scrollLeft: 0, scrollWidth: 0, clientWidth: 0 };

/**
 * macOS-style floating scrollbars for the paper area: thin capsules that
 * appear while scrolling or when the pointer nears the edge, then fade.
 * Wheel, trackpad and keyboard scrolling stay native.
 */
export function OverlayScrollbar({ target, dragLabel }: OverlayScrollbarProps) {
  const [metrics, setMetrics] = useState<Metrics>(empty);
  const [visible, setVisible] = useState(false);
  const [dragging, setDragging] = useState<Axis | null>(null);
  const hideTimer = useRef<number | undefined>(undefined);
  const hovering = useRef(false);
  const trackY = useRef<HTMLDivElement>(null);
  const trackX = useRef<HTMLDivElement>(null);
  const drag = useRef<{ axis: Axis; start: number; startScroll: number; ratio: number } | null>(null);

  const read = useCallback(() => {
    const el = target.current;
    if (!el) return;
    setMetrics({
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      scrollLeft: el.scrollLeft,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    });
  }, [target]);

  const reveal = useCallback(() => {
    setVisible(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      if (!hovering.current && !drag.current) setVisible(false);
    }, HIDE_DELAY);
  }, []);

  useEffect(() => {
    const el = target.current;
    if (!el) return;
    read();
    const onScroll = () => {
      read();
      reveal();
    };
    // Reveal when the pointer comes near the right or bottom edge of the paper area.
    const onPointerMove = (event: PointerEvent) => {
      const box = el.getBoundingClientRect();
      if (box.right - event.clientX < REVEAL_DISTANCE || box.bottom - event.clientY < REVEAL_DISTANCE) reveal();
    };
    const resize = new ResizeObserver(read);
    resize.observe(el);
    if (el.firstElementChild) resize.observe(el.firstElementChild);
    el.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('pointermove', onPointerMove, { passive: true });
    return () => {
      resize.disconnect();
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('pointermove', onPointerMove);
      window.clearTimeout(hideTimer.current);
    };
  }, [target, read, reveal]);

  const geometry = (axis: Axis) => {
    const track = (axis === 'y' ? trackY.current?.clientHeight : trackX.current?.clientWidth) ?? 0;
    const content = axis === 'y' ? metrics.scrollHeight : metrics.scrollWidth;
    const view = axis === 'y' ? metrics.clientHeight : metrics.clientWidth;
    const offset = axis === 'y' ? metrics.scrollTop : metrics.scrollLeft;
    const scrollable = content - view;
    if (scrollable <= 1 || track === 0) return null;
    const size = Math.max(MIN_THUMB, (track * view) / content);
    const position = ((track - size) * offset) / scrollable;
    return { size, position, ratio: scrollable / (track - size), view };
  };

  const startDrag = (axis: Axis) => (event: ReactPointerEvent<HTMLDivElement>) => {
    const el = target.current;
    const geo = geometry(axis);
    if (!el || !geo || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      axis,
      start: axis === 'y' ? event.clientY : event.clientX,
      startScroll: axis === 'y' ? el.scrollTop : el.scrollLeft,
      ratio: geo.ratio,
    };
    setDragging(axis);
    document.body.style.userSelect = 'none';
  };

  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const el = target.current;
    const current = drag.current;
    if (!el || !current) return;
    const delta = ((current.axis === 'y' ? event.clientY : event.clientX) - current.start) * current.ratio;
    if (current.axis === 'y') el.scrollTop = current.startScroll + delta;
    else el.scrollLeft = current.startScroll + delta;
  };

  const endDrag = () => {
    if (!drag.current) return;
    drag.current = null;
    setDragging(null);
    document.body.style.removeProperty('user-select');
    reveal();
  };

  // Clicking the track pages toward the click, like a native scrollbar.
  const pageTo = (axis: Axis) => (event: ReactPointerEvent<HTMLDivElement>) => {
    const el = target.current;
    const geo = geometry(axis);
    if (!el || !geo || event.target !== event.currentTarget) return;
    const box = event.currentTarget.getBoundingClientRect();
    const point = axis === 'y' ? event.clientY - box.top : event.clientX - box.left;
    const direction = point < geo.position ? -1 : 1;
    el.scrollBy({ [axis === 'y' ? 'top' : 'left']: direction * geo.view * 0.9, behavior: 'smooth' });
  };

  const hoverHandlers = {
    onPointerEnter: () => {
      hovering.current = true;
      reveal();
    },
    onPointerLeave: () => {
      hovering.current = false;
      reveal();
    },
  };

  const y = geometry('y');
  const x = geometry('x');
  const shown = visible || dragging !== null;

  return (
    <>
      <div
        ref={trackY}
        className="pp-scroll"
        data-axis="y"
        data-visible={shown && y ? 'true' : 'false'}
        data-dragging={dragging === 'y' ? 'true' : undefined}
        aria-hidden="true"
        onPointerDown={pageTo('y')}
        {...hoverHandlers}
      >
        {y && (
          <div
            className="pp-scroll__thumb"
            style={{ height: y.size, transform: `translateY(${y.position}px)` }}
            onPointerDown={startDrag('y')}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onLostPointerCapture={endDrag}
          >
            {dragging === 'y' && dragLabel && <span className="pp-glass pp-scroll__label">{dragLabel}</span>}
          </div>
        )}
      </div>
      <div
        ref={trackX}
        className="pp-scroll"
        data-axis="x"
        data-visible={shown && x ? 'true' : 'false'}
        data-dragging={dragging === 'x' ? 'true' : undefined}
        aria-hidden="true"
        onPointerDown={pageTo('x')}
        {...hoverHandlers}
      >
        {x && (
          <div
            className="pp-scroll__thumb"
            style={{ width: x.size, transform: `translateX(${x.position}px)` }}
            onPointerDown={startDrag('x')}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onLostPointerCapture={endDrag}
          />
        )}
      </div>
    </>
  );
}
