import type { ExportArtifact, Id, ISODate, Json, Readable, Result, Revision, SaveStatus } from './common';
/** Versioned project envelope; no imported TipTap types at the contract boundary. */
export interface NoteNode { type: string; text?: string; attrs?: Record<string, Json>; marks?: { type: string; attrs?: Record<string, Json> }[]; content?: NoteNode[] }
export interface LegacyNoteContent { format: 'paperpane-richtext'; schemaVersion: 1; doc: NoteNode }
/** Markdown is canonical; images refer to immutable FileStore assets by hash. */
export interface MarkdownNoteContent { format: 'paperpane-markdown'; schemaVersion: 1; markdown: string }
export type NoteContent = LegacyNoteContent | MarkdownNoteContent;
export interface NoteVersion { revision: Revision; content: NoteContent; updatedAt: ISODate }
export interface NoteConflict { id: Id; baseRevision: Revision; local: NoteVersion; remote: NoteVersion }
export interface NoteState {
  documentId: Id;
  committed: NoteVersion;
  draft: NoteContent;
  editVersion: number;
  save: SaveStatus;
  conflict?: NoteConflict;
  /** Retained on resolution; choosing one version does not destroy the other. */
  history: readonly NoteVersion[];
}
export interface NoteService extends Readable<NoteState> {
  /** UI calls on every edit. Service owns autosave and status; commit also supports explicit retry. */
  edit(content: NoteContent): Result<void>;
  commit(expectedRevision: Revision): Promise<Result<NoteVersion>>;
  resolve(conflictId: Id, resolution: { kind: 'local' | 'remote' } | { kind: 'merged'; content: NoteContent }): Promise<Result<NoteVersion>>;
  exportMarkdown(): Promise<Result<ExportArtifact>>;
}
export const emptyNote = (): NoteContent => ({ format: 'paperpane-richtext', schemaVersion: 1, doc: { type: 'doc', content: [{ type: 'paragraph' }] } });
