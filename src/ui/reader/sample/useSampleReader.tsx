import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { toast, type HighlightColor } from '@/ui/components';
import type { PageRect } from '../LocateFlash';
import type { AnnotationView, ReaderInteraction, ReaderMenuTarget, ReaderTool, ViewRect } from '../types';

// 示例接线：替代真实运行时的演示版本，按 ReaderInteraction 驱动阅读器外壳。
// 选区捕获、自动高亮、点中已有高亮的判断都在这里；新建的高亮画成页面上的覆盖层，
// 和 PDF.js 自己画高亮层的方式一样。只在当前页面有效，刷新即恢复。

/** A drawn highlight: its page, and line boxes in units of the page width, so it stays put when zooming. */
interface Overlay {
  page: HTMLElement;
  rects: PageRect[];
}

const toView = (r: DOMRect): ViewRect => ({ left: r.left, top: r.top, width: r.width, height: r.height });
const inside = (r: ViewRect, x: number, y: number) => x >= r.left && x <= r.left + r.width && y >= r.top && y <= r.top + r.height;

/** The demo reader: annotations, the interaction object for ReaderShell, and the highlights it draws. */
export function useSampleReader(initial: readonly AnnotationView[]) {
  const [annotations, setAnnotations] = useState<AnnotationView[]>([...initial]);
  const [menuTarget, setMenuTarget] = useState<ReaderMenuTarget | null>(null);
  const [tool, setTool] = useState<ReaderTool>('select');
  const [overlays, setOverlays] = useState<ReadonlyMap<string, Overlay>>(new Map());
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const lastColor = useRef<HighlightColor>('yellow');
  const ranges = useRef(new Map<string, { range: Range; text: string }>());
  const deleted = useRef(new Map<string, { item: AnnotationView; index: number }>());
  const counter = useRef(0);
  // Read inside listeners without re-subscribing.
  const latest = useRef({ annotations, overlays, tool });
  latest.current = { annotations, overlays, tool };

  const annotationRects = useCallback((id: string): ViewRect[] | null => {
    const mark = container?.querySelector<HTMLElement>(`mark[data-annotation-id="${CSS.escape(id)}"]`);
    if (mark) return Array.from(mark.getClientRects()).map(toView);
    const overlay = latest.current.overlays.get(id);
    if (!overlay || !overlay.page.isConnected) return null;
    const box = overlay.page.getBoundingClientRect();
    const w = box.width;
    return overlay.rects.map((r) => ({ left: box.left + r.left * w, top: box.top + r.top * w, width: r.width * w, height: r.height * w }));
  }, [container]);

  /** Turns a captured selection into a highlight drawn over its page. */
  const highlight = useCallback((selectionId: string, color: HighlightColor = lastColor.current): string | null => {
    const captured = ranges.current.get(selectionId);
    const page = captured?.range.startContainer.parentElement?.closest<HTMLElement>('[data-page-index]');
    if (!captured || !page) return null;
    const box = page.getBoundingClientRect();
    const w = box.width;
    const rects = Array.from(captured.range.getClientRects())
      .filter((r) => r.width > 1)
      .map((r) => ({ left: (r.left - box.left) / w, top: (r.top - box.top) / w, width: r.width / w, height: r.height / w }));
    const id = `demo-${++counter.current}`;
    lastColor.current = color;
    setOverlays((current) => new Map(current).set(id, { page, rects }));
    setAnnotations((current) => [...current, { id, kind: 'highlight', color, pageIndex: Number(page.dataset.pageIndex), quote: captured.text }]);
    ranges.current.delete(selectionId);
    window.getSelection()?.removeAllRanges();
    return id;
  }, []);

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
    }),
    [menuTarget, tool, highlight, annotationRects],
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
