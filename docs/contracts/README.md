# Paperpane UI contracts

Status: proposed, pending review. These interfaces are an integration boundary, not a claim that PDF processing, durable storage or synchronization has shipped.

- `src/contracts/`: portable project DTOs and service interfaces. No UI or third-party message types.
- `src/contracts/demo/`: explicitly disposable, in-memory services. Never used as production storage. The barrel deliberately excludes notes so document/annotation consumers do not load the editor. Import `demo/notes` only from a lazy-loaded note panel, or use `await import('@/contracts/demo/notes')` when opening it.
- `src/runtime/use-contract.ts`: React subscription bridge.
- `src/domain/notes/codec.ts`: lazily loaded, shared note schema and Markdown export.

## Using a service

```tsx
import { createDemoNotes } from '@/contracts/demo/notes';
import { useContract } from '@/runtime/use-contract';

// Create once, outside rendering, or in a stable owner. Do not recreate per keystroke.
const { service, controls } = createDemoNotes('demo-document');
controls.setDelay(250);
// In a component:
const snapshot = useContract(service);
// Always show a visible demo badge when snapshot.mode === 'demo'.
// Editor update: service.edit(content).
// Debounced save: service.commit(service.getSnapshot().data.committed.revision).
```

Snapshots are immutable and identity-stable between notifications. `subscribe` returns cleanup, does not immediately invoke, and never controls task lifetime. Every service exposes a snapshot with `loading`, `ready`, `partial` or `failed`; `ready` plus an empty list means empty UI. A failed snapshot may retain usable data. Errors include a stable code, user-facing fallback message and allowed recovery actions. UI localizes codes and wires actions to the corresponding service method; do not infer actions from message text.

Operations return `Result<T>` for expected failures. The caller must inspect `ok`; a rejected permission or a stale revision is not success. Callbacks should not throw. Demo controls support delayed operations, `failNext`, and explicit load states. No network calls or real files are read. Export methods produce an artifact; the page integration layer performs clipboard/download under the user gesture and reports those separate failures. A generated string is not a successful clipboard write.

`local` and `sync` are independent. Demo `saved` means only the simulated transition: always pair with the demo label. Live `saved` must mean a committed durable transaction, not merely a scheduled write. Live service implementations remain future work. Data clearing must distinguish regenerable cache from documents, notes, annotations and paid AI output.

## Contract review order

1. Documents/import, anchors, annotations and notes (this proposal).
2. Conversation/explanation contracts and assistant-ui demo bridge.
3. Library contracts before library implementation.
4. Overview/citations before those panels are connected.

Shared contracts require user confirmation before merging. UI and service implementations follow the same approved version. The current reader stays on its existing sample state until a separate integration change; no UI files are changed here.
