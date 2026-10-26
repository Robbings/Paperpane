# Conversation and explanation contracts

Status: proposal, depends on the reading contracts. Runtime implementation here is explicitly in-memory demo mode. No provider SDK, model HTTP request, backend, database or cloud chat service is connected.

## Model and session boundaries

A session has stable identity, title, document/version refs, model ID, draft, suggestions and a message tree. More than one document means a multi-paper session; its actual retrieval is later work. Explanation is a session with a text selection or a document image attachment as source. Lists filter sessions by `explanation` presence; source, title and timestamps are directly available. Renaming does not modify messages. Deletion marks the session and stops its current demo run; retained messages are not silently erased.

ModelOption exposes capabilities and display origin only, never credentials. Message model snapshots preserve the model/provider used for that answer even after switching. Image sources reference durable asset IDs; preview URLs are temporary products of the future asset service, not stored in messages. All references use the same document/version/page anchor and locate/projection service as annotations.

## History and versions

Messages form a tree with parent IDs. New questions follow an assistant message (or null for a new conversation); answers follow a user question. `visibleMessages(session)` gives the active transcript. Editing a question creates a sibling question and a new answer. Regenerating creates a sibling answer under the same question. Old answers and downstream conversations remain in the tree, including cancelled/partial paid output.

Use `messageVersions(session, messageId)` for a version selector, and `latestLeaf(session, selectedMessageId)` to find its most recently created retained descendant leaf. Pass that ID to `selectBranch(sessionId, leafId)` to restore the downstream conversation. Ties use later message-array order; a missing version returns null. Calling `selectBranch` directly with an internal node still deliberately ends the transcript there. Do not truncate the stored message array. Selection/edit/regeneration/model changes are disabled during generation. The service rejects conflicting commands even if UI controls fail to disable them.

All actual generated content must eventually be committed incrementally by the live service, including stopped/interrupted/failed partial output. Generation state and save state are separate. No automatic resubmission on reload: recovering an interrupted job must not silently charge again. A failed save shows save-failed, retains the output in memory for recovery, and is not “saved”. These are requirements for the future live implementation, not guarantees provided by the demo.

## States and errors

- queued → running → completed; stop keeps the current content and yields stopped.
- interrupted represents a lost execution context; never show it as completed.
- failed/save-failed carry structured errors and allowed recovery actions. Retry creates another preserved version, not an overwrite.
- Operations return Result. A send returns the accepted answer ID before streaming finishes. Listen to snapshots for subsequent output. Acceptance checks the active branch, model and retained parent; draft edits, title changes and suggestion loading/completion alone never invalidate it. A draft typed after submission must survive acceptance.
- Suggestions have idle/loading/ready/failed plus at most three questions. They are data, not automatically sent messages.
- Draft text and screenshot asset refs belong to each session. `setDraft` must update `getSnapshot()` and notify listeners **synchronously before returning its Promise**, not after awaiting storage. The hook forwards every edit immediately; it does not debounce publication.
- The live service debounces/coalesces durable draft writes separately, captures the edit version being saved, and never replaces a newer in-memory draft when an older write completes. Expose editing/saving/saved/failed in `draftSave`; queued writes are not saved. Flush pending writes at service-owner/session-navigation boundaries; the persistence implementation must define page-close recovery rather than rely solely on a debounced timer. Cross-device merging is not required. The current demo has no durable writes to debounce; its drafts last only for the instance.

## Changing provider

`changeModel` applies changes within one provider immediately, but returns confirmation-required for another provider. The confirmation includes provider/interface name, origin, current visible message count, image count and document versions. The disclosure includes the draft and explanation screenshot as applicable; documents describe potentially supplied context, not an already-uploaded file. The demo never sends any data.

UI renders the returned disclosure and calls `confirmModelChange(id)` only after explicit user confirmation. Confirmation is single-use, expires after five minutes and is invalidated by a session revision change. Editing a draft or receiving another message therefore requires a fresh disclosure. BUSY does not consume the confirmation, though a subsequent revision change/expiry still invalidates it. Declining leaves the original model selected; do not call confirm. The live service must derive the disclosure from the actual outbound context and provider configuration revision before sending. Existing results retain their recorded provider.

## assistant-ui integration

The only SDK-facing code is `src/ai/assistant-ui-adapter.ts` and `use-conversation-runtime.ts`. The contract has no SDK message types. The adapter supports primitives for transcript, composer, send, cancel, question editing and regeneration. It maps project statuses to SDK statuses and leaves the complete project message in `metadata.custom.paperpane` for model/citation/save-status rendering. UI may alternatively look up the typed message by ID in the contract snapshot.

```tsx
import { AssistantRuntimeProvider } from '@assistant-ui/react';
import { useConversationRuntime } from '@/ai/use-conversation-runtime';

// Parent: <ConversationPanel key={sessionId} service={service} sessionId={sessionId} />
function ConversationPanel({ service, sessionId }) {
  const { runtime, session, snapshot, failure, clearFailure } = useConversationRuntime(service, sessionId);
  // Show demo badge for snapshot.mode === 'demo'.
  // Render failure.error, and retain failure.rejectedInput for a rejected question edit.
  // Compose your own primitives, citation cards, attachment previews and version controls.
  return <AssistantRuntimeProvider runtime={runtime}>{/* Reader UI */}</AssistantRuntimeProvider>;
}
```

One provider is keyed by session ID; changing the service or session without remounting is rejected to prevent SDK history leaking across sessions. Service instances live above these providers. Unmounting a panel unsubscribes but does not stop tasks or discard drafts. Only the owner disposes demo services.

The draft bridge ignores the SDK's early clearing during send. The service clears the matching draft only after accepting the request. A rejected send throws the SDK's MessageNotSentError so its composer can restore text; a rejected edit is exposed separately because the SDK closes its editor at submission. Do not swallow that failure. An attempted edit is available in failure.rejectedInput until explicitly cleared.

Version switching intentionally uses our `messageVersions` / `latestLeaf` / `selectBranch`, not SDK BranchPicker or `setMessages`: the SDK must not delete history as a side effect of cancelling/editing. Host session lists use the service, not the optional SDK cloud/thread-list adapters. Image attachment selection/previews use our document-region attachment DTOs and the page's asset UI, not arbitrary SDK uploads. Generic SDK file uploads and non-text composer parts are rejected explicitly, never silently dropped. For image-only questions, the host can call service.send directly; the standard text composer needs text to enable its send control. Editing question text retains its original screenshot attachments.

Source navigation calls AnchorService.locate(citation.anchor); never trust a generated page-number string as a verified citation. The live grounding pipeline is responsible for verifying citations before emitting them. Demo citations are explicitly supplied fixtures.

## Demo scenarios

```ts
const demo = createDemoConversations();
demo.controls.setDelay(120); // each stream checkpoint, not real provider throughput
demo.controls.nextReply({ text: '演示输出', failAfterChunks: 1 });
// service.create(...) -> service.setDraft(...) -> service.send(...)
demo.controls.interrupt(sessionId); // retain partial output, mark interrupted
// demo.controls.failNext({ code: 'SAVE_FAILED', message: '演示保存失败', recovery: ['retry'] });
// demo.controls.setLoadState('partial', error);
```

Calls to failNext affect the next async operation/checkpoint. setDraft publishes synchronously in the demo so rapid input never completes out of order; it does not simulate durable writes. `dispose` invalidates stream timers and marks active outputs interrupted. Metadata-only fixture operations are not a persistence engine.

## Attachment previews

Use `AttachmentPreviewService.acquire(assetId)` to obtain a temporary preview URL. The UI releases the lease when it unmounts or the asset changes, including when an earlier asynchronous acquire completes after unmount. URLs must not be copied into saved messages. A live service reads local assets and manages blob URLs; `createDemoAttachmentPreviews` only accepts explicitly supplied PNG/JPEG/WebP data URLs and never fetches a remote image. Missing images return FILE_MISSING so the panel can show an unavailable-attachment state. Screenshot capture and durable asset storage remain future work.
