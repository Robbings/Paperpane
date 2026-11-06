import type { AppError, Id, ISODate, Readable, RecordStamp, Result, Revision, SaveStatus } from './common';
import type { DocumentAnchor, DocumentRef, SelectionSnapshot } from './document';
export interface ModelOption {
  id: Id; displayName: string; providerId: Id; providerName: string;
  /** Display-only origin; never include keys, query strings or userinfo. */
  endpointOrigin: string;
  capabilities: { webSearch?: boolean; vision: boolean; reasoningLevels: readonly string[] };
}
export interface ModelSnapshot { modelId: Id; displayName: string; providerId: Id; providerName: string }
export interface ImageAttachment { id: Id; assetId: Id; mimeType: 'image/png' | 'image/jpeg' | 'image/webp'; name: string; anchor: DocumentAnchor }
export interface SourceCitation { id: Id; label: string; quote: string; anchor: DocumentAnchor }
export type Generation =
  | { state: 'queued' | 'running' | 'completed' | 'stopped' | 'interrupted' }
  | { state: 'failed' | 'save-failed'; error: AppError };
export interface ChatMessage {
  id: Id;
  /** Immutable history tree: edit/retry creates a sibling, never replaces paid output. */
  parentId: Id | null;
  role: 'user' | 'assistant'; markdown: string; attachments: readonly ImageAttachment[];
  citations: readonly SourceCitation[];
  createdAt: ISODate; model?: ModelSnapshot; generation?: Generation; save: SaveStatus;
}
export interface ChatDraft { text: string; attachments: readonly ImageAttachment[] }
export type ExplanationSource = { kind: 'text'; selection: SelectionSnapshot } | { kind: 'image'; attachment: ImageAttachment };
export interface Conversation extends RecordStamp {
  title: string; documents: readonly DocumentRef[]; explanation?: ExplanationSource;
  modelId: Id; messages: readonly ChatMessage[]; activeLeafId: Id | null;
  draft: ChatDraft; draftSave: SaveStatus;
  suggestions: { state: 'idle' | 'loading' | 'ready' | 'failed'; questions: readonly string[]; error?: AppError };
}
export interface ConversationState { sessions: readonly Conversation[]; models: readonly ModelOption[] }
export interface ModelChangeConfirmation {
  id: Id; sessionId: Id; sessionRevision: Revision; expiresAt: ISODate;
  target: ModelOption;
  disclosure: { messageCount: number; imageCount: number; documents: readonly DocumentRef[] };
}
export interface ConversationService extends Readable<ConversationState> {
  create(input: { title: string; documents: readonly DocumentRef[]; modelId: Id; explanation?: ExplanationSource }): Promise<Result<Conversation>>;
  rename(sessionId: Id, title: string): Promise<Result<void>>;
  remove(sessionId: Id): Promise<Result<void>>;
  /** Publish the draft to getSnapshot() and notify subscribers synchronously, before
   * this call returns its Promise (never await persistence before publication).
   * Live services debounce durable writes, preserve newer edits when a write completes,
   * and expose editing/saving/saved/failed via draftSave. Flush at owner/navigation
   * boundaries; a scheduled write is not saved. Cross-device draft merging is not required. */
  setDraft(sessionId: Id, draft: ChatDraft): Promise<Result<void>>;
  /** Accept against the current branch/model and retained parent; draft/title/suggestion
   * changes alone must not invalidate a pending send. Preserve a newer draft. */
  send(sessionId: Id, input: ChatDraft, parentId: Id | null): Promise<Result<Id>>;
  editQuestion(sessionId: Id, messageId: Id, input: ChatDraft): Promise<Result<Id>>;
  regenerate(sessionId: Id, assistantMessageId: Id): Promise<Result<Id>>;
  stop(sessionId: Id): Promise<Result<void>>;
  selectBranch(sessionId: Id, leafId: Id): Promise<Result<void>>;
  changeModel(sessionId: Id, modelId: Id): Promise<Result<{ state: 'applied' } | { state: 'confirmation-required'; confirmation: ModelChangeConfirmation }>>;
  confirmModelChange(confirmationId: Id): Promise<Result<void>>;
  suggest(sessionId: Id): Promise<Result<void>>;
}
/** Active transcript only. All other branches remain in messages. Throws on corrupt graphs. */
export function visibleMessages(session: Conversation): ChatMessage[] {
  const index = new Map(session.messages.map((message) => [message.id, message]));
  const path: ChatMessage[] = []; const visited = new Set<Id>();
  let id = session.activeLeafId;
  while (id !== null) {
    if (visited.has(id)) throw new Error('Cyclic conversation history');
    visited.add(id);
    const message = index.get(id);
    if (!message) throw new Error('Missing conversation ancestor');
    path.unshift(message); id = message.parentId;
  }
  return path;
}
/** Siblings are selectable versions; UI can show “2 / 3”. */
export function messageVersions(session: Conversation, messageId: Id): readonly ChatMessage[] {
  const message = session.messages.find((item) => item.id === messageId);
  return message ? session.messages.filter((item) => item.parentId === message.parentId && item.role === message.role) : [];
}

/** Newest retained leaf below a version (including itself). Null if the version is absent.
 * Compare creation times; ties use later message-array order. Does not change the session.
 * Throws on cyclic descendant graphs, matching visibleMessages' corruption policy. */
export function latestLeaf(session: Conversation, messageId: Id): Id | null {
  const root = session.messages.find((message) => message.id === messageId);
  if (!root) return null;
  const children = new Map<Id, ChatMessage[]>();
  const order = new Map(session.messages.map((message, index) => [message.id, index]));
  for (const message of session.messages) {
    if (message.parentId === null) continue;
    const siblings = children.get(message.parentId) ?? [];
    siblings.push(message); children.set(message.parentId, siblings);
  }
  const pending = [root]; const visited = new Set<Id>();
  let latest: ChatMessage | undefined;
  while (pending.length) {
    const message = pending.pop()!;
    if (visited.has(message.id)) throw new Error('Cyclic conversation history');
    visited.add(message.id);
    const descendants = children.get(message.id);
    if (descendants?.length) { pending.push(...descendants); continue; }
    const time = Date.parse(message.createdAt);
    const previous = latest ? Date.parse(latest.createdAt) : -Infinity;
    if (!latest || time > previous || (time === previous && order.get(message.id)! > order.get(latest.id)!)) latest = message;
  }
  return latest?.id ?? null;
}

/** Ephemeral display URL, not part of persisted message/asset records. */
export interface AttachmentPreview { leaseId: Id; url: string }
export interface AttachmentPreviewService {
  acquire(assetId: Id): Promise<Result<AttachmentPreview>>;
  /** Host releases on preview unmount/change; live service revokes its blob URL. */
  release(leaseId: Id): void;
}
