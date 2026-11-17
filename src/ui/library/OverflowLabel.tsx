import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';

/** Long metadata moves only after a deliberate hover/focus, without changing row width. */
export function OverflowLabel({ children }: { children: string }) {
  const root = useRef<HTMLSpanElement>(null), text = useRef<HTMLSpanElement>(null);
  const [distance, setDistance] = useState(0);
  useLayoutEffect(() => {
    const measure = () => setDistance(Math.max(0, (text.current?.scrollWidth ?? 0) - (root.current?.clientWidth ?? 0)));
    measure();
    const observer = new ResizeObserver(measure);
    if (root.current) observer.observe(root.current);
    return () => observer.disconnect();
  }, [children]);
  return <span ref={root} className="pp-overflow-label" title={children} tabIndex={distance > 0 ? 0 : undefined}
    data-overflow={distance > 0 || undefined} style={{ '--overflow-distance': `${-distance}px`, '--overflow-duration': `${Math.max(3, distance / 30)}s` } as CSSProperties}>
    <span ref={text}>{children}</span>
  </span>;
}
