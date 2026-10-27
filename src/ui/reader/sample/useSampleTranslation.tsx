import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TranslationPane } from '../translation/TranslationPane';
import type { TranslationMode, TranslationPageView, TranslationSentenceState, TranslationSentenceView, TranslationTaskView } from '../translation/types';
import { findQuote } from './findQuote';
import { sampleSentences } from './sampleTranslation';

// 示例接线：译文栏的演示运行时。第 1 页已有译文，第 2 页点"翻译这一页"后逐字出现。
// 论文与译文的逐句联动用示例论文里的文字定位：悬停两边同时标出，点击跳到另一边，跟随阅读时译文对齐论文。

const PAGES = [0, 1];
const STREAM_STEP = 3;
const STREAM_MS = 28;

/** "Blocks are built bottom-up." fails once, to show a failed sentence and its retry. */
const FAILING_ID = 's27';

type Progress = { state: TranslationSentenceState; chars: number };

const scroller = () => document.querySelector<HTMLElement>('.pp-reader__paper');

export function useSampleTranslation(onLocateQuote: (quote: string) => void) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<TranslationMode>('translation');
  const [follow, setFollow] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [reveal, setReveal] = useState<{ id: string; key: number; smooth: boolean; flash: boolean } | null>(null);
  // Each sentence's translation so far, and the task that produces them.
  const [status, setStatus] = useState<Record<string, Progress>>(() =>
    Object.fromEntries(sampleSentences.filter((s) => s.pageIndex === 0).map((s) => [s.id, { state: 'done', chars: s.text.length }])),
  );
  const [task, setTask] = useState<{ phase: TranslationTaskView['phase']; queue: number[] }>({ phase: 'idle', queue: [] });
  // The demo's one failing request, until it is retried.
  const failOnce = useRef(new Set([FAILING_ID]));

  const pages = useMemo<TranslationPageView[]>(
    () =>
      PAGES.map((pageIndex) => {
        const all = sampleSentences.filter((s) => s.pageIndex === pageIndex);
        const started = all.some((s) => status[s.id]);
        const sentences: TranslationSentenceView[] = started
          ? all.map((s) => {
              const p = status[s.id] ?? { state: 'pending', chars: 0 };
              return { ...s, text: s.text.slice(0, p.chars), state: p.state };
            })
          : [];
        const state: TranslationPageView['state'] = !started
          ? 'untranslated'
          : sentences.every((x) => x.state === 'done')
            ? 'done'
            : task.queue.includes(pageIndex) && (task.phase === 'running' || task.phase === 'pausing')
              ? 'translating'
              : 'partial';
        return { pageIndex, state, sentences };
      }),
    [status, task],
  );

  // Simulated streaming: one sentence after another, a few characters at a time.
  useEffect(() => {
    if (task.phase !== 'running') return;
    const timer = window.setInterval(() => {
      setStatus((current) => {
        const next = sampleSentences.find((s) => task.queue.includes(s.pageIndex) && ['pending', 'streaming', 'partial'].includes(current[s.id]?.state ?? 'pending'));
        if (!next) {
          setTask({ phase: 'completed', queue: [] });
          return current;
        }
        const now = current[next.id] ?? { state: 'pending', chars: 0 };
        if (failOnce.current.has(next.id) && now.chars >= 6) return { ...current, [next.id]: { state: 'failed', chars: 0 } };
        const chars = Math.min(next.text.length, now.chars + STREAM_STEP);
        return { ...current, [next.id]: { state: chars === next.text.length ? 'done' : 'streaming', chars } };
      });
    }, STREAM_MS);
    return () => window.clearInterval(timer);
  }, [task]);

  const start = (pageIndexes: number[]) => {
    setStatus((current) => {
      const next = { ...current };
      for (const s of sampleSentences) if (pageIndexes.includes(s.pageIndex) && !next[s.id]) next[s.id] = { state: 'pending', chars: 0 };
      return next;
    });
    setTask((current) => ({ phase: 'running', queue: [...new Set([...current.queue, ...pageIndexes])] }));
  };
  const taskView: TranslationTaskView = {
    phase: task.phase === 'completed' ? 'idle' : task.phase,
    current: task.queue.length ? `第 ${task.queue[0]! + 1} 页` : undefined,
    completedPages: pages.filter((p) => p.state === 'done').length,
    totalPages: pages.length,
  };

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
  // Every sentence of a started page stays locatable, translated or not.
  const available = useMemo(() => sampleSentences.filter((s) => status[s.id]), [status]);

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
        task={taskView}
        onTranslatePage={(pageIndex) => start([pageIndex])}
        onTranslateAll={() => start(pages.filter((p) => p.state === 'untranslated').map((p) => p.pageIndex))}
        onPause={() => {
          setTask((current) => ({ ...current, phase: 'pausing' }));
          // In-flight text is kept: what arrived stays as a partial sentence.
          window.setTimeout(() => {
            setStatus((current) => Object.fromEntries(Object.entries(current).map(([id, p]) => [id, p.state === 'streaming' ? { ...p, state: 'partial' } : p])));
            setTask((current) => ({ ...current, phase: 'paused' }));
          }, 450);
        }}
        onResume={() => setTask((current) => ({ ...current, phase: 'running' }))}
        onRetryPage={(pageIndex) => {
          for (const s of sampleSentences) if (s.pageIndex === pageIndex) failOnce.current.delete(s.id);
          setStatus((current) => Object.fromEntries(Object.entries(current).map(([id, p]) => [id, p.state === 'failed' ? { state: 'pending', chars: 0 } : p])));
          setTask((current) => ({ phase: 'running', queue: [...new Set([...current.queue, pageIndex])] }));
        }}
        reveal={reveal}
      />
    ),
  };
}
