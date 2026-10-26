import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { toast, type HighlightColor } from '@/ui/components';
import type { PageRect } from '../LocateFlash';
import type {
  AnnotationView,
  NoteLayout,
  ReaderInteraction,
  ReaderMenuTarget,
  ReaderSearchState,
  ReaderTool,
  Rotation,
  ViewRect,
} from '../types';
import { pageToView, viewToPage } from './pageFrame';

// 示例接线：替代真实运行时的演示版本，按 ReaderInteraction 驱动阅读器外壳。
// 选区捕获、自动高亮、点中已有高亮的判断都在这里；新建的高亮画成页面上的覆盖层，
// 和 PDF.js 自己画高亮层的方式一样。页面旋转、查找、评论便签的位置也在这里。
// 只在当前页面有效，刷新即恢复。

/** A drawn highlight: its page, and line boxes in the unturned page in units of its width, so it stays put when zooming or rotating. */
interface Overlay {
  page: HTMLElement;
  rects: PageRect[];
}

const toView = (r: DOMRect): ViewRect => ({ left: r.left, top: r.top, width: r.width, height: r.height });
const inside = (r: ViewRect, x: number, y: number) => x >= r.left && x <= r.left + r.width && y >= r.top && y <= r.top + r.height;
const scaled = (r: ViewRect, by: number): ViewRect => ({ left: r.left * by, top: r.top * by, width: r.width * by, height: r.height * by });

const idleSearch: ReaderSearchState = { query: '', matchCase: false, wholeWord: false, status: 'idle', total: 0, current: 0 };

/** Every match of the query in the pages' text, as DOM ranges. Text in different blocks is never joined into one match. */
function findAll(container: HTMLElement, query: string, matchCase: boolean, wholeWord: boolean): Range[] {
  if (!query.trim()) return [];
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(wholeWord ? `(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])` : escaped, matchCase ? 'gu' : 'giu');
  const ranges: Range[] = [];
  for (const page of Array.from(container.querySelectorAll<HTMLElement>('[data-page-index]'))) {
    const walker = document.createTreeWalker(page, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => (node.parentElement?.closest('[data-pp-overlay], [aria-hidden="true"]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    // The page's text, with each text node's start in it; blocks are kept apart by a line break.
    let text = '';
    const starts: { node: Text; at: number }[] = [];
    let block: Element | null = null;
    for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
      const owner = node.parentElement?.closest('p, h1, h2, h3, li, figcaption') ?? null;
      if (block && owner !== block) text += '\n';
      block = owner;
      starts.push({ node, at: text.length });
      text += node.data;
    }
    const locate = (offset: number, end: boolean) => {
      // The last text node starting at or before the offset (for an end, strictly before it).
      let found = starts[0]!;
      for (const start of starts) if (end ? start.at < offset : start.at <= offset) found = start;
      return { node: found.node, offset: offset - found.at };
    };
    for (const match of text.matchAll(pattern)) {
      if (!match[0]) continue;
      const start = locate(match.index, false);
      const end = locate(match.index + match[0].length, true);
      const range = document.createRange();
      range.setStart(start.node, start.offset);
      range.setEnd(end.node, end.offset);
      ranges.push(range);
    }
  }
  return ranges;
}

/** Marks the matches with the CSS highlight registry; the current one on top. */
function paintMatches(ranges: readonly Range[], current: number) {
  if (!('highlights' in CSS)) return;
  CSS.highlights.delete('pp-find');
  CSS.highlights.delete('pp-find-current');
  if (ranges.length === 0) return;
  CSS.highlights.set('pp-find', new Highlight(...ranges));
  const selected = ranges[current - 1];
  if (selected) {
    const highlight = new Highlight(selected);
    highlight.priority = 1;
    CSS.highlights.set('pp-find-current', highlight);
  }
}

/** The demo reader: annotations, the interaction object for ReaderShell, and the highlights it draws. */
export function useSampleReader(initial: readonly AnnotationView[]) {
  const [annotations, setAnnotations] = useState<AnnotationView[]>([...initial]);
  const [menuTarget, setMenuTarget] = useState<ReaderMenuTarget | null>(null);
  const [tool, setTool] = useState<ReaderTool>('select');
  const [overlays, setOverlays] = useState<ReadonlyMap<string, Overlay>>(new Map());
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [rotation, setRotation] = useState<Rotation>(0);
  const [search, setSearch] = useState<ReaderSearchState>(idleSearch);
  const matches = useRef<Range[]>([]);
  const searchRef = useRef(search);
  searchRef.current = search;
  const [noteLayouts, setNoteLayouts] = useState<NoteLayout[]>([]);
  const lastColor = useRef<HighlightColor>('yellow');
  const ranges = useRef(new Map<string, { range: Range; text: string }>());
  const deleted = useRef(new Map<string, { item: AnnotationView; index: number }>());
  const counter = useRef(0);
  const geometryListeners = useRef(new Set<() => void>());
  // Read inside listeners without re-subscribing.
  const latest = useRef({ annotations, overlays, tool });
  latest.current = { annotations, overlays, tool };

  const annotationRects = useCallback((id: string): ViewRect[] | null => {
    const mark = container?.querySelector<HTMLElement>(`mark[data-annotation-id="${CSS.escape(id)}"]`);
    if (mark) return Array.from(mark.getClientRects()).map(toView);
    const overlay = latest.current.overlays.get(id);
    if (!overlay || !overlay.page.isConnected) return null;
    const w = overlay.page.offsetWidth;
    return overlay.rects.map((r) => pageToView(overlay.page, scaled(r, w)));
  }, [container]);

  /** Turns a captured selection into a highlight drawn over its page. */
  const highlight = useCallback((selectionId: string, color: HighlightColor = lastColor.current): string | null => {
    const captured = ranges.current.get(selectionId);
    const page = captured?.range.startContainer.parentElement?.closest<HTMLElement>('[data-page-index]');
    if (!captured || !page) return null;
    const w = page.offsetWidth;
    const rects = Array.from(captured.range.getClientRects())
      .filter((r) => r.width > 1 && r.height > 1)
      .map((r) => scaled(viewToPage(page, r), 1 / w));
    const id = `demo-${++counter.current}`;
    lastColor.current = color;
    setOverlays((current) => new Map(current).set(id, { page, rects }));
    setAnnotations((current) => [...current, { id, kind: 'highlight', color, pageIndex: Number(page.dataset.pageIndex), quote: captured.text }]);
    ranges.current.delete(selectionId);
    window.getSelection()?.removeAllRanges();
    return id;
  }, []);

  // Positions change when pages resize (zoom, relayout): tell the subscribers, as a
  // real runtime does when PDF pages finish rendering.
  const subscribeGeometry = useCallback((listener: () => void) => {
    geometryListeners.current.add(listener);
    return () => {
      geometryListeners.current.delete(listener);
    };
  }, []);
  useEffect(() => {
    if (!container) return;
    const observer = new ResizeObserver(() => geometryListeners.current.forEach((listener) => listener()));
    container.querySelectorAll('[data-page-index]').forEach((page) => observer.observe(page));
    return () => observer.disconnect();
  }, [container]);

  // Capture selections and hit-test clicks in the scroll container the shell hands over.
  useEffect(() => {
    if (!container) return;
    const onPointerUp = (event: MouseEvent) => {
      // Notes and other overlays inside the paper are not part of the text.
      if ((event.target as Element | null)?.closest?.('[data-pp-overlay]')) return;
      // Let the selection settle first.
      window.setTimeout(() => {
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed && selection.rangeCount) {
          const range = selection.getRangeAt(0);
          const text = selection.toString().trim();
          if (!text || !container.contains(range.commonAncestorContainer)) return;
          const id = `sel-${++counter.current}`;
          ranges.current.set(id, { range: range.cloneRange(), text });
          const rects = Array.from(range.getClientRects()).filter((r) => r.width > 1).map(toView);
          if (latest.current.tool === 'auto-highlight') {
            const annotationId = highlight(id);
            if (annotationId) setMenuTarget({ kind: 'annotation', annotationId, rects });
          } else {
            setMenuTarget({ kind: 'selection', id, text, rects });
          }
          return;
        }
        // A click: is it on a highlight?
        const markId = (event.target as Element | null)?.closest?.('mark[data-annotation-id]')?.getAttribute('data-annotation-id');
        const hit =
          markId ??
          [...latest.current.overlays.keys()].find((id) => annotationRects(id)?.some((r) => inside(r, event.clientX, event.clientY)));
        if (hit) setMenuTarget({ kind: 'annotation', annotationId: hit, rects: annotationRects(hit) ?? [] });
      }, 0);
    };
    container.addEventListener('mouseup', onPointerUp);
    return () => container.removeEventListener('mouseup', onPointerUp);
  }, [container, highlight, annotationRects]);

  // ---- Find ------------------------------------------------------------------
  /** Brings a match into view, about a third of the way down, unless it is already comfortably visible. */
  const reveal = useCallback(
    (range: Range | undefined) => {
      if (!container || !range) return;
      const box = range.getBoundingClientRect();
      const view = container.getBoundingClientRect();
      if (box.top >= view.top + 80 && box.bottom <= view.bottom - 60 && box.left >= view.left && box.right <= view.right) return;
      container.scrollTo({
        top: container.scrollTop + box.top - view.top - container.clientHeight * 0.35,
        left: container.scrollLeft + box.left - view.left - container.clientWidth / 2,
        behavior: 'smooth',
      });
    },
    [container],
  );

  const runSearch = useCallback(
    (query: string, options: { matchCase: boolean; wholeWord: boolean }, keepCurrent = false) => {
      if (!container) return;
      const ranges = findAll(container, query, options.matchCase, options.wholeWord);
      matches.current = ranges;
      let current = 0;
      if (ranges.length > 0) {
        if (keepCurrent) current = Math.min(Math.max(searchRef.current.current, 1), ranges.length);
        else {
          // Start from the first match below the top of the visible paper, like the browser does.
          const top = container.getBoundingClientRect().top + 60;
          current = ranges.findIndex((r) => r.getBoundingClientRect().bottom >= top) + 1 || 1;
        }
      }
      paintMatches(ranges, current);
      if (!keepCurrent) reveal(ranges[current - 1]);
      setSearch({ query, ...options, status: query.trim() ? 'done' : 'idle', total: ranges.length, current });
    },
    [container, reveal],
  );

  // The paper's text changes when built-in highlights are recoloured or removed: search it again in place.
  const searchOpen = search.status !== 'idle';
  useEffect(() => {
    const { query, matchCase, wholeWord } = searchRef.current;
    if (searchOpen && query) runSearch(query, { matchCase, wholeWord }, true);
  }, [annotations, searchOpen, runSearch]);

  // Clear the marks when the reader goes away.
  useEffect(() => () => paintMatches([], 0), []);

  // ---- Rotation ---------------------------------------------------------------
  /** Turns the pages and keeps the page that was at the top of the view there. */
  const rotate = useCallback(
    (next: Rotation) => {
      if (!container) {
        setRotation(next);
        return;
      }
      const view = container.getBoundingClientRect();
      const pages = Array.from(container.querySelectorAll<HTMLElement>('[data-page-index]'));
      const anchor = pages.find((page) => page.getBoundingClientRect().bottom > view.top + 80) ?? pages[0];
      setRotation(next);
      requestAnimationFrame(() => {
        if (!anchor) return;
        const box = anchor.getBoundingClientRect();
        container.scrollTop += box.top - view.top - 70;
        const centred = container.scrollLeft + box.left + box.width / 2 - view.left - container.clientWidth / 2;
        container.scrollLeft = Math.max(0, centred);
        geometryListeners.current.forEach((listener) => listener());
      });
    },
    [container],
  );

  const interaction = useMemo<ReaderInteraction>(
    () => ({
      onScrollContainer: setContainer,
      menuTarget,
      onDismissMenu: () => setMenuTarget(null),
      tool,
      onToolChange: (next) => {
        setTool(next);
        toast.show({ message: next === 'auto-highlight' ? '自动高亮已打开：选中文字就会用上次的颜色高亮' : '自动高亮已关闭' });
      },
      onCreateHighlight: async (selectionId, color) => highlight(selectionId, color),
      onSelectionAction: (selectionId, action) => {
        const text = ranges.current.get(selectionId)?.text ?? '';
        if (action === 'copy') void navigator.clipboard?.writeText(text).then(() => toast.show({ message: '已复制' }));
        else toast.show({ message: `示例：${{ translate: '翻译', explain: '解释', ask: '提问' }[action] ?? action}「${text.slice(0, 24)}…」` });
      },
      onAnnotationAction: (id, action) => {
        const quote = latest.current.annotations.find((a) => a.id === id)?.quote ?? '';
        toast.show({ message: `示例：${{ translate: '翻译', explain: '解释', ask: '提问' }[action] ?? action}「${quote.slice(0, 24)}…」` });
      },
      onAnnotationColor: (id, color) => {
        lastColor.current = color;
        setAnnotations((current) => current.map((a) => (a.id === id ? { ...a, color } : a)));
      },
      onAnnotationComment: (id, comment) => setAnnotations((current) => current.map((a) => (a.id === id ? { ...a, note: comment || undefined } : a))),
      onAnnotationDelete: (id) =>
        setAnnotations((current) => {
          const index = current.findIndex((a) => a.id === id);
          if (index >= 0) deleted.current.set(id, { item: current[index]!, index });
          return current.filter((a) => a.id !== id);
        }),
      onAnnotationRestore: (id) => {
        const entry = deleted.current.get(id);
        if (!entry) return;
        deleted.current.delete(id);
        setAnnotations((current) => {
          const next = [...current];
          next.splice(Math.min(entry.index, next.length), 0, entry.item);
          return next;
        });
      },
      annotationRects,
      subscribeGeometry,
      rotation,
      onRotate: rotate,
      search,
      onSearch: (query, options) => runSearch(query, options),
      onSearchStep: (direction) => {
        const total = matches.current.length;
        if (total === 0) return;
        const current = ((searchRef.current.current - 1 + direction + total) % total) + 1;
        paintMatches(matches.current, current);
        reveal(matches.current[current - 1]);
        setSearch((previous) => ({ ...previous, current }));
      },
      onSearchClose: () => {
        matches.current = [];
        paintMatches([], 0);
        setSearch((previous) => ({ ...previous, status: 'idle', total: 0, current: 0 }));
      },
      noteLayouts,
      onNoteLayouts: setNoteLayouts,
    }),
    [menuTarget, tool, highlight, annotationRects, subscribeGeometry, rotation, rotate, search, runSearch, reveal, noteLayouts],
  );

  // Built-in highlights on the sample paper follow the annotations' colours, or vanish when deleted.
  const paperHighlights = useMemo(() => Object.fromEntries(annotations.filter((a) => a.id.startsWith('a')).map((a) => [a.id, a.color])), [annotations]);

  // New highlights: drawn into their page, like a PDF highlight layer.
  const overlayLayer = [...overlays.entries()].map(([id, overlay]) => {
    const annotation = annotations.find((a) => a.id === id);
    if (!annotation) return null;
    return createPortal(
      <>
        {overlay.rects.map((r, i) => (
          <span
            key={i}
            className="pp-sample-hl"
            aria-hidden="true"
            style={
              {
                left: `calc(var(--pp-sample-width) * ${r.left})`,
                top: `calc(var(--pp-sample-width) * ${r.top})`,
                width: `calc(var(--pp-sample-width) * ${r.width})`,
                height: `calc(var(--pp-sample-width) * ${r.height})`,
                '--pp-hl': `var(--pp-hl-${annotation.color}-fill)`,
              } as CSSProperties
            }
          />
        ))}
      </>,
      overlay.page,
      id,
    );
  });

  return { annotations, interaction, paperHighlights, overlayLayer };
}
