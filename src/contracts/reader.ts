import type { AppError, Id, Readable, Result } from './common';
import type { DocumentRef, Projection, ReadingPosition, SelectionSnapshot } from './document';

/** Runtime reading state, separate from import jobs and durable document records. */
export type ReaderPhase = 'empty' | 'loading' | 'password-required' | 'ready' | 'failed';
export interface ReaderSelection {
  /** New for each capture; actions must reject an obsolete id, never use a later selection. */
  id: Id;
  snapshot: SelectionSnapshot;
  /** Positioning only. Recompute through AnchorService after geometry changes. */
  projection: Projection & { space: 'viewport' };
}
export interface ReaderOutlineItem {
  id: Id; title: string; depth: number;
  /** Unresolved destinations are not silently mapped to page zero. */
  pageIndex?: number;
}
export interface ReaderState {
  /** Changes when opening/closing a document, even when opening the same file again. */
  sessionId: Id;
  document: DocumentRef | null;
  phase: ReaderPhase;
  pageCount: number;
  position: ReadingPosition;
  selection: ReaderSelection | null;
  outline: readonly ReaderOutlineItem[];
  passwordRequest?: { requestId: Id; incorrect: boolean };
  error?: AppError;
}
/** UI commands. Opening bytes/mounting DOM/disposal belong to the runtime owner, not this DTO API. */
export interface ReaderService extends Readable<ReaderState> {
  navigate(pageIndex: number): Promise<Result<void>>;
  /** 1 means 100% at 96 CSS pixels/inch. */
  setZoom(zoom: number): Result<void>;
  setRotation(rotation: ReadingPosition['rotation']): Result<void>;
  /** Returns the captured selection even if a menu took focus. Reject stale session/file/id. */
  resolveSelection(id: Id): Result<SelectionSnapshot>;
  dismissSelection(id: Id): void;
  submitPassword(requestId: Id, password: string): Result<void>;
}
