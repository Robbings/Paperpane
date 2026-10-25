import { useEffect, useRef, useState } from 'react';
import { toast } from '@/ui/components';
import { OverviewPanel } from '../overview/OverviewPanel';
import type { OverviewCardDef, OverviewContent, OverviewResultView } from '../overview/types';

// 示例接线：概览面板的演示数据。生成过程用定时器模拟，不调用模型，刷新即恢复。

const builtIns: OverviewCardDef[] = [
  { id: 'keywords', name: '关键词', prompt: '列出 5–8 个能概括论文主题和方法的关键词。', output: 'list', listStyle: 'tags', builtIn: true, visible: true },
  { id: 'points', name: '要点', prompt: '用 3–5 条要点概括论文的问题、方法、结果和结论，每条一句话。', output: 'list', listStyle: 'bullets', builtIn: true, visible: true },
  {
    id: 'summary',
    name: '结构化摘要',
    prompt: '按给定字段整理论文的研究问题、方法、数据、主要结果和局限。',
    output: 'fields',
    schema: JSON.stringify(
      {
        type: 'object',
        properties: {
          question: { type: 'string', title: '研究问题' },
          method: { type: 'string', title: '方法' },
          data: { type: 'string', title: '数据' },
          results: { type: 'string', title: '主要结果' },
          limits: { type: 'string', title: '局限' },
        },
      },
      null,
      2,
    ),
    builtIn: true,
    visible: true,
  },
];

const custom: OverviewCardDef = {
  id: 'reproduce',
  name: '复现清单',
  prompt: '列出复现这篇论文需要准备的数据、代码和关键参数，并指出论文没有交代清楚的地方。',
  output: 'markdown',
  builtIn: false,
  visible: true,
};

const contents: Record<string, OverviewContent> = {
  keywords: { output: 'list', items: ['阅读顺序', '双栏版面', 'PDF 文本块', '规则方法', '稳定锚点', '高亮重投影'] },
  points: {
    output: 'list',
    items: [
      'PDF 按绘制顺序保存文字，导致双栏论文的复制、搜索和高亮顺序错乱。',
      '论文提出一种不需要训练数据的规则方法：先切分文本块、判断栏位，再排定顺序。',
      '每个文本块带稳定标识，缩放和旋转后高亮仍能落回原位置。',
      '方法透明、可追溯，但对排版特殊的模板比较脆弱。',
    ],
  },
  summary: {
    output: 'fields',
    fields: [
      { label: '研究问题', value: '如何在不依赖训练数据的情况下，恢复双栏论文 PDF 的阅读顺序。' },
      { label: '方法', value: '版面切分为文本块，按栏位和位置规则排序，并为每块生成稳定标识。' },
      { label: '数据', value: '常见双栏模板的论文样本（论文未公开具体数量）。' },
      { label: '主要结果', value: '在常见模板上顺序恢复可靠，高亮在缩放、旋转后保持位置。' },
      { label: '局限', value: '图表密集或排版特殊的论文上规则可能失效；没有与学习方法在同一数据上对比。' },
    ],
  },
};

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

export function SampleOverview() {
  const [cards, setCards] = useState<OverviewCardDef[]>([...builtIns, custom]);
  const [results, setResults] = useState<Record<string, OverviewResultView>>({
    keywords: { state: 'completed', content: contents.keywords, model: '示例模型 A', generatedAt: ago(40) },
    points: { state: 'completed', content: contents.points, model: '示例模型 A', generatedAt: ago(40) },
    reproduce: { state: 'failed', error: { message: '回答不符合卡片要求的格式，已保留原始输出供检查。', recovery: ['retry'] } },
  });
  const timers = useRef(new Map<string, number>());

  useEffect(() => () => timers.current.forEach((t) => window.clearInterval(t)), []);

  const set = (id: string, result: OverviewResultView) => setResults((all) => ({ ...all, [id]: result }));

  const run = (id: string, delay: number) => {
    const card = cards.find((c) => c.id === id);
    const target: OverviewContent =
      contents[id] ?? { output: 'markdown', markdown: '**数据**：常见双栏模板的论文 PDF。\n\n**代码**：论文未提供代码，需要按方法部分自行实现文本块切分与排序。\n\n**没有交代清楚**：栏位判断的阈值、遇到跨栏图表时的处理顺序。' };
    set(id, { state: 'queued' });
    window.setTimeout(() => {
      set(id, { state: 'running' });
      let step = 0;
      const steps = target.output === 'markdown' ? Math.ceil(target.markdown.length / 8) : target.output === 'list' ? target.items.length : target.fields.length;
      const timer = window.setInterval(() => {
        step += 1;
        const partial: OverviewContent =
          target.output === 'markdown'
            ? { output: 'markdown', markdown: target.markdown.slice(0, step * 8) }
            : target.output === 'list'
              ? { output: 'list', items: target.items.slice(0, step) }
              : { output: 'fields', fields: target.fields.slice(0, step) };
        const done = step >= steps;
        set(id, done ? { state: 'completed', content: target, model: '示例模型 A', generatedAt: new Date().toISOString() } : { state: 'running', content: partial });
        if (done) {
          window.clearInterval(timer);
          timers.current.delete(id);
        }
      }, target.output === 'markdown' ? 40 : 380);
      timers.current.set(id, timer);
    }, delay);
    if (!card) toast.show({ message: '找不到这张卡片', tone: 'warning' });
  };

  return (
    <OverviewPanel
      demo
      cards={cards}
      results={results}
      modelReady
      onGenerate={(ids) => ids.forEach((id, index) => run(id, 500 + index * 1600))}
      onStop={(id) => {
        window.clearInterval(timers.current.get(id));
        timers.current.delete(id);
        setResults((all) => ({ ...all, [id]: { ...all[id]!, state: 'stopped', model: '示例模型 A', generatedAt: new Date().toISOString() } }));
      }}
      onSaveCard={(card) => {
        if (card.id) {
          setCards((all) => all.map((c) => (c.id === card.id ? card : c)));
          // Edited cards keep their old result, marked as possibly out of date.
          setResults((all) => (all[card.id]?.state === 'completed' ? { ...all, [card.id]: { ...all[card.id]!, stale: true } } : all));
        } else {
          setCards((all) => [...all, { ...card, id: `card-${Date.now()}` }]);
        }
      }}
      onRemoveCard={(id) => setCards((all) => all.filter((c) => c.id !== id))}
      onResetCard={(id) => {
        const original = builtIns.find((c) => c.id === id);
        if (original) setCards((all) => all.map((c) => (c.id === id ? { ...original, visible: c.visible } : c)));
      }}
      onReorder={(ids) => setCards((all) => ids.map((id) => all.find((c) => c.id === id)!).filter(Boolean))}
      onVisible={(id, visible) => setCards((all) => all.map((c) => (c.id === id ? { ...c, visible } : c)))}
      onConfigureModels={() => toast.show({ message: '示例：打开模型设置' })}
    />
  );
}
