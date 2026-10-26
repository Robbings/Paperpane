import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { Icon, IconButton } from '@/ui/components';
import type { AnnotationView, ViewRect } from '../types';
import './notes.css';

/**
 * A comment note's layout. It is pinned to its passage: (dx, dy) is its offset
 * from the passage's top-left corner on the paper, so it scrolls and zooms with
 * the text. Closed notes keep their layout for when they reopen.
 */
export interface NoteLayout {
  id: string;
  dx: number;
  dy: number;
  width: number;
  height: number;
  collapsed: boolean;
  open: boolean;
  z: number;
}

export const NOTE_SIZE = { width: 260, height: 168, minWidth: 220, minHeight: 124, maxWidth: 520, maxHeight: 520 };
const SAVE_PAUSE = 700;
const PILL_HEIGHT = 34;

interface CommentNotesProps {
  notes: readonly NoteLayout[];
  annotations: readonly AnnotationView[];
  /** The paper's scroll container: notes live in it, so they move with the paper. */
  container: HTMLElement | null;
  /** Changes when the paper is laid out anew (zoom, docking), so passages are measured again. */
  layoutKey: string;
  annotationRects: (id: string) => readonly ViewRect[] | null;
  onChange: (note: NoteLayout) => void;
  onRaise: (id: string) => void;
  onClose: (id: string) => void;
  onComment: (id: string, comment: string) => void;
  onLocate: (id: string) => void;
}

const dot = (color: string) => ({ '--pp-dot': `var(--pp-hl-${color}-dot)` }) as CSSProperties;
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

/** A note's title: the first line of its comment, like a note app; else the start of its passage. */
export function noteTitle(annotation: AnnotationView): string {
  const first = annotation.note?.split('\n').find((line) => line.trim())?.trim();
  if (first) return first;
  const quote = annotation.quote?.trim();
  return quote ? (quote.length > 24 ? `${quote.slice(0, 24)}…` : quote) : `第 ${annotation.pageIndex + 1} 页的评论`;
}

/** The point on a rectangle closest to (x, y). */
function nearest(rect: ViewRect, x: number, y: number) {
  return { x: clamp(x, rect.left, rect.left + rect.width), y: clamp(y, rect.top, rect.top + rect.height) };
}

/**
 * Comment notes on the paper. Each is pinned to its passage and scrolls with
 * it; it can be dragged, resized, folded into a titled pill, closed and
 * reopened. Hovering one draws a dashed line to its passage.
 */
export function CommentNotes(props: CommentNotesProps) {
  const { container, notes } = props;
  const [anchors, setAnchors] = useState<ReadonlyMap<string, { x: number; y: number }>>(new Map());
  const known = useRef(new Map<string, { x: number; y: number }>());
  const elements = useRef(new Map<string, HTMLElement>());
  const [hovered, setHovered] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const openIds = notes.filter((n) => n.open).map((n) => n.id).join(',');

  // Where each open note's passage starts, in the paper's own coordinates. A passage on
  // a page that is not rendered keeps its last known place.
  const measure = () => {
    if (!container) return;
    const box = container.getBoundingClientRect();
    const next = new Map<string, { x: number; y: number }>();
    for (const note of notes) {
      if (!note.open) continue;
      const first = props.annotationRects(note.id)?.[0];
      const point = first
        ? { x: first.left - box.left - container.clientLeft + container.scrollLeft, y: first.top - box.top - container.clientTop + container.scrollTop }
        : known.current.get(note.id);
      if (point) {
        known.current.set(note.id, point);
        next.set(note.id, point);
      }
    }
    setAnchors(next);
  };

  useLayoutEffect(measure, [openIds, props.layoutKey, props.annotations, container]);

  // The paper changes size as pages render or the window resizes: measure again.
  useEffect(() => {
    if (!container) return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(container);
    if (container.firstElementChild) observer.observe(container.firstElementChild);
    return () => observer.disconnect();
  }, [container, openIds]);

  // While a connector shows, redraw it as the paper scrolls or the window resizes.
  useEffect(() => {
    if (!hovered) return;
    const redraw = () => setTick((n) => n + 1);
    container?.addEventListener('scroll', redraw, { passive: true });
    window.addEventListener('resize', redraw);
    return () => {
      container?.removeEventListener('scroll', redraw);
      window.removeEventListener('resize', redraw);
    };
  }, [hovered, container]);

  if (!container) return null;

  // The dashed connector, drawn over the window from the hovered note to its passage.
  const hoveredElement = hovered ? elements.current.get(hovered) : undefined;
  const rects = hovered ? props.annotationRects(hovered) : null;
  const visibleRects = rects?.filter((r) => r.top + r.height > 0 && r.top < window.innerHeight) ?? [];
  let connector: { x1: number; y1: number; x2: number; y2: number } | null = null;
  if (hoveredElement && visibleRects.length) {
    const nb = hoveredElement.getBoundingClientRect();
    const cx = nb.left + nb.width / 2;
    const cy = nb.top + nb.height / 2;
    const target = visibleRects
      .map((r) => nearest(r, cx, cy))
      .reduce((best, p) => (Math.hypot(p.x - cx, p.y - cy) < Math.hypot(best.x - cx, best.y - cy) ? p : best));
    const start = nearest({ left: nb.left, top: nb.top, width: nb.width, height: nb.height }, target.x, target.y);
    connector = { x1: start.x, y1: start.y, x2: target.x, y2: target.y };
  }

  const bounds = { width: container.scrollWidth, height: container.scrollHeight };

  return (
    <>
      {hoveredElement && visibleRects.length > 0 && (
        <svg className="pp-note-connector" aria-hidden="true" width="100%" height="100%">
          {visibleRects.map((r, i) => (
            <rect key={i} x={r.left - 2} y={r.top - 1} width={r.width + 4} height={r.height + 2} rx={3} className="pp-note-connector__mark" />
          ))}
          {connector && <line {...connector} className="pp-note-connector__line" />}
          {connector && <circle cx={connector.x2} cy={connector.y2} r={2.5} className="pp-note-connector__end" />}
        </svg>
      )}
      {createPortal(
        // Inside the scroll container, so notes move with the paper. Runtimes ignore pointer events from here.
        <div className="pp-notes-layer" data-pp-overlay="">
          {notes.map((note) => {
            const annotation = props.annotations.find((a) => a.id === note.id);
            const anchor = anchors.get(note.id);
            if (!note.open || !annotation || !anchor) return null;
            return (
              <CommentNote
                key={note.id}
                note={note}
                anchor={anchor}
                bounds={bounds}
                annotation={annotation}
                register={(el) => (el ? elements.current.set(note.id, el) : elements.current.delete(note.id))}
                onHover={(on) => setHovered((current) => (on ? note.id : current === note.id ? null : current))}
                onChange={props.onChange}
                onRaise={() => props.onRaise(note.id)}
                onClose={() => {
                  setHovered(null);
                  props.onClose(note.id);
                }}
                onComment={(text) => props.onComment(note.id, text)}
                onLocate={() => props.onLocate(note.id)}
              />
            );
          })}
        </div>,
        container,
      )}
    </>
  );
}

interface CommentNoteProps {
  note: NoteLayout;
  /** The passage's top-left on the paper. */
  anchor: { x: number; y: number };
  /** The paper's scrollable size: notes stay inside it. */
  bounds: { width: number; height: number };
  annotation: AnnotationView;
  register: (element: HTMLElement | null) => void;
  onHover: (on: boolean) => void;
  onChange: (note: NoteLayout) => void;
  onRaise: () => void;
  onClose: () => void;
  onComment: (text: string) => void;
  onLocate: () => void;
}

function CommentNote({ note, anchor, bounds, annotation, register, onHover, onChange, onRaise, onClose, onComment, onLocate }: CommentNoteProps) {
  const [draft, setDraft] = useState(annotation.note ?? '');
  const saved = useRef(annotation.note ?? '');
  const timer = useRef<number | undefined>(undefined);
  const gesture = useRef<{ kind: 'move' | 'resize'; x: number; y: number; start: NoteLayout; moved: boolean } | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  // Take outside changes (e.g. edited in the annotation list) unless typing here.
  useEffect(() => {
    if (document.activeElement !== textRef.current) setDraft(annotation.note ?? '');
    saved.current = annotation.note ?? '';
  }, [annotation.note]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const commit = (text: string) => {
    window.clearTimeout(timer.current);
    if (text.trim() === saved.current.trim()) return;
    saved.current = text;
    onComment(text.trim());
  };

  const left = anchor.x + note.dx;
  const top = anchor.y + note.dy;
  const width = note.collapsed ? undefined : note.width;
  const height = note.collapsed ? PILL_HEIGHT : note.height;

  const begin = (kind: 'move' | 'resize') => (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || (kind === 'move' && (event.target as HTMLElement).closest('button, textarea'))) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { kind, x: event.clientX, y: event.clientY, start: note, moved: false };
    onRaise();
  };
  const move = (event: ReactPointerEvent<HTMLElement>) => {
    const g = gesture.current;
    if (!g) return;
    const dx = event.clientX - g.x;
    const dy = event.clientY - g.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) g.moved = true;
    const own = (event.currentTarget.closest('.pp-note') as HTMLElement | null)?.getBoundingClientRect();
    if (g.kind === 'move') {
      // Stay on the paper: within its scrollable area.
      const w = own?.width ?? g.start.width;
      onChange({
        ...g.start,
        dx: clamp(anchor.x + g.start.dx + dx, 0, bounds.width - w) - anchor.x,
        dy: clamp(anchor.y + g.start.dy + dy, 0, bounds.height - height) - anchor.y,
      });
    } else {
      onChange({
        ...g.start,
        width: clamp(g.start.width + dx, NOTE_SIZE.minWidth, NOTE_SIZE.maxWidth),
        height: clamp(g.start.height + dy, NOTE_SIZE.minHeight, NOTE_SIZE.maxHeight),
      });
    }
  };
  const end = () => {
    const g = gesture.current;
    gesture.current = null;
    // A click (no drag) on a folded note opens it.
    if (g && !g.moved && g.kind === 'move' && note.collapsed) onChange({ ...note, collapsed: false });
  };

  const drag = { onPointerDown: begin('move'), onPointerMove: move, onPointerUp: end, onPointerCancel: end };
  const title = noteTitle({ ...annotation, note: draft });

  return (
    <section
      ref={register}
      className={note.collapsed ? 'pp-glass pp-note pp-note--pill' : 'pp-glass pp-note'}
      data-tone="float"
      aria-label={`评论：${title}`}
      style={{ left, top, width, height, zIndex: note.z }}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onHover(false);
      }}
      onPointerDown={onRaise}
    >
      {note.collapsed ? (
        <div className="pp-note__pill" {...drag}>
          <Icon name="comment" size={15} className="pp-note__pill-icon" />
          <span className="pp-note__pill-title">{title}</span>
          <IconButton icon="openExternal" label="展开评论" size="md" shape="pill" onClick={() => onChange({ ...note, collapsed: false })} />
        </div>
      ) : (
        <>
          <header className="pp-note__head" {...drag}>
            <span className="pp-note__dot" style={dot(annotation.color)} aria-hidden="true" />
            <span className="pp-note__quote" title={annotation.quote}>
              {annotation.quote ?? `第 ${annotation.pageIndex + 1} 页的评论`}
            </span>
            <IconButton icon="region" label="定位到原文" size="md" shape="pill" onClick={onLocate} />
            <IconButton
              icon="minus"
              label="收起"
              size="md"
              shape="pill"
              onClick={() => {
                commit(draft);
                onChange({ ...note, collapsed: true });
              }}
            />
            <IconButton
              icon="close"
              label="关闭评论"
              size="md"
              shape="pill"
              onClick={() => {
                commit(draft);
                onClose();
              }}
            />
          </header>
          <textarea
            ref={textRef}
            className="pp-note__text"
            aria-label="评论（第一行作为标题）"
            placeholder={'第一行是标题\n然后写下你的想法…'}
            value={draft}
            onChange={(event) => {
              const text = event.target.value;
              setDraft(text);
              window.clearTimeout(timer.current);
              timer.current = window.setTimeout(() => commit(text), SAVE_PAUSE);
            }}
            onBlur={() => commit(draft)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                commit(draft);
                onChange({ ...note, collapsed: true });
              }
            }}
          />
          <span className="pp-note__resize" aria-hidden="true" onPointerDown={begin('resize')} onPointerMove={move} onPointerUp={end} onPointerCancel={end} />
        </>
      )}
    </section>
  );
}
