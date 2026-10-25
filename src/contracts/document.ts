import type { AppError, Id, ISODate, Readable, RecordStamp, Result, SaveStatus } from './common';
export interface DocumentRef { documentId: Id; fileVersion: Id }
/** Unrotated PDF crop-box coordinates in points, origin bottom-left. */
export interface PdfRect { x: number; y: number; width: number; height: number }
export interface PageAnchor {
  pageIndex: number;
  rects: readonly PdfRect[];
  quote?: { exact: string; prefix?: string; suffix?: string };
}
export interface DocumentAnchor extends DocumentRef { pages: readonly PageAnchor[] }
/** Captured by the document engine, NOT synthesized from screen coordinates by UI. */
export interface SelectionSnapshot { anchor: DocumentAnchor; text: string }
export interface ViewRect { left: number; top: number; width: number; height: number }
export type Projection =
  | { state: 'ready'; accuracy: 'exact' | 'approximate'; viewportRevision: string; rects: readonly { pageIndex: number; rect: ViewRect }[] }
  | { state: 'pending'; pageIndexes: readonly number[] }
  | { state: 'unavailable'; error: AppError };
export type LocateResult = { state: 'exact' | 'approximate'; anchor: DocumentAnchor } | { state: 'unavailable'; error: AppError };
export interface AnchorService {
  locate(anchor: DocumentAnchor): Promise<LocateResult>;
  /** CSS viewport pixels, suitable for position:fixed; never persist these rects. */
  project(anchor: DocumentAnchor): Projection;
  subscribeViewport(listener: () => void): () => void;
}
export interface ReadingPosition { pageIndex: number; offset: number; zoom: number; rotation: 0 | 90 | 180 | 270 }
export type FileAvailability = 'local' | 'uploading' | 'uploaded' | 'remote-missing' | 'local-missing';
export interface DocumentRecord extends RecordStamp, DocumentRef {
  title: string; sourceUrl?: string; pageCount?: number;
  file: { assetId: Id; sha256?: string; availability: FileAvailability };
  /** A source URL alone is not a backup. */
  syncScope: 'record-only' | 'record-and-file';
  position?: ReadingPosition; lastReadAt?: ISODate; save: SaveStatus;
}
export type ImportSource = { kind: 'local'; file: File } | { kind: 'url'; url: string; intent: 'browse' | 'import' };
export type DocumentPhase = 'reading' | 'validating' | 'extracting' | 'password-required' | 'readable' | 'partial' | 'no-text' | 'failed' | 'cancelled';
export interface ImportJob {
  id: Id; title: string; phase: DocumentPhase; document?: DocumentRef;
  /** Progress belongs to one phase. Omit total when it cannot be measured. */
  progress?: { completed: number; total?: number; unit: 'bytes' | 'pages' };
  passwordRequest?: { requestId: Id; incorrect: boolean };
  error?: AppError;
}
export interface DocumentState { documents: readonly DocumentRecord[]; jobs: readonly ImportJob[]; recentIds: readonly Id[] }
export interface DocumentService extends Readable<DocumentState> {
  /** Resolves once accepted, not once parsing is finished. Observe jobs by ID. */
  importDocument(source: ImportSource): Promise<Result<Id>>;
  submitPassword(jobId: Id, requestId: Id, password: string): Promise<Result<void>>;
  cancel(jobId: Id): Promise<Result<void>>;
  retry(jobId: Id): Promise<Result<void>>;
  recordReading(ref: DocumentRef, position: ReadingPosition): Promise<Result<void>>;
}
