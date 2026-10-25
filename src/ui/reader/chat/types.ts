// View models for the discussion and explanation panels. They follow the
// conversation contract (PR #7) closely; the logic layer maps its snapshot
// onto these, resolving anchors to page labels and assets to preview URLs.

export interface ModelView {
  id: string;
  displayName: string;
  providerId: string;
  providerName: string;
  /** Display-only origin, e.g. "api.example.com". */
  endpointOrigin: string;
  vision: boolean;
}

export interface CitationView {
  id: string;
  /** The marker used in the answer text as [^label], e.g. "1". */
  label: string;
  quote: string;
  /** Resolved from the anchor by the logic layer, e.g. "第 3 页". */
  pageLabel: string;
}

export interface AttachmentView {
  id: string;
  name: string;
  /** A temporary preview URL from the attachment preview service; absent while loading or if missing. */
  previewUrl?: string;
  missing?: boolean;
  pageLabel?: string;
}

export interface ErrorView {
  message: string;
  recovery: readonly ('retry' | 'configure-model' | 'change-model')[];
}

export type GenerationView =
  | { state: 'queued' | 'running' | 'completed' | 'stopped' | 'interrupted' }
  | { state: 'failed' | 'save-failed'; error: ErrorView };

export interface ChatMessageView {
  id: string;
  role: 'user' | 'assistant';
  markdown: string;
  attachments: readonly AttachmentView[];
  citations: readonly CitationView[];
  createdAt: string;
  /** The model that wrote an answer, kept even after switching. */
  model?: { displayName: string; providerName: string };
  generation?: GenerationView;
  /** Position among sibling versions (edits or regenerations), when there is more than one. */
  version?: { index: number; count: number };
}

export interface SessionSummary {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
}

export interface ChatSessionView {
  id: string;
  title: string;
  modelId: string;
  /** The active transcript, oldest first. */
  messages: readonly ChatMessageView[];
  draft: { text: string; attachments: readonly AttachmentView[] };
  draftSaveFailed?: boolean;
  suggestions: { state: 'idle' | 'loading' | 'ready' | 'failed'; questions: readonly string[] };
}

/** What switching to another provider will send, for the confirmation dialog. */
export interface ModelChangeView {
  target: ModelView;
  messageCount: number;
  imageCount: number;
  documents: readonly string[];
}
