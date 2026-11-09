import { MarkdownEditor } from '@/ui/markdown/MarkdownEditor';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { Icon, IconButton, Menu, highlightColors, type HighlightColor } from '@/ui/components';
import type { AnnotationView, NoteLayout, ViewRect } from '../types';
import { floatingLeft, floatingMargin, floatingPaperBounds, floatingPaperOriginX, useFloatingCanvas, type PaperBounds } from '../windows/floating-canvas';

export type { NoteLayout };
import './notes.css';

export const NOTE_SIZE = { width: 260, height: 168, minWidth: 220, minHeight: 124, maxWidth: 520, maxHeight: 520 };
const PILL_HEIGHT = 34;

interface CommentNotesProps {
  notes: readonly NoteLayout[];
  annotations: readonly AnnotationView[];
  /** The paper's scroll container: notes live in it, so they move with the paper. */
  container: HTMLElement | null;
  /** Changes when the paper is laid out anew (zoom, docking), so passages are measured again. */
  layoutKey: string;
  zoomPercent: number;
  uiScale?: number;
  annotationRects: (id: string) => readonly ViewRect[] | null;
  /** Geometry updates from the runtime (pages rendered, zoom, relayout). */
  subscribeGeometry: (listener: () => void) => () => void;
  onChange: (note: NoteLayout) => void;
  onRaise: (id: string) => void;
  onClose: (id: string) => void;
  onComment: (id: string, comment: string) => void;
  onLocate: (id: string) => void;
  onRemoveComment: (id: string) => void;
  /** Sets the passage's highlight, or takes it off (null). */
  onHighlight?: (id: string, color: HighlightColor | null) => void;
}

const colorNames: Record<HighlightColor, string> = { yellow: '黄色', green: '绿色', blue: '蓝色', pink: '粉色', purple: '紫色' };
const dot = (color: string) => ({ '--pp-dot': `var(--pp-hl-${color}-dot)` }) as CSSProperties;
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

/** A note's title: the first line of its comment, like a note app; else the start of its passage. */
export function noteTitle(annotation: AnnotationView): string {
  const first = annotation.note?.split('\n').find((line) => line.trim())?.trim();
  if (first) return first.replace(/^#{1,6}\s+/, '').replace(/!\[([^\]]*)\]\([^)]+\)/g,'$1').replace(/\*\*|__/g,'');
  const quote = annotation.quote?.trim();
  return quote ? (quote.length > 24 ? `${quote.slice(0, 24)}…` : quote) : `第 ${annotation.pageIndex + 1} 页的旁注`;
}

/**
 * Focus from the keyboard shows the connector like hovering does. A click (or
 * typing in the editor) does not, so the line goes away once the pointer leaves.
 */
export const keyboardFocus = (target: EventTarget) =>
  target instanceof Element && target.matches(':focus-visible') && !target.closest('[contenteditable], textarea, input');

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
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const openIds = notes.filter((n) => n.open).map((n) => n.id).join(',');
  // Observers and subscriptions call measure later: read the latest props, not the ones they closed over.
  const latest = useRef(props);
  latest.current = props;
  const paper = container ? floatingPaperBounds(container) : {left:0,right:0,bottom:0};
  const cardWidth = (note: NoteLayout) => elements.current.get(note.id)?.getBoundingClientRect().width
    ?? (note.collapsed ? NOTE_SIZE.width : note.width) * (props.uiScale ?? 1) * props.zoomPercent / (note.zoom ?? 100);
  const extents = notes.flatMap(note => {
    const anchor = anchors.get(note.id);
    if (!container || !note.open || !anchor) return [];
    const width = cardWidth(note), left = floatingLeft(paper, anchor.x + note.dx * props.zoomPercent / (note.zoom ?? 100), width);
    return [{left,right:left+width}];
  });
  const canvas = useFloatingCanvas(container, extents.length ? Math.min(...extents.map(card => card.left)) : null, extents.length ? Math.max(...extents.map(card => card.right)) : null);

  // Where each open note's passage starts, in the paper's own coordinates. A passage on
  // a page that is not rendered keeps its last known place until it renders.
  const measure = () => {
    const { container: el, notes: list, annotationRects } = latest.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    const originX = floatingPaperOriginX(el);
    const next = new Map<string, { x: number; y: number }>();
    for (const note of list) {
      if (!note.open) continue;
      const first = annotationRects(note.id)?.[0];
      const point = first
        ? { x: first.left - originX, y: first.top - box.top - el.clientTop + el.scrollTop }
        : known.current.get(note.id);
      if (point) {
        known.current.set(note.id, point);
        next.set(note.id, point);
      }
    }
    setAnchors(current => {
      if (current.size !== next.size) return next;
      for (const [id, point] of next) {
        const previous = current.get(id);
        if (previous?.x !== point.x || previous.y !== point.y) return next;
      }
      return current;
    });
  };

  useLayoutEffect(measure, [openIds, props.layoutKey, props.annotations, container, canvas.inset]);

  // Measure again when the runtime says positions changed (a page rendered, zoom, relayout)
  // and when the paper changes size.
  const subscribeGeometry = props.subscribeGeometry;
  useEffect(() => subscribeGeometry(() => measure()), [subscribeGeometry]);
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

  // Existing page gutters count toward the card's room; only add space beyond the actual PDF.
  const bounds = { left: paper.left, width: paper.right, height: paper.bottom + 300 };
  const margin = floatingMargin(paper, Math.max(0, ...notes.filter(note => note.open).map(cardWidth)));

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
          {dragging && <div aria-hidden="true" style={{position:'absolute',width:bounds.width+margin+canvas.inset,height:bounds.height,pointerEvents:'none'}}/>}
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
                paper={paper}
                container={container}
                uiScale={props.uiScale ?? 1}
                scale={props.zoomPercent / (note.zoom ?? 100)}
                canvas={canvas}
                annotation={annotation}
                register={(el) => (el ? elements.current.set(note.id, el) : elements.current.delete(note.id))}
                onHover={(on) => setHovered((current) => (on ? note.id : current === note.id ? null : current))}
                onDragging={setDragging}
                onChange={props.onChange}
                onRaise={() => props.onRaise(note.id)}
                onClose={() => {
                  setHovered(null);
                  props.onClose(note.id);
                }}
                onComment={(text) => props.onComment(note.id, text)}
                onLocate={() => props.onLocate(note.id)}
                onRemoveComment={() => props.onRemoveComment(note.id)}
                onHighlight={props.onHighlight && ((color) => props.onHighlight!(note.id, color))}
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
  onDragging: (active: boolean) => void;
  note: NoteLayout;
  /** The passage's top-left on the paper. */
  anchor: { x: number; y: number };
  /** The paper's scrollable size: notes stay inside it. */
  bounds: { left: number; width: number; height: number };
  /** The PDF's own bounds; the room beside it scales with them. */
  paper: PaperBounds;
  container: HTMLElement;
  scale: number;
  uiScale: number;
  canvas: { inset: number; readInset: () => number };
  annotation: AnnotationView;
  register: (element: HTMLElement | null) => void;
  onHover: (on: boolean) => void;
  onChange: (note: NoteLayout) => void;
  onRaise: () => void;
  onClose: () => void;
  onComment: (text: string) => void;
  onLocate: () => void;
  onRemoveComment: () => void;
  onHighlight?: (color: HighlightColor | null) => void;
}

function CommentNote({ onDragging, note, anchor, bounds, paper, container, scale, uiScale, canvas, annotation, register, onHover, onChange, onRaise, onClose, onComment, onLocate, onRemoveComment, onHighlight }: CommentNoteProps) {
  const [colors, setColors] = useState<{ x: number; y: number } | null>(null);
  const lit = annotation.kind === 'highlight' && annotation.highlighted !== false;
  const [draft, setDraft] = useState(annotation.note ?? '');
  const gesture = useRef<{ kind:'move'|'resize'; pointerId:number; target:HTMLElement; x:number;y:number;px:number;py:number;scrollX:number;scrollY:number;inset:number;width:number;height:number;startLeft:number;start:NoteLayout;moved:boolean }|null>(null);
  const element = useRef<HTMLElement | null>(null);
  const frame = useRef(0);
  const current = useRef({note,anchor,bounds,paper,scale,uiScale,onChange});
  current.current = {note,anchor,bounds,paper,scale,uiScale,onChange};


  // Take outside changes (e.g. edited in the annotation list) unless typing here.
  useEffect(() => {
    setDraft(annotation.note ?? '');
  }, [annotation.note]);

  const renderedWidth = element.current?.getBoundingClientRect().width ?? note.width * scale * uiScale;
  const left = floatingLeft(paper, anchor.x + note.dx * scale, renderedWidth) + canvas.inset;
  const top = anchor.y + note.dy * scale;
  const width = note.collapsed ? undefined : note.width * uiScale;
  const height = (note.collapsed ? PILL_HEIGHT : note.height) * uiScale;

  const finish = (expand = false) => {
    const g=gesture.current; gesture.current=null; if(g)onDragging(false); cancelAnimationFrame(frame.current);
    if(g?.target.hasPointerCapture(g.pointerId))g.target.releasePointerCapture(g.pointerId);
    if(expand && g?.moved && g.kind==='move') {
      const {note,anchor,scale,uiScale}=current.current;
      const left=floatingLeft(current.current.paper,anchor.x+note.dx*scale,g.width)+canvas.readInset(), right=left+(element.current?.getBoundingClientRect().width??note.width*scale*uiScale);
      if(right>container.scrollLeft+container.clientWidth-16)container.scrollLeft=right-container.clientWidth+16;
      else if(left<container.scrollLeft+16)container.scrollLeft=Math.max(0,left-16);
    }
    if(expand && g && !g.moved && g.kind==='move' && current.current.note.collapsed)
      current.current.onChange({...current.current.note,collapsed:false});
  };
  useEffect(()=>{
    const stop=()=>finish();
    const up=(event:PointerEvent)=>{if(event.pointerId===gesture.current?.pointerId)finish(event.type==='pointerup');};
    window.addEventListener('pointerup',up);window.addEventListener('pointercancel',up);window.addEventListener('blur',stop);
    return ()=>{stop();window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',up);window.removeEventListener('blur',stop);};
  },[container,scale,uiScale]);
  const updateGesture = () => {
    const g=gesture.current;if(!g)return;
    const {anchor,bounds,paper,scale,uiScale,note:latest,onChange}=current.current;
    const dx=g.px-g.x+container.scrollLeft-g.scrollX-(canvas.readInset()-g.inset), dy=g.py-g.y+container.scrollTop-g.scrollY;
    if(Math.abs(dx)+Math.abs(dy)>3)g.moved=true;
    if(!g.moved)return;
    if(g.kind==='move')onChange({...latest,
      dx:(clamp(g.startLeft+dx,bounds.left+12-floatingMargin(paper,g.width),bounds.width+floatingMargin(paper,g.width)-g.width)-anchor.x)/scale,
      dy:(clamp(anchor.y+g.start.dy*scale+dy,0,bounds.height-g.height)-anchor.y)/scale,
    });
    else onChange({...latest,width:clamp(g.start.width+dx/scale/uiScale,NOTE_SIZE.minWidth,NOTE_SIZE.maxWidth),height:clamp(g.start.height+dy/scale/uiScale,NOTE_SIZE.minHeight,NOTE_SIZE.maxHeight)});
  };
  const pan = () => {
    const g=gesture.current;if(!g)return;
    if(g.kind==='move' && g.moved){
      const box=container.getBoundingClientRect();
      const speed=(p:number,start:number,end:number)=>p>end-40?Math.min(18,(p-end+40)/4):p<start+40?-Math.min(18,(start+40-p)/4):0;
      container.scrollLeft+=speed(g.px,box.left,box.right);
      container.scrollTop+=speed(g.py,box.top,box.bottom);
      updateGesture();
    }
    frame.current=requestAnimationFrame(pan);
  };
  const begin = (kind:'move'|'resize') => (event:ReactPointerEvent<HTMLElement>) => {
    if(event.button!==0 || !event.isPrimary || (kind==='move' && (event.target as HTMLElement).closest('button, textarea')))return;
    event.preventDefault();event.stopPropagation();finish();
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current={kind,pointerId:event.pointerId,target:event.currentTarget,x:event.clientX,y:event.clientY,px:event.clientX,py:event.clientY,scrollX:container.scrollLeft,scrollY:container.scrollTop,inset:canvas.readInset(),width:element.current?.getBoundingClientRect().width??note.width*scale*uiScale,height:element.current?.getBoundingClientRect().height??note.height*scale*uiScale,startLeft:left-canvas.readInset(),start:note,moved:false};
    onDragging(true);onRaise();frame.current=requestAnimationFrame(pan);
  };
  const move = (event:ReactPointerEvent<HTMLElement>) => {
    const g=gesture.current;if(!g || g.pointerId!==event.pointerId)return;
    if(!(event.buttons&1)){finish();return;}
    g.px=event.clientX;g.py=event.clientY;updateGesture();
  };
  const end = (event:ReactPointerEvent<HTMLElement>) => {if(event.pointerId===gesture.current?.pointerId)finish(event.type==='pointerup');};
  const drag={onPointerDown:begin('move'),onPointerMove:move,onPointerUp:end,onPointerCancel:end,onLostPointerCapture:()=>finish()};
  const title = noteTitle({ ...annotation, note: draft });

  return (
    <section
      ref={el => { element.current=el;register(el); }}
      className={note.collapsed ? 'pp-glass pp-note pp-note--pill' : 'pp-glass pp-note'}
      data-tone="float"
      aria-label={`旁注：${title}`}
      style={{ left, top, width, height, zIndex: note.z, transform:`scale(${scale})`, transformOrigin:'top left' }}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
      onFocus={(event) => onHover(keyboardFocus(event.target))}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onHover(false);
      }}
      onPointerDown={onRaise}
    >
      {note.collapsed ? (
        <div className="pp-note__pill" {...drag}>
          <Icon name="comment" size={15} className="pp-note__pill-icon" />
          <span className="pp-note__pill-title">{title}</span>
          <IconButton icon="openExternal" label="展开旁注" size="md" shape="pill" onClick={() => onChange({ ...note, collapsed: false })} />
        </div>
      ) : (
        <>
          <header className="pp-note__head" {...drag}>
            {onHighlight && annotation.kind === 'highlight' ? (
              <button
                type="button"
                className="pp-note__dot pp-note__dot--button"
                style={dot(annotation.color)}
                data-empty={!lit || undefined}
                aria-label={lit ? '改变或取消高亮' : '加上高亮'}
                title={lit ? '改变或取消高亮' : '加上高亮'}
                onClick={(event) => {
                  const box = event.currentTarget.getBoundingClientRect();
                  setColors({ x: box.left, y: box.bottom + 4 });
                }}
              />
            ) : (
              <span className="pp-note__dot" style={dot(annotation.color)} data-empty={!lit || undefined} aria-hidden="true" />
            )}
            <span className="pp-note__quote" title={annotation.quote}>
              {annotation.quote ?? `第 ${annotation.pageIndex + 1} 页的旁注`}
            </span>
            <IconButton icon="region" label="定位到原文" size="md" shape="pill" onClick={onLocate} />
            <IconButton
              icon="minus"
              label="收起"
              size="md"
              shape="pill"
              onClick={() => onChange({ ...note, collapsed: true })}
            />
            {annotation.note && <IconButton icon="trash" label={lit ? '删除旁注（高亮保留）' : '删除旁注'} size="md" shape="pill" onClick={onRemoveComment} />}
            <IconButton
              icon="close"
              label="关闭旁注"
              size="md"
              shape="pill"
              onClick={onClose}
            />
          </header>
          <MarkdownEditor storageKey={'comment:'+note.id} compact label="旁注（第一行作为标题）" placeholder="第一行是标题，然后写下你的想法…" value={draft}
            onChange={value=>{setDraft(value);onComment(value);}} onEscape={()=>onChange({...note,collapsed:true})}/>
          <span className="pp-note__resize" aria-hidden="true" onPointerDown={begin('resize')} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={()=>finish()} />
          {colors && onHighlight && (
            <Menu
              label="高亮颜色"
              anchor={colors}
              entries={[
                ...highlightColors.map((c) => ({ id: c, label: colorNames[c], checked: lit && annotation.color === c })),
                ...(lit ? [{ kind: 'separator' as const, id: 'sep' }, { id: 'none', label: '取消高亮' }] : []),
              ]}
              onSelect={(id) => onHighlight(id === 'none' ? null : (id as HighlightColor))}
              onClose={() => setColors(null)}
            />
          )}
        </>
      )}
    </section>
  );
}
