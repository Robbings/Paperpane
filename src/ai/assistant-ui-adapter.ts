import { MessageNotSentError, type AppendMessage, type ExternalStoreAdapter, type ThreadMessageLike } from '@assistant-ui/react';
import type { AppError, Result } from '../contracts/common';
import { failure } from '../contracts/common';
import type { ChatDraft, ChatMessage, ConversationService } from '../contracts/conversation';
import { visibleMessages } from '../contracts/conversation';

export interface ConversationAdapterFailure {
  error: AppError;
  operation: 'send' | 'edit' | 'regenerate' | 'stop' | 'draft';
  /** Keep rejected edit text available to the UI; the SDK closes its edit composer on submit. */
  rejectedInput?: ChatDraft;
  messageId?: string;
}
export function toAssistantMessage(message: ChatMessage): ThreadMessageLike {
  const generation = message.generation;
  const status: ThreadMessageLike['status'] = message.role === 'user' ? undefined
    : generation?.state === 'queued' || generation?.state === 'running' ? { type: 'running' }
    : generation?.state === 'stopped' ? { type: 'incomplete', reason: 'cancelled' }
    : generation?.state === 'interrupted' ? { type: 'incomplete', reason: 'other' }
    : generation?.state === 'failed' || generation?.state === 'save-failed' ? { type: 'incomplete', reason: 'error', error: generation.error.message }
    : { type: 'complete', reason: 'stop' };
  return { id: message.id, role: message.role, content: message.markdown, createdAt: new Date(message.createdAt), status,
    metadata: { custom: { paperpane: message } } };
}
/** Pure mapping. Only this module knows assistant-ui message shapes. */
export function createConversationAdapter(
  service: ConversationService,
  sessionId: string,
  onError: (failure: ConversationAdapterFailure) => void,
): ExternalStoreAdapter<ChatMessage> {
  const snapshot = service.getSnapshot();
  const session = snapshot.data.sessions.find((item) => item.id === sessionId && !item.deletedAt);
  const messages = session ? visibleMessages(session) : [];
  const isRunning = session?.messages.some((message) => message.generation?.state === 'running' || message.generation?.state === 'queued') ?? false;
  const current = () => service.getSnapshot().data.sessions.find((item) => item.id === sessionId && !item.deletedAt);
  const accept = <T>(result: Result<T>, operation: ConversationAdapterFailure['operation'], rejectedInput?: ChatDraft, messageId?: string) => {
    if (!result.ok) {
      onError({ error: result.error, operation, rejectedInput, messageId });
      throw new MessageNotSentError(result.error.message);
    }
  };
  function input(message: AppendMessage, attachments: ChatDraft['attachments']): Result<ChatDraft> {
    if (message.role !== 'user' || message.content.some((part) => part.type !== 'text') || message.attachments?.length) return failure('UNSUPPORTED_CONTENT', '请通过论文框选附件入口添加图片');
    return { ok: true, value: { text: message.content.map((part) => part.type === 'text' ? part.text : '').join('\n'), attachments } };
  }
  return {
    messages, convertMessage: toAssistantMessage,
    isRunning, isSendDisabled: isRunning,
    isLoading: snapshot.state === 'loading', isDisabled: !session || snapshot.state === 'failed' || snapshot.state === 'loading',
    suggestions: session?.suggestions.questions.map((prompt) => ({ prompt })),
    onNew: async (message) => {
      const draft = input(message, current()?.draft.attachments ?? []);
      if (!draft.ok) { accept(draft, 'send'); return; }
      accept(await service.send(sessionId, draft.value, message.parentId), 'send', draft.value);
    },
    onEdit: async (message) => {
      const original = current()?.messages.find((item) => item.id === message.sourceId);
      if (!original) { accept(failure('NOT_FOUND', '待编辑的问题不存在'), 'edit'); return; }
      const draft = input(message, original.attachments);
      if (!draft.ok) { accept(draft, 'edit'); return; }
      accept(await service.editQuestion(sessionId, original.id, draft.value), 'edit', draft.value, original.id);
    },
    onReload: async (parentId) => {
      const latest = current();
      const answer = latest && visibleMessages(latest).find((item) => item.role === 'assistant' && item.parentId === parentId);
      if (!answer) { accept(failure('NOT_FOUND', '待重新生成的回答不存在'), 'regenerate'); return; }
      accept(await service.regenerate(sessionId, answer.id), 'regenerate');
    },
    onCancel: async () => { accept(await service.stop(sessionId), 'stop'); },
    // No setMessages/onDelete: the SDK must not rewrite or discard our history tree.
    // Version selection uses messageVersions + latestLeaf + service.selectBranch in the host UI.
  };
}
