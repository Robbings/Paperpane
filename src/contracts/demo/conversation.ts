import type { ChatDraft, ChatMessage, Conversation, ConversationService, ConversationState, Generation, ModelChangeConfirmation, ModelOption, SourceCitation } from '../conversation';
import { visibleMessages } from '../conversation';
import { failure, success, type AppError, type Result } from '../common';
import { demoId, demoStore, now } from './store';

const defaultModels: readonly ModelOption[] = [
  { id: 'demo-text', displayName: '演示文字模型', providerId: 'demo-a', providerName: '演示供应商 A', endpointOrigin: 'https://a.example.com', capabilities: { vision: false, reasoningLevels: [] } },
  { id: 'demo-vision', displayName: '演示视觉模型', providerId: 'demo-b', providerName: '演示供应商 B', endpointOrigin: 'https://b.example.com', capabilities: { vision: true, reasoningLevels: ['low', 'high'] } },
];
export interface ReplyScenario { text?: string; citations?: readonly SourceCitation[]; failAfterChunks?: number; error?: AppError }
/** Timers and static strings only. No model calls and no durable data. */
export function createDemoConversations() {
  const store = demoStore<ConversationState>({ sessions: [], models: defaultModels });
  const pending = new Set<string>();
  const runs = new Map<string, { messageId: string; cancelled: boolean }>();
  const confirmations = new Map<string, ModelChangeConfirmation>();
  let nextReply: ReplyScenario = {};
  let disposed = false;
  const get = (id: string) => store.data().sessions.find((item) => item.id === id && !item.deletedAt);
  const model = (id: string) => store.data().models.find((item) => item.id === id);
  const update = (session: Conversation) => store.update({ ...store.data(), sessions: store.data().sessions.map((item) => item.id === session.id ? { ...session, revision: demoId(), updatedAt: now() } : item) });
  const busy = (id: string) => pending.has(id) || runs.has(id);
  const save = () => ({ local: 'saved' as const, sync: 'unconfigured' as const });
  const checkInput = (session: Conversation, input: ChatDraft): Result<void> => {
    if (!input.text.trim() && !input.attachments.length) return failure('INVALID_INPUT', '问题不能为空');
    if (input.attachments.length && !model(session.modelId)?.capabilities.vision) return failure('INVALID_INPUT', '此模型不支持图片', ['change-model']);
    if (input.attachments.some((attachment) => !session.documents.some((doc) => doc.documentId === attachment.anchor.documentId && doc.fileVersion === attachment.anchor.fileVersion))) return failure('INVALID_INPUT', '附件不属于会话中的文档版本');
    return success(undefined);
  };
  function changeMessage(sessionId: string, messageId: string, patch: Partial<ChatMessage>) {
    const session = get(sessionId); if (!session) return;
    update({ ...session, messages: session.messages.map((item) => item.id === messageId ? { ...item, ...patch } : item) });
  }
  async function stream(sessionId: string, messageId: string, scenario: ReplyScenario) {
    const run = { messageId, cancelled: false }; runs.set(sessionId, run);
    const active = () => !disposed && !run.cancelled && runs.get(sessionId) === run && !!get(sessionId);
    const text = scenario.text ?? '这是演示回答，不会调用模型，也不会写入数据库。\n\n可以停止生成，或切换到此前保留的回答版本。';
    const chunks = Array.from(text).reduce<string[]>((list, char, i) => { if (i % 8 === 0) list.push(''); list[list.length - 1] += char; return list; }, []);
    let output = '';
    for (let index = 0; index < chunks.length; index++) {
      const gate = await store.gate();
      if (!active()) return;
      if (!gate.ok || (scenario.failAfterChunks !== undefined && index >= scenario.failAfterChunks)) {
        const error = !gate.ok ? gate.error : scenario.error ?? { code: 'NETWORK' as const, message: '演示连接中断', recovery: ['retry' as const] };
        changeMessage(sessionId, messageId, { generation: { state: error.code === 'SAVE_FAILED' ? 'save-failed' : 'failed', error }, save: error.code === 'SAVE_FAILED' ? { ...save(), local: 'failed', error } : save() });
        runs.delete(sessionId); return;
      }
      output += chunks[index];
      changeMessage(sessionId, messageId, { markdown: output, generation: { state: 'running' } });
    }
    if (!active()) return;
    changeMessage(sessionId, messageId, { generation: { state: 'completed' }, citations: scenario.citations ?? [] });
    runs.delete(sessionId);
  }
  async function generate(id: string, input: ChatDraft | undefined, parentId: string | null): Promise<Result<string>> {
    if (disposed) return failure('CANCELLED', '演示服务已关闭');
    if (busy(id)) return failure('BUSY', '请先停止当前生成');
    let session = get(id); if (!session) return failure('NOT_FOUND', '会话不存在');
    const capturedInput = input ? structuredClone(input) : undefined;
    if (capturedInput) { const valid = checkInput(session, capturedInput); if (!valid.ok) return valid; }
    const parent = session.messages.find((item) => item.id === parentId);
    if (parentId !== null && !parent) return failure('NOT_FOUND', '消息不存在');
    if (capturedInput ? (parent && parent.role !== 'assistant') : (!parent || parent.role !== 'user')) return failure('INVALID_INPUT', '消息角色顺序无效');
    if (!model(session.modelId)?.capabilities.vision && visibleMessages({ ...session, activeLeafId: parentId }).some((message) => message.attachments.length)) return failure('INVALID_INPUT', '当前历史包含图片，请选择视觉模型', ['change-model']);
    // Drafts, title and suggestions may change while acceptance waits. Only the
    // message context used for this request must remain unchanged.
    const expectedLeafId = session.activeLeafId;
    const expectedModelId = session.modelId;
    pending.add(id); const gate = await store.gate(); pending.delete(id);
    if (!gate.ok) return gate;
    if (disposed) return failure('CANCELLED', '演示服务已关闭');
    session = get(id); if (!session) return failure('NOT_FOUND', '会话已删除');
    const currentParent = session.messages.find((item) => item.id === parentId);
    if (session.activeLeafId !== expectedLeafId || session.modelId !== expectedModelId
      || (parentId !== null && (!currentParent || currentParent.role !== parent?.role || currentParent.parentId !== parent?.parentId))) {
      return failure('CONFLICT', '对话分支或模型已变化，请重新发送', ['retry']);
    }
    const selectedModel = model(session.modelId)!;
    const messages: ChatMessage[] = [...session.messages];
    if (capturedInput) {
      const question: ChatMessage = { id: demoId(), parentId, role: 'user', markdown: capturedInput.text, attachments: capturedInput.attachments, citations: [], createdAt: now(), save: save() };
      messages.push(question); parentId = question.id;
    }
    const answer: ChatMessage = { id: demoId(), parentId, role: 'assistant', markdown: '', attachments: [], citations: [], createdAt: now(), generation: { state: 'queued' }, save: save(),
      model: { modelId: selectedModel.id, displayName: selectedModel.displayName, providerId: selectedModel.providerId, providerName: selectedModel.providerName } };
    messages.push(answer);
    update({ ...session, messages, activeLeafId: answer.id,
      draft: capturedInput && JSON.stringify(session.draft) === JSON.stringify(capturedInput) ? { text: '', attachments: [] } : session.draft });
    const scenario = structuredClone(nextReply); nextReply = {};
    void stream(id, answer.id, scenario);
    return success(answer.id);
  }
  const service: ConversationService = {
    ...store.readable,
    async create(input) {
      input = structuredClone(input);
      const gate = await store.gate(); if (!gate.ok) return gate;
      if (disposed) return failure('CANCELLED', '演示服务已关闭');
      if (!model(input.modelId) || !input.documents.length || !input.title.trim()) return failure('INVALID_INPUT', '请选择文档、模型并填写标题');
      if (input.explanation) {
        const anchor = input.explanation.kind === 'text' ? input.explanation.selection.anchor : input.explanation.attachment.anchor;
        if (!input.documents.some((doc) => doc.documentId === anchor.documentId && doc.fileVersion === anchor.fileVersion)) return failure('INVALID_INPUT', '解释来源不属于当前文档版本');
      }
      const session: Conversation = { ...input, id: demoId(), revision: demoId(), createdAt: now(), updatedAt: now(), messages: [], activeLeafId: null, draft: { text: '', attachments: [] }, draftSave: save(), suggestions: { state: 'idle', questions: [] } };
      store.update({ ...store.data(), sessions: [...store.data().sessions, session] }); return success(structuredClone(session));
    },
    async rename(id, title) {
      const gate = await store.gate(); if (!gate.ok) return gate;
      const session = get(id); if (!session) return failure('NOT_FOUND', '会话不存在');
      if (!title.trim()) return failure('INVALID_INPUT', '标题不能为空'); update({ ...session, title }); return success(undefined);
    },
    async remove(id) {
      const gate = await store.gate(); if (!gate.ok) return gate;
      const session = get(id); if (!session) return failure('NOT_FOUND', '会话不存在');
      const run = runs.get(id); if (run) { run.cancelled = true; runs.delete(id); }
      update({ ...session, deletedAt: now(), messages: session.messages.map((message) => message.id === run?.messageId ? { ...message, generation: { state: 'stopped' } } : message) }); return success(undefined);
    },
    async setDraft(id, draft) {
      // Synchronous publication ensures rapid keystrokes cannot complete out of order.
      const session = get(id); if (!session) return failure('NOT_FOUND', '会话不存在');
      update({ ...session, draft: structuredClone(draft), draftSave: save() }); return success(undefined);
    },
    send: (id, input, parentId) => generate(id, input, parentId),
    async editQuestion(id, messageId, input) {
      const message = get(id)?.messages.find((item) => item.id === messageId);
      if (!message || message.role !== 'user') return failure('NOT_FOUND', '问题不存在');
      return generate(id, input, message.parentId);
    },
    async regenerate(id, messageId) {
      const message = get(id)?.messages.find((item) => item.id === messageId);
      if (!message || message.role !== 'assistant') return failure('NOT_FOUND', '回答不存在');
      return generate(id, undefined, message.parentId);
    },
    async stop(id) {
      if (pending.has(id)) return failure('BUSY', '正在接收发送请求，请稍后停止', ['retry']);
      const run = runs.get(id); if (!run) return failure('INVALID_INPUT', '没有运行中的回答');
      run.cancelled = true; runs.delete(id); changeMessage(id, run.messageId, { generation: { state: 'stopped' } }); return success(undefined);
    },
    async selectBranch(id, leafId) {
      if (busy(id)) return failure('BUSY', '请先停止当前生成');
      const session = get(id); if (!session) return failure('NOT_FOUND', '会话不存在');
      if (!session.messages.some((item) => item.id === leafId)) return failure('NOT_FOUND', '历史版本不存在');
      update({ ...session, activeLeafId: leafId }); return success(undefined);
    },
    async changeModel(id, modelId) {
      if (busy(id)) return failure('BUSY', '请先停止当前生成');
      const session = get(id); const target = model(modelId);
      if (!session || !target) return failure('NOT_FOUND', '会话或模型不存在');
      const messages = visibleMessages(session);
      const imageCount = messages.reduce((count, message) => count + message.attachments.length, 0) + session.draft.attachments.length + (session.explanation?.kind === 'image' ? 1 : 0);
      if (imageCount && !target.capabilities.vision) return failure('INVALID_INPUT', '此会话包含图片，需要视觉模型', ['change-model']);
      if (model(session.modelId)?.providerId === target.providerId) { update({ ...session, modelId }); return success({ state: 'applied' }); }
      const confirmation: ModelChangeConfirmation = { id: demoId(), sessionId: id, sessionRevision: session.revision, expiresAt: new Date(Date.now() + 300000).toISOString(), target: structuredClone(target), disclosure: { messageCount: messages.length, imageCount, documents: session.documents } };
      confirmations.set(confirmation.id, confirmation);
      return success({ state: 'confirmation-required', confirmation: structuredClone(confirmation) });
    },
    async confirmModelChange(id) {
      const confirmation = confirmations.get(id);
      if (!confirmation) return failure('STALE_CONFIRMATION', '模型切换确认已失效', ['change-model']);
      if (busy(confirmation.sessionId)) return failure('BUSY', '请先停止当前生成');
      confirmations.delete(id);
      const session = get(confirmation.sessionId);
      if (!session || session.revision !== confirmation.sessionRevision || Date.parse(confirmation.expiresAt) < Date.now()) return failure('STALE_CONFIRMATION', '会话已变化，请重新确认发送范围', ['change-model']);
      update({ ...session, modelId: confirmation.target.id }); return success(undefined);
    },
    async suggest(id) {
      let session = get(id); if (!session) return failure('NOT_FOUND', '会话不存在');
      if (session.suggestions.state === 'loading') return failure('BUSY', '正在生成推荐问题');
      update({ ...session, suggestions: { state: 'loading', questions: [] } });
      const gate = await store.gate(); session = get(id); if (!session) return failure('NOT_FOUND', '会话已删除');
      update({ ...session, suggestions: gate.ok ? { state: 'ready', questions: ['论文解决了什么问题？', '方法有哪些假设？', '结论的适用范围是什么？'] } : { state: 'failed', questions: [], error: gate.error } });
      return gate;
    },
  };
  return { service, controls: { ...store.controls,
    nextReply: (scenario: ReplyScenario) => { nextReply = structuredClone(scenario); },
    interrupt(id: string) {
      const run = runs.get(id); if (!run) return;
      run.cancelled = true; runs.delete(id);
      const generation: Generation = { state: 'interrupted' }; changeMessage(id, run.messageId, { generation });
    },
    dispose() { disposed = true; for (const [id, run] of runs) { run.cancelled = true; changeMessage(id, run.messageId, { generation: { state: 'interrupted' } }); } runs.clear(); },
  } };
}
