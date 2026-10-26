import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TranslationPane } from '../translation/TranslationPane';
import type { TranslationMode, TranslationPageView, TranslationSentenceView } from '../translation/types';
import { findQuote } from './findQuote';
import { sampleSentences } from './sampleTranslation';

// 示例接线：译文栏的演示运行时。第 1 页已有译文，第 2 页点"翻译这一页"后逐字出现。
// 论文与译文的逐句联动用示例论文里的文字定位：悬停两边同时标出，点击跳到另一边，跟随阅读时译文对齐论文。

const PAGES = [0, 1];
const STREAM_STEP = 3;
const STREAM_MS = 28;

const scroller = () => document.querySelector<HTMLElement>('.pp-reader__paper');

export function useSampleTranslation(onLocateQuote: (quote: string) => void) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<TranslationMode>('translation');
  const [follow, setFollow] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [reveal, setReveal] = useState<{ id: string; key: number; smooth: boolean; flash: boolean } | null>(null);
  // How far each page's translation has arrived: characters shown, by sentence id.
  const [shown, setShown] = useState<Record<string, number>>(() =>
    Object.fromEntries(sampleSentences.filter((s) => s.pageIndex === 0).map((s) => [s.id, s.text.length])),
  );
  const [translating, setTranslating] = useState<number | null>(null);

  const pages = useMemo<TranslationPageView[]>(
    () =>
      PAGES.map((pageIndex) => {
        const all = sampleSentences.filter((s) => s.pageIndex === pageIndex);
        const sentences: TranslationSentenceView[] = all
          .filter((s) => (shown[s.id] ?? 0) > 0)
          .map((s) => ({ ...s, text: s.text.slice(0, shown[s.id]), streaming: translating === pageIndex && shown[s.id]! < s.text.length }));
        const done = all.every((s) => shown[s.id] === s.text.length);
        return { pageIndex, state: done ? 'done' : translating === pageIndex ? 'translating' : 'untranslated', sentences };
      }),
    [shown, translating],
  );

  // Simulated streaming: one sentence after another, a few characters at a time.
  useEffect(() => {
    if (translating === null) return;
    const timer = window.setInterval(() => {
      setShown((current) => {
        const next = sampleSentences.find((s) => s.pageIndex === translating && (current[s.id] ?? -1) < s.text.length);
        if (!next) {
          setTranslating(null);
          return current;
        }
        return { ...current, [next.id]: Math.min(next.text.length, (current[next.id] ?? 0) + STREAM_STEP) };
      });
    }, STREAM_MS);
    return () => window.clearInterval(timer);
  }, [translating]);

  // Where each translated sentence is in the paper, found from its original text.
  const ranges = useRef(new Map<string, Range>());
  const rangeOf = useCallback((id: string) => {
    const cached = ranges.current.get(id);
    if (cached && cached.startContainer.isConnected && !cached.collapsed) return cached;
    const container = scroller();
    const sentence = sampleSentences.find((s) => s.id === id);
    const found = container && sentence ? findQuote(container, sentence.source) : null;
    if (found) ranges.current.set(id, found.range);
    return found?.range ?? null;
  }, []);
  const available = useMemo(() => sampleSentences.filter((s) => (shown[s.id] ?? 0) > 0), [shown]);

  // The lit sentence, drawn in the paper with the CSS highlight registry.
  useEffect(() => {
    if (!('highlights' in CSS)) return;
    const range = open && activeId ? rangeOf(activeId) : null;
    if (range) CSS.highlights.set('pp-trans', new Highlight(range));
    else CSS.highlights.delete('pp-trans');
  }, [activeId, open, rangeOf]);

  // In the paper: hovering a sentence lights up its translation; clicking brings the translation to it.
  useEffect(() => {
    const container = scroller();
    if (!open || !container) return;
    const hit = (x: number, y: number) =>
      available.find((s) => Array.from(rangeOf(s.id)?.getClientRects() ?? []).some((r) => x >= r.left && x <= r.right && y >= r.top - 1 && y <= r.bottom + 1))?.id ?? null;
    let frame = 0;
    const onMove = (event: PointerEvent) => {
      if ((event.target as Element).closest?.('[data-pp-overlay]')) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setActiveId(hit(event.clientX, event.clientY)));
    };
    const onLeave = () => setActiveId(null);
    const onClick = (event: MouseEvent) => {
      if (!window.getSelection()?.isCollapsed) return;
      const id = hit(event.clientX, event.clientY);
      if (id) setReveal({ id, key: Date.now(), smooth: false, flash: true });
    };
    container.addEventListener('pointermove', onMove);
    container.addEventListener('pointerleave', onLeave);
    container.addEventListener('click', onClick);
    return () => {
      cancelAnimationFrame(frame);
      container.removeEventListener('pointermove', onMove);
      container.removeEventListener('pointerleave', onLeave);
      container.removeEventListener('click', onClick);
    };
  }, [open, available, rangeOf]);

  // Follow the reading: the translation lines up with the first sentence near the top of the paper view.
  useEffect(() => {
    const container = scroller();
    if (!open || !follow || !container) return;
    let frame = 0;
    let last: string | null = null;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const line = container.getBoundingClientRect().top + 140;
        const current = available.find((s) => {
          const rects = rangeOf(s.id)?.getClientRects();
          return rects && rects.length > 0 && rects[rects.length - 1]!.bottom > line;
        });
        if (current && current.id !== last) {
          last = current.id;
          setReveal({ id: current.id, key: Date.now(), smooth: true, flash: false });
        }
      });
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      container.removeEventListener('scroll', onScroll);
    };
  }, [open, follow, available, rangeOf]);

  // Closing clears the mark in the paper.
  useEffect(
    () => () => {
      CSS.highlights?.delete('pp-trans');
    },
    [],
  );

  return {
    open,
    onToggle: () => setOpen((value) => !value),
    pane: (
      <TranslationPane
        pages={pages}
        mode={mode}
        onMode={setMode}
        follow={follow}
        onFollow={setFollow}
        onClose={() => setOpen(false)}
        activeId={activeId}
        onHover={setActiveId}
        onLocate={(id) => {
          const sentence = sampleSentences.find((s) => s.id === id);
          if (sentence) onLocateQuote(sentence.source);
        }}
        onTranslatePage={(pageIndex) => {
          if (translating !== null) return;
          setShown((current) => ({ ...current, ...Object.fromEntries(sampleSentences.filter((s) => s.pageIndex === pageIndex).map((s) => [s.id, 0])) }));
          setTranslating(pageIndex);
        }}
        reveal={reveal}
      />
    ),
  };
}
