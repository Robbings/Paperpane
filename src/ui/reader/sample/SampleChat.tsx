import { useEffect, useRef, useState } from 'react';
import { toast } from '@/ui/components';
import { ChatPanel } from '../chat/ChatPanel';
import type { ChatMessageView, ChatSessionView, CitationView, ModelChangeView, ModelView } from '../chat/types';

// 示例接线：讨论面板的演示数据。回答是预先写好的文本，按小段"流式"出现；不调用任何模型，刷新即恢复。

const models: ModelView[] = [
  { id: 'm-a', displayName: '示例模型 A', providerId: 'p-1', providerName: '示例供应商甲', endpointOrigin: 'api.provider-one.example', vision: true },
  { id: 'm-a-mini', displayName: '示例模型 A mini', providerId: 'p-1', providerName: '示例供应商甲', endpointOrigin: 'api.provider-one.example', vision: false },
  { id: 'm-b', displayName: '示例模型 B', providerId: 'p-2', providerName: '示例供应商乙', endpointOrigin: 'api.provider-two.example', vision: true },
];

const DOCUMENT_TITLE = 'Recovering Reading Order in Two-Column Scientific PDFs';

const cite = (label: string, page: number, quote: string): CitationView & { page: number } => ({ id: `c-${label}-${page}`, label, quote, pageLabel: `第 ${page} 页`, page });

const answers: { markdown: string; citations: (CitationView & { page: number })[] }[] = [
  {
    markdown:
      '这篇论文要解决的是**双栏论文 PDF 的阅读顺序**问题：PDF 按绘制顺序而不是阅读顺序保存文字，复制、搜索和高亮都会因此出错[^1]。\n\n作者的做法分三步：\n\n1. 把页面切成文本块，并判断每块属于哪一栏；\n2. 用规则而不是训练数据恢复块之间的顺序[^2]；\n3. 给每个块一个稳定标识，缩放或旋转后高亮仍能找回原位置。\n\n他们的主要论点是：这种基于规则的方法**透明、可追溯**，出错时能解释原因，而学习方法通常做不到[^3]。',
    citations: [
      cite('1', 1, 'text is stored in drawing order rather than reading order'),
      cite('2', 2, 'The procedure needs no training data and keeps every block linked to its position on the page'),
      cite('3', 2, 'Rule-based methods are transparent but fragile on unusual templates'),
    ],
  },
  {
    markdown:
      '实验部分主要有两点局限：\n\n- 测试集只包含常见的双栏模板，对图表很多或排版特殊的论文，规则可能失效[^1]；\n- 论文没有和学习方法在同一数据上做对比，只引用了它们公开报告的数字。\n\n如果要复现，建议先在自己领域的论文里抽样检查块的切分是否稳定。',
    citations: [cite('1', 2, 'Rule-based methods are transparent but fragile on unusual templates')],
  },
  {
    markdown: '可以把它理解成两层：底层负责"这块文字在哪一栏、排第几"，上层负责"用户标注落在哪个块上"[^1]。底层顺序错了，上层的高亮位置也会跟着错，所以作者把稳定标识放在块上，而不是放在字符偏移上。',
    citations: [cite('1', 2, 'keeps every block linked to its position on the page')],
  },
];

const followUps = ['和学习方法相比，规则方法在哪些排版上更容易出错？', '稳定标识具体是怎么计算的？', '这个方法能用在扫描版 PDF 上吗？'];

interface Msg extends Omit<ChatMessageView, 'version'> {
  parentId: string | null;
}

interface Session {
  id: string;
  title: string;
  modelId: string;
  messages: Msg[];
  activeLeafId: string | null;
  draft: string;
  suggestions: ChatSessionView['suggestions'];
  updatedAt: string;
}

let counter = 0;
const nextId = (prefix: string) => `${prefix}-${++counter}`;
const now = () => new Date().toISOString();
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const modelSnapshot = (id: string) => {
  const model = models.find((m) => m.id === id)!;
  return { displayName: model.displayName, providerName: model.providerName };
};

function seed(): Session[] {
  const q1: Msg = { id: 'q1', parentId: null, role: 'user', markdown: '这篇论文的核心贡献是什么？', attachments: [], citations: [], createdAt: ago(30) };
  const a1old: Msg = { id: 'a1-old', parentId: 'q1', role: 'assistant', markdown: '核心贡献是一个不需要训练数据的阅读顺序恢复方法[^1]。', citations: [answers[0]!.citations[0]!], attachments: [], createdAt: ago(29), model: modelSnapshot('m-a-mini'), generation: { state: 'completed' } };
  const a1: Msg = { id: 'a1', parentId: 'q1', role: 'assistant', ...answers[0]!, attachments: [], createdAt: ago(28), model: modelSnapshot('m-a'), generation: { state: 'completed' } };
  const q2: Msg = { id: 'q2', parentId: 'a1', role: 'user', markdown: '实验部分有什么局限？', attachments: [], citations: [], createdAt: ago(27) };
  const a2: Msg = { id: 'a2', parentId: 'q2', role: 'assistant', markdown: answers[1]!.markdown.slice(0, 60), citations: [], attachments: [], createdAt: ago(26), model: modelSnapshot('m-a'), generation: { state: 'stopped' } };

  const p1: Msg = { id: 'p1', parentId: null, role: 'user', markdown: '把方法部分概括成三句话', attachments: [], citations: [], createdAt: ago(60 * 26) };
  const r1: Msg = { id: 'r1', parentId: 'p1', role: 'assistant', markdown: '第一句：把页面切成文本块并判断栏位。第二句：按规则排定块的顺序', citations: [], attachments: [], createdAt: ago(60 * 26), model: modelSnapshot('m-b'), generation: { state: 'interrupted' } };
  const p2: Msg = { id: 'p2', parentId: 'r1', role: 'user', markdown: '继续', attachments: [], citations: [], createdAt: ago(60 * 25) };
  const r2: Msg = {
    id: 'r2', parentId: 'p2', role: 'assistant', markdown: '', citations: [], attachments: [], createdAt: ago(60 * 25), model: modelSnapshot('m-b'),
    generation: { state: 'failed', error: { message: '示例供应商乙暂时无法连接（网络超时）。', recovery: ['retry', 'change-model'] } },
  };

  return [
    { id: 's1', title: '这篇论文的核心贡献', modelId: 'm-a', messages: [q1, a1old, a1, q2, a2], activeLeafId: 'a2', draft: '', suggestions: { state: 'ready', questions: followUps.slice(0, 2) }, updatedAt: ago(26) },
    { id: 's2', title: '方法部分概括', modelId: 'm-b', messages: [p1, r1, p2, r2], activeLeafId: 'r2', draft: '', suggestions: { state: 'idle', questions: [] }, updatedAt: ago(60 * 25) },
  ];
}

function visible(session: Session): Msg[] {
  const byId = new Map(session.messages.map((m) => [m.id, m]));
  const path: Msg[] = [];
  for (let id = session.activeLeafId; id; id = byId.get(id)?.parentId ?? null) path.unshift(byId.get(id)!);
  return path;
}

const siblings = (session: Session, message: Msg) => session.messages.filter((m) => m.parentId === message.parentId && m.role === message.role);

function latestLeaf(session: Session, id: string): string {
  const children = session.messages.filter((m) => m.parentId === id);
  if (children.length === 0) return id;
  const newest = children.reduce((a, b) => (b.createdAt >= a.createdAt ? b : a));
  return latestLeaf(session, newest.id);
}

export function SampleChat({ onLocateQuote }: { onLocateQuote: (quote: string) => void }) {
  const [sessions, setSessions] = useState<Session[]>(seed);
  const [currentId, setCurrentId] = useState<string | null>('s1');
  const [newDraft, setNewDraft] = useState('');
  const [defaultModel, setDefaultModel] = useState('m-a');
  const [pendingModel, setPendingModel] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const answerIndex = useRef(1);

  useEffect(() => () => window.clearInterval(timer.current), []);

  const current = sessions.find((s) => s.id === currentId) ?? null;
  const update = (id: string, change: (session: Session) => Session) => setSessions((all) => all.map((s) => (s.id === id ? change(s) : s)));
  const setMessage = (sessionId: string, messageId: string, patch: Partial<Msg>) =>
    update(sessionId, (s) => ({ ...s, updatedAt: now(), messages: s.messages.map((m) => (m.id === messageId ? { ...m, ...patch } : m)) }));

  /** Adds an answer under `parentId` and streams a canned text into it. */
  const answer = (sessionId: string, parentId: string, modelId: string) => {
    const canned = answers[answerIndex.current++ % answers.length]!;
    const id = nextId('a');
    update(sessionId, (s) => ({
      ...s,
      activeLeafId: id,
      suggestions: { state: 'idle', questions: [] },
      messages: [...s.messages, { id, parentId, role: 'assistant', markdown: '', citations: [], attachments: [], createdAt: now(), model: modelSnapshot(modelId), generation: { state: 'queued' } }],
    }));
    window.clearInterval(timer.current);
    let shown = 0;
    window.setTimeout(() => {
      setMessage(sessionId, id, { generation: { state: 'running' } });
      timer.current = window.setInterval(() => {
        shown = Math.min(canned.markdown.length, shown + 6);
        const done = shown >= canned.markdown.length;
        setMessage(sessionId, id, { markdown: canned.markdown.slice(0, shown), ...(done ? { citations: canned.citations, generation: { state: 'completed' } } : {}) });
        if (done) {
          window.clearInterval(timer.current);
          update(sessionId, (s) => ({ ...s, suggestions: { state: 'loading', questions: [] } }));
          window.setTimeout(() => update(sessionId, (s) => ({ ...s, suggestions: { state: 'ready', questions: followUps } })), 700);
        }
      }, 45);
    }, 450);
  };

  const ask = (text: string) => {
    let session = current;
    if (!session) {
      session = { id: nextId('s'), title: text.length > 18 ? `${text.slice(0, 18)}…` : text, modelId: defaultModel, messages: [], activeLeafId: null, draft: '', suggestions: { state: 'idle', questions: [] }, updatedAt: now() };
      const created = session;
      setSessions((all) => [created, ...all]);
      setCurrentId(created.id);
      setNewDraft('');
    }
    const q: Msg = { id: nextId('q'), parentId: session.activeLeafId, role: 'user', markdown: text, attachments: [], citations: [], createdAt: now() };
    update(session.id, (s) => ({ ...s, draft: '', activeLeafId: q.id, messages: [...s.messages, q] }));
    answer(session.id, q.id, session.modelId);
  };

  const stop = () => {
    window.clearInterval(timer.current);
    if (!current) return;
    const running = current.messages.find((m) => m.generation?.state === 'running' || m.generation?.state === 'queued');
    if (running) setMessage(current.id, running.id, { generation: { state: 'stopped' } });
  };

  const view: ChatSessionView | null = current && {
    id: current.id,
    title: current.title,
    modelId: current.modelId,
    draft: { text: current.draft, attachments: [] },
    suggestions: current.suggestions,
    messages: visible(current).map((m) => {
      const versions = siblings(current, m);
      return { ...m, version: versions.length > 1 ? { index: versions.indexOf(m) + 1, count: versions.length } : undefined };
    }),
  };

  const sessionModel = current?.modelId ?? defaultModel;
  const change: ModelChangeView | null = pendingModel
    ? {
        target: models.find((m) => m.id === pendingModel)!,
        messageCount: current ? visible(current).length : 0,
        imageCount: 0,
        documents: [DOCUMENT_TITLE],
      }
    : null;
  const applyModel = (modelId: string) => (current ? update(current.id, (s) => ({ ...s, modelId })) : setDefaultModel(modelId));

  return (
    <ChatPanel
      title="讨论"
      demo
      models={models}
      session={view}
      newDraft={newDraft}
      sessions={sessions.map((s) => ({ id: s.id, title: s.title, updatedAt: s.updatedAt, messageCount: s.messages.length }))}
      defaultModelId={defaultModel}
      starters={['这篇论文要解决什么问题？', '方法的关键步骤是什么？', '实验结论可靠吗？有哪些局限？', '用三句话向同行介绍这篇论文']}
      modelChange={change}
      onDraft={(text) => (current ? update(current.id, (s) => ({ ...s, draft: text })) : setNewDraft(text))}
      onRemoveAttachment={() => undefined}
      onSend={() => {
        const text = (current?.draft ?? newDraft).trim();
        if (text) ask(text);
      }}
      onStop={stop}
      onRegenerate={(messageId) => {
        const message = current?.messages.find((m) => m.id === messageId);
        if (current && message?.parentId) answer(current.id, message.parentId, current.modelId);
      }}
      onEditQuestion={(messageId, text) => {
        const original = current?.messages.find((m) => m.id === messageId);
        if (!current || !original) return;
        const q: Msg = { ...original, id: nextId('q'), markdown: text, createdAt: now() };
        update(current.id, (s) => ({ ...s, activeLeafId: q.id, messages: [...s.messages, q] }));
        answer(current.id, q.id, current.modelId);
      }}
      onVersion={(messageId, direction) => {
        const message = current?.messages.find((m) => m.id === messageId);
        if (!current || !message) return;
        const versions = siblings(current, message);
        const target = versions[versions.indexOf(message) + direction];
        if (target) update(current.id, (s) => ({ ...s, activeLeafId: latestLeaf(s, target.id) }));
      }}
      onLocate={(citation) => onLocateQuote(citation.quote)}
      onRecover={(messageId, action) => {
        if (action === 'retry') {
          const message = current?.messages.find((m) => m.id === messageId);
          if (current && message?.parentId) answer(current.id, message.parentId, current.modelId);
        } else if (action === 'change-model') {
          toast.show({ message: '在输入框左下角选择另一个模型后重试。' });
        } else {
          toast.show({ message: '示例：打开模型设置' });
        }
      }}
      onRetrySuggestions={() => current && update(current.id, (s) => ({ ...s, suggestions: { state: 'ready', questions: followUps } }))}
      onModel={(modelId) => {
        const from = models.find((m) => m.id === sessionModel);
        const to = models.find((m) => m.id === modelId);
        // Within one provider the switch applies at once; another provider needs the reader's OK first.
        if (current && current.messages.length > 0 && from && to && from.providerId !== to.providerId) setPendingModel(modelId);
        else applyModel(modelId);
      }}
      onConfirmModelChange={() => {
        if (pendingModel) applyModel(pendingModel);
        setPendingModel(null);
      }}
      onCancelModelChange={() => setPendingModel(null)}
      onNewSession={() => {
        setCurrentId(null);
        setNewDraft('');
      }}
      onOpenSession={setCurrentId}
      onRenameSession={(id, title) => update(id, (s) => ({ ...s, title }))}
      onRemoveSession={(id) => {
        setSessions((all) => all.filter((s) => s.id !== id));
        if (id === currentId) setCurrentId(null);
      }}
      onConfigureModels={() => toast.show({ message: '示例：打开模型设置' })}
    />
  );
}
