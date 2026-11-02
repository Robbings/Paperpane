import type { AppError, Id, Readable, Result } from './common';
import type { DocumentRef, Projection, ReadingPosition, SelectionSnapshot, DocumentAnchor } from './document';
import type { HighlightColor } from './annotations';

export type ReaderPhase = 'empty' | 'loading' | 'password-required' | 'ready' | 'failed';
export type ReaderTool = 'select' | 'auto-highlight';
export interface ReaderSelection { id: Id; snapshot: SelectionSnapshot; projection: Projection & { space: 'viewport' } }
export type ReaderMenuTarget = { kind: 'selection'; selection: ReaderSelection } | { kind: 'annotation'; annotationId: Id; anchor: DocumentAnchor; /** Absent when the annotation is a comment without a highlight. */ color?: HighlightColor };
export interface ReaderSearchState { query: string; matchCase: boolean; wholeWord: boolean; status: 'idle' | 'searching' | 'done'; total: number; current: number }
export interface ReaderOutlineItem { id: Id; title: string; depth: number; pageIndex?: number }
export interface ReaderState {
  sessionId: Id; document: DocumentRef | null; phase: ReaderPhase; pageCount: number;
  position: ReadingPosition; selection: ReaderSelection | null; menuTarget: ReaderMenuTarget | null;
  tool: ReaderTool; search: ReaderSearchState; outline: readonly ReaderOutlineItem[];
  outlineStatus?: 'loading' | 'native' | 'generated' | 'empty' | 'failed';
  pageLabels?: readonly string[];
  loadProgress?: number;
  /** Unknown until examined; a scanned page must never be labelled selectable before examination. */
  textLayer: 'unknown' | 'available' | 'none' | 'partial';
  passwordRequest?: { requestId: Id; incorrect: boolean }; error?: AppError;
}
export interface ReaderService extends Readable<ReaderState> {
  navigate(pageIndex: number): Promise<Result<void>>;
  setZoom(zoom: number): Result<void>;
  setRotation(rotation: ReadingPosition['rotation']): Result<void>;
  setTool(tool: ReaderTool): void;
  search(query: string, options: { matchCase: boolean; wholeWord: boolean }): void;
  stepSearch(direction: 1 | -1): void;
  closeSearch(): void;
  resolveSelection(id: Id): Result<SelectionSnapshot>;
  dismissMenu(): void;
  dismissSelection(id: Id): void;
  submitPassword(requestId: Id, password: string): Result<void>;
  cancelPassword(requestId: Id): Promise<Result<void>>;
}
