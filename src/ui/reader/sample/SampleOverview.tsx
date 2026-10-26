import { useEffect, useRef, useState } from 'react';
import { toast } from '@/ui/components';
import { OverviewPanel } from '../overview/OverviewPanel';
import type { OverviewCardDef, OverviewContent, OverviewResultView, OverviewSourceView } from '../overview/types';

// 示例接线：概览面板的演示数据。打开时自动"生成"（定时器模拟逐段出现），
// 不调用模型，刷新即恢复。引文都取自示例论文第 1 页，点出处可跳回原文。

const cards: OverviewCardDef[] = [
  { id: 'gist', name: '概括', prompt: '用一两句话说清这篇论文做了什么、为什么重要。', output: 'markdown', display: 'lead', builtIn: true, visible: true },
  { id: 'keywords', name: '关键词', prompt: '列出 5–8 个能概括论文主题和方法的关键词。', output: 'list', listStyle: 'tags', builtIn: true, visible: true },
  {
    id: 'summary',
    name: '结构化摘要',
    prompt: '按给定字段整理论文的研究问题、方法、数据、主要结果和局限。',
    output: 'fields',
    builtIn: true,
    visible: true,
  },
  { id: 'points', name: '要点', prompt: '用 3–5 条要点概括论文最值得记住的内容，每条一句话。', output: 'list', listStyle: 'bullets', builtIn: true, visible: true },
];

const source = (label: string, quote: string, verified = true): OverviewSourceView => ({ label, quote, pageLabel: verified ? '第 1 页' : undefined, verified });

const finished: Record<string, { content: OverviewContent; sources: OverviewSourceView[] }> = {
  gist: {
    content: {
      output: 'markdown',
      markdown:
        '双栏论文的 PDF 按绘制顺序而不是阅读顺序保存文字[^1]。作者用一组不需要训练数据的几何规则恢复阅读顺序，并让每个文本块始终关联它在页面上的位置[^2]，使搜索、高亮和翻译都能指回原文。',
    },
    sources: [source('1', 'text is stored in drawing order rather than reading order'), source('2', 'keeps every block linked to its position on the page')],
  },
  keywords: { content: { output: 'list', items: ['阅读顺序', '双栏版面', '文本块', '几何规则', '稳定标识', '可追溯性'] }, sources: [] },
  summary: {
    content: {
      output: 'fields',
      fields: [
        { label: '研究问题', value: '双栏版面里，文字的存储顺序与阅读顺序不一致，直接提取的句子会在两栏之间跳来跳去[^1]。' },
        { label: '方法', value: '把字形归并成文本块，判断每块属于哪一栏，再用一小组几何规则排序[^2]。' },
        { label: '数据', value: '论文前两节没有交代评测数据的规模和来源。' },
        { label: '主要结果', value: '不需要训练数据[^3]；页面缩放或旋转后，文本块会重新投影到正确位置[^4]。' },
        { label: '局限', value: '规则方法透明，但遇到不常见的模板容易出错[^5]。' },
      ],
    },
    sources: [
      source('1', 'naive extraction produces sentences that jump between columns'),
      source('2', 'groups glyphs into blocks, assigns each block to a column, and orders blocks with a small set of geometric rules'),
      source('3', 'The procedure needs no training data'),
      source('4', 'We describe how blocks are re-projected when the page is zoomed or rotated'),
      source('5', 'Rule-based methods are transparent but fragile on unusual templates'),
    ],
  },
  points: {
    content: {
      output: 'list',
      items: [
        'PDF 不保证阅读顺序：文件可能先画第二栏，或把图注夹在一段话中间[^1]。',
        '块模型把文字、类型和几何位置放在一起[^2]，这是后续排序和定位的基础。',
        '每个排序决定都有记录，顺序错了可以追溯到产生它的那条规则[^3]。',
        '同一文件再次打开时，块标识保持不变；否则昨天的高亮可能落到今天的错行上[^4]。',
        '作者认为方法可以直接推广到三栏版面[^5]。',
      ],
    },
    sources: [
      source('1', 'a file may draw the second column before the first'),
      source('2', 'We define a block model that keeps text, kind and geometry together'),
      source('3', 'an explicit record of every decision, so a wrong order can be traced to the rule that produced it'),
      source('4', 'a highlight made yesterday may land on the wrong line today'),
      // Not in the paper: shows how an unverified quote looks.
      source('5', 'the method extends directly to three-column layouts', false),
    ],
  },
};

/** The streamed prefix of a result: whole markers only, so no half-written "[^" shows. */
function partial(content: OverviewContent, step: number): OverviewContent {
  if (content.output === 'markdown') {
    let end = Math.min(content.markdown.length, step * 6);
    const open = content.markdown.lastIndexOf('[^', end);
    if (open >= 0 && content.markdown.indexOf(']', open) >= end) end = open;
    return { output: 'markdown', markdown: content.markdown.slice(0, end) };
  }
  if (content.output === 'list') return { output: 'list', items: content.items.slice(0, step) };
  return { output: 'fields', fields: content.fields.slice(0, step) };
}

const steps = (content: OverviewContent) =>
  content.output === 'markdown' ? Math.ceil(content.markdown.length / 6) : content.output === 'list' ? content.items.length : content.fields.length;

export function SampleOverview({ onLocateQuote }: { onLocateQuote: (quote: string) => void }) {
  const [defs, setDefs] = useState(cards);
  const [results, setResults] = useState<Record<string, OverviewResultView>>({});
  const timer = useRef<number | undefined>(undefined);
  const queue = useRef<string[]>([]);

  const set = (id: string, result: OverviewResultView) => setResults((all) => ({ ...all, [id]: result }));

  /** Generates cards one after another, each appearing a little at a time. */
  const runNext = () => {
    const id = queue.current.shift();
    if (!id) return;
    const target = finished[id];
    if (!target) return runNext();
    let step = 0;
    set(id, { state: 'running' });
    const tick = () => {
      step += 1;
      const done = step >= steps(target.content);
      set(id, done
        ? { state: 'completed', content: target.content, sources: target.sources, model: '示例模型 A', generatedAt: new Date().toISOString() }
        : { state: 'running', content: partial(target.content, step), sources: target.sources });
      timer.current = window.setTimeout(done ? runNext : tick, done ? 250 : target.content.output === 'markdown' ? 28 : 240);
    };
    timer.current = window.setTimeout(tick, 350);
  };

  const generate = (ids: string[]) => {
    window.clearTimeout(timer.current);
    queue.current = ids;
    // Waiting cards keep their old text until their turn, as the live service would.
    setResults((all) => ({ ...all, ...Object.fromEntries(ids.map((id) => [id, { ...all[id], state: 'queued' as const }])) }));
    runNext();
  };

  // The logic layer starts this when the paper opens; the demo starts when the panel first shows.
  useEffect(() => {
    generate(cards.map((c) => c.id));
    return () => window.clearTimeout(timer.current);
  }, []); // once

  return (
    <OverviewPanel
      demo
      cards={defs}
      results={results}
      modelReady
      onRegenerate={generate}
      onStop={(ids) => {
        window.clearTimeout(timer.current);
        queue.current = [];
        setResults((all) => ({
          ...all,
          ...Object.fromEntries(
            ids.map((id) => [id, all[id]?.content ? { ...all[id]!, state: 'stopped' as const, model: '示例模型 A', generatedAt: new Date().toISOString() } : { state: 'empty' as const }]),
          ),
        }));
      }}
      onHide={(id) => {
        setDefs((all) => all.map((c) => (c.id === id ? { ...c, visible: false } : c)));
        toast.show({ message: '已隐藏，可以在「管理概览内容」里重新打开。', action: { label: '撤销', onAction: () => setDefs((all) => all.map((c) => (c.id === id ? { ...c, visible: true } : c))) } });
      }}
      onManageCards={() => toast.show({ message: '示例：打开设置里的「概览内容」' })}
      onLocate={(s) => onLocateQuote(s.quote)}
      onConfigureModels={() => toast.show({ message: '示例：打开模型设置' })}
    />
  );
}
