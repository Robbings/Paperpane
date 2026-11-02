import type { DocumentAnchor, DocumentRef } from './document';
/** UTF-16 offsets into normalized source text. Rectangles remain crop-relative PDF points. */
export interface SourceSpan { start: number; end: number; pageIndex: number; rect: { x: number; y: number; width: number; height: number } }
export interface TranslationSentence {
  id: string; paragraphId: string; source: string;
  kind: 'heading' | 'text' | 'formula' | 'figure';
  anchor: DocumentAnchor; approximate: boolean; warnings: string[];
}
export interface ExtractedPaper extends DocumentRef {
  version: string; pageCount: number; sentences: TranslationSentence[]; warnings: string[];
}
export type TranslationEngineKey = string;
export type TranslationEngineRef = { kind: 'llm'; key: TranslationEngineKey } |
  { kind: 'machine'; key: TranslationEngineKey; apiId: string; apiKind: string; adapterVersion: string };
export interface SentenceTranslation { engine?: TranslationEngineKey; format?: 'markdown-math-v1'; inferredMath?: boolean; text: string; state: 'pending' | 'streaming' | 'partial' | 'done' | 'failed'; error?: string }
export interface TranslationAttempt {
  promptVersion?: string; engine?: string; retryRound?: number;
  sessionId?: string; finishedAt?: string; diagnostics?: TranslationDiagnostics;
  id: string; sentenceIds: string[]; raw: string; startedAt: string; configRevision: string;
  state: 'running' | 'complete' | 'partial' | 'failed'; error?: string;
}
/** Only allowlisted, redacted diagnostics. Never store headers, credentials or request bodies here. */
export interface TranslationDiagnostics {
  status?: number; code?: string; type?: string; requestId?: string; responseId?: string;
  message?: string; retryAfterMs?: number; category?: string;
}
export interface TranslationScope { kind: 'document' | 'page' | 'selection'; page?: number; ids?: string[] }
export interface TranslationRun extends DocumentRef {
  parentRunId?: string;
  /** Independent selection records never become the document pane's latest run. */
  selection?: { key: string; text: string; anchor: DocumentAnchor; sourceLanguage: string };
  /** Stable for this user task, including pause/resume/retry. Legacy runs use id. */
  sessionId?: string; scope?: TranslationScope;
  id: string; revision: string; extractionVersion: string; createdAt: string; updatedAt: string;
  profile: { engine?: TranslationEngineRef; modelId: string; modelName: string; endpointId: string; endpointUrl: string; protocol: string; configRevision: string; language: string; sourceLanguage?: string; promptVersion: string };
  phase: 'idle' | 'running' | 'pausing' | 'paused' | 'interrupted' | 'failed' | 'completed';
  requested: string[]; outputs: Record<string, SentenceTranslation>; attempts: TranslationAttempt[];
  error?: string;
}
