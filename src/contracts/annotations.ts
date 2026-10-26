import type { ExportArtifact, Id, Readable, RecordStamp, Result, Revision, SaveStatus } from './common';
import type { DocumentAnchor, DocumentRef, SelectionSnapshot } from './document';
export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink' | 'purple';
export interface Annotation extends RecordStamp {
  anchor: DocumentAnchor;
  kind: 'highlight' | 'selection-comment' | 'page-comment';
  color: HighlightColor; quote: string; comment: string;
  source: { kind: 'user' } | { kind: 'ai'; category: string; resultId: Id };
  save: SaveStatus;
}
export type NewAnnotation =
  | { kind: 'highlight' | 'selection-comment'; selection: SelectionSnapshot; color: HighlightColor; comment?: string }
  | { kind: 'page-comment'; anchor: DocumentAnchor; color: HighlightColor; comment: string };
export interface AnnotationState { document: DocumentRef; items: readonly Annotation[] }
export interface AnnotationService extends Readable<AnnotationState> {
  create(input: NewAnnotation): Promise<Result<Annotation>>;
  update(id: Id, expectedRevision: Revision, patch: { color?: HighlightColor; comment?: string; anchor?: DocumentAnchor }): Promise<Result<Annotation>>;
  remove(id: Id, expectedRevision: Revision): Promise<Result<Annotation>>;
  /** Undo uses the deletion revision, so it cannot silently overwrite a later change. */
  restore(id: Id, expectedRevision: Revision): Promise<Result<Annotation>>;
  export(format: 'markdown' | 'csv'): Promise<Result<ExportArtifact>>;
}

/** Presentation preferences, not PDF geometry. CSS pixel offsets relative to the freshly projected anchor. */
export interface AnnotationNoteLayout { id: Id; dx: number; dy: number; width: number; height: number; collapsed: boolean; open: boolean; z: number }
export interface AnnotationLayoutRecord extends RecordStamp { document: DocumentRef; layout: AnnotationNoteLayout }
