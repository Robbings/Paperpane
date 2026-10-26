import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type CSSProperties } from 'react';
import { IconButton } from '@/ui/components';
import type { AnnotationView, ViewRect } from '../types';
import './notes.css';

/** An open comment note: where it floats (window pixels) and its stacking order. */
export interface OpenNote {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
}

export const NOTE_SIZE = { width: 260, height: 168, minWidth: 220, minHeight: 124, maxWidth: 520, maxHeight: 520 };
const SAVE_PAUSE = 700;
const EDGE = 8;

interface CommentNotesProps {
  notes: readonly OpenNote[];
  annotations: readonly AnnotationView[];
  /** The paper's scroll container: connectors follow the text while it scrolls. */
  scrollContainer: HTMLElement | null;
  annotationRects: (id: string) => readonly ViewRect[] | null;
  onChange: (note: OpenNote) => void;
  onRaise: (id: string) => void;
  onClose: (id: string) => void;
  onComment: (id: string, comment: string) => void;
  onLocate: (id: string) => void;
}

const dot = (color: string) => ({ '--pp-dot': `var(--pp-hl-${color}-dot)` }) as CSSProperties;
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

/** The point on a rectangle closest to (x, y). */
function nearest(rect: ViewRect, x: number, y: number) {
  return { x: clamp(x, rect.left, rect.left + rect.width), y: clamp(y, rect.top, rect.top + rect.height) };
}

/**
 * Floating comment notes over the paper. Each can be dragged by its header and
 * resized from its corner; hovering one draws a dashed line to its passage.
 */
export function CommentNotes(props: CommentNotesProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [, setTick] = useState(0);

  // While a connector shows, redraw it as the paper scrolls or the window resizes.
  useEffect(() => {
    if (!hovered) return;
    const redraw = () => setTick((n) => n + 1);
    props.scrollContainer?.addEventListener('scroll', redraw, { passive: true });
    window.addEventListener('resize', redraw);
    return () => {
      props.scrollContainer?.removeEventListener('scroll', redraw);
      window.removeEventListener('resize', redraw);
    };
  }, [hovered, props.scrollContainer]);

  const hoveredNote = props.notes.find((note) => note.id === hovered);
  const rects = hoveredNote ? props.annotationRects(hoveredNote.id) : null;
  const visibleRects = rects?.filter((r) => r.top + r.height > 0 && r.top < window.innerHeight) ?? [];

  let connector: { x1: number; y1: number; x2: number; y2: number } | null = null;
  if (hoveredNote && visibleRects.length) {
    // From the note's edge point nearest the passage to the passage point nearest the note.
    const noteRect = { left: hoveredNote.x, top: hoveredNote.y, width: hoveredNote.width, height: hoveredNote.height };
    const cx = hoveredNote.x + hoveredNote.width / 2;
    const cy = hoveredNote.y + hoveredNote.height / 2;
    const target = visibleRects
      .map((r) => nearest(r, cx, cy))
      .reduce((best, p) => (Math.hypot(p.x - cx, p.y - cy) < Math.hypot(best.x - cx, best.y - cy) ? p : best));
    const start = nearest(noteRect, target.x, target.y);
    connector = { x1: start.x, y1: start.y, x2: target.x, y2: target.y };
  }

  return (
    <>
      {hoveredNote && visibleRects.length > 0 && (
        <svg className="pp-note-connector" aria-hidden="true" width="100%" height="100%">
          {visibleRects.map((r, i) => (
            <rect key={i} x={r.left - 2} y={r.top - 1} width={r.width + 4} height={r.height + 2} rx={3} className="pp-note-connector__mark" />
          ))}
          {connector && <line {...connector} className="pp-note-connector__line" />}
          {connector && <circle cx={connector.x2} cy={connector.y2} r={2.5} className="pp-note-connector__end" />}
        </svg>
      )}
      {props.notes.map((note) => {
        const annotation = props.annotations.find((a) => a.id === note.id);
        if (!annotation) return null;
        return (
          <CommentNote
            key={note.id}
            note={note}
            annotation={annotation}
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
    </>
  );
}

interface CommentNoteProps {
  note: OpenNote;
  annotation: AnnotationView;
  onHover: (on: boolean) => void;
  onChange: (note: OpenNote) => void;
  onRaise: () => void;
  onClose: () => void;
  onComment: (text: string) => void;
  onLocate: () => void;
}

function CommentNote({ note, annotation, onHover, onChange, onRaise, onClose, onComment, onLocate }: CommentNoteProps) {
  const [draft, setDraft] = useState(annotation.note ?? '');
  const saved = useRef(annotation.note ?? '');
  const timer = useRef<number | undefined>(undefined);
  const gesture = useRef<{ kind: 'move' | 'resize'; x: number; y: number; start: OpenNote } | null>(null);
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

  const begin = (kind: 'move' | 'resize') => (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || (kind === 'move' && (event.target as HTMLElement).closest('button'))) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { kind, x: event.clientX, y: event.clientY, start: note };
    onRaise();
  };
  const move = (event: ReactPointerEvent<HTMLElement>) => {
    const g = gesture.current;
    if (!g) return;
    const dx = event.clientX - g.x;
    const dy = event.clientY - g.y;
    if (g.kind === 'move') {
      onChange({
        ...g.start,
        x: clamp(g.start.x + dx, EDGE, window.innerWidth - g.start.width - EDGE),
        y: clamp(g.start.y + dy, EDGE, window.innerHeight - g.start.height - EDGE),
      });
    } else {
      onChange({
        ...g.start,
        width: clamp(g.start.width + dx, NOTE_SIZE.minWidth, Math.min(NOTE_SIZE.maxWidth, window.innerWidth - g.start.x - EDGE)),
        height: clamp(g.start.height + dy, NOTE_SIZE.minHeight, Math.min(NOTE_SIZE.maxHeight, window.innerHeight - g.start.y - EDGE)),
      });
    }
  };
  const end = () => {
    gesture.current = null;
  };

  return (
    <section
      className="pp-glass pp-note"
      data-tone="float"
      aria-label={`评论：${annotation.quote ?? '页面评论'}`}
      style={{ left: note.x, top: note.y, width: note.width, height: note.height, zIndex: note.z }}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onHover(false);
      }}
      onPointerDown={onRaise}
    >
      <header className="pp-note__head" onPointerDown={begin('move')} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
        <span className="pp-note__dot" style={dot(annotation.color)} aria-hidden="true" />
        <span className="pp-note__quote" title={annotation.quote}>
          {annotation.quote ?? `第 ${annotation.pageIndex + 1} 页的评论`}
        </span>
        <IconButton icon="region" label="定位到原文" size="md" shape="pill" onClick={onLocate} />
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
        aria-label="评论"
        placeholder="写下你的想法…"
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
            onClose();
          }
        }}
      />
      <span
        className="pp-note__resize"
        aria-hidden="true"
        onPointerDown={begin('resize')}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      />
    </section>
  );
}
