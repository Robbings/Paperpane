import type { Id, Json, Readable, RecordStamp, Result } from './common';
import type { DocumentRef } from './document';

export type BibliographicField = 'title' | 'authors' | 'year' | 'venue' | 'doi' | 'abstract';
/** Local extraction only; no external lookup or model call. Missing means unknown. */
export interface PdfBibliography {
  version: number;
  title?: string; authors?: string[]; year?: number; venue?: string; doi?: string; abstract?: string;
  sources: Partial<Record<BibliographicField, 'pdf-metadata' | 'first-page'>>;
}

/** Durable library identity is independent of the optional PDF identity/version. */
export interface LibraryItem extends RecordStamp {
  title: string;
  authors: string[];
  year?: number;
  venue?: string;
  abstract?: string;
  shortNote?: string;
  doi?: string;
  document?: DocumentRef;
  /** Sparse unique index, also usable without deserializing the reference. */
  documentId?: Id;
  source: 'local' | 'web';
  inLibrary: boolean;
  addedAt: string;
  starred: boolean;
  folderId: Id | null;
  tagIds: Id[];
  /** Original CSL data retains author structure, volume, pages, identifiers, etc. */
  citation?: Record<string, Json>;
  bibliographyKey?: string;
  editedFields?: string[];
  metadataSources?: PdfBibliography['sources'];
}
export interface LibraryFolder extends RecordStamp { name: string; parentId: Id | null }
export interface LibraryTag extends RecordStamp { label: string; normalized: string }
export interface LibraryTagInput { id?: Id; label: string }
export type LibraryField = 'title' | 'authors' | 'abstract' | 'venue' | 'note' | 'body' | 'summary';
export type LibraryColumn = 'starred' | 'title' | 'authors' | 'year' | 'venue' | 'addedAt' | 'lastReadAt' | 'tags' | 'pages';
export type LibraryCollection = { kind: 'all' | 'recent' | 'starred' | 'unfiled' } | { kind: 'folder'; folderId: Id };
export interface LibraryQuery {
  collection: LibraryCollection; text: string; fields: LibraryField[]; tagIds: Id[];
  sort: { column: LibraryColumn; direction: 'asc' | 'desc' };
}
export interface LibraryPreferences {
  mode: 'compact' | 'detailed'; visibleColumns: LibraryColumn[];
  columnWidths: Partial<Record<LibraryColumn, number>>;
  sidebarOpen?: boolean; detailOpen?: boolean;
}
export type LibraryPatch = Partial<Pick<LibraryItem, 'title' | 'authors' | 'year' | 'venue' | 'abstract' | 'shortNote'>>;
export interface LibraryCounts { all: number; recent: number; starred: number; unfiled: number; folders: Record<Id, number> }
export interface LibraryRow extends LibraryItem {
  lastReadAt?: string; pageCount?: number; progress?: number; hasPdf: boolean;
  /** No live annotation store yet: omit rather than invent a count. */
  annotationCount?: number;
}
export interface LibraryState {
  items: readonly LibraryRow[]; total: number; folders: readonly LibraryFolder[]; tags: readonly LibraryTag[];
  counts: LibraryCounts; query: LibraryQuery; preferences: LibraryPreferences;
  unavailableSearchFields: readonly LibraryField[];
}
export interface LibraryService extends Readable<LibraryState> {
  setQuery(patch: Partial<LibraryQuery>): void;
  loadMore(): void;
  /** Baseline permits merging disjoint field edits, never overwriting a changed field. */
  update(id: Id, expectedRevision: string, patch: LibraryPatch, baseline?: LibraryPatch): Promise<Result<void>>;
  star(ids: readonly Id[], starred: boolean): Promise<Result<void>>;
  /** All selected starred → clear all; otherwise star all. Decided from current stored values. */
  toggleStars(ids: readonly Id[]): Promise<Result<void>>;
  move(ids: readonly Id[], folderId: Id | null): Promise<Result<void>>;
  addTag(ids: readonly Id[], tag: LibraryTagInput): Promise<Result<void>>;
  /** Tags and memberships commit together; invalid input leaves the whole batch unchanged. */
  addTags(ids: readonly Id[], tags: readonly LibraryTagInput[]): Promise<Result<void>>;
  removeTag(id: Id, tagId: Id): Promise<Result<void>>;
  /** Membership only: leaves the PDF, item identity and research records intact. */
  remove(ids: readonly Id[]): Promise<Result<readonly { id: Id; revision: string }[]>>;
  restore(items: readonly { id: Id; revision: string }[]): Promise<Result<void>>;
  createFolder(id: Id, parentId: Id | null): Promise<Result<void>>;
  renameFolder(id: Id, name: string): Promise<Result<void>>;
  moveFolder(id: Id, parentId: Id | null): Promise<Result<void>>;
  deleteFolder(id: Id): Promise<Result<void>>;
  setPreferences(patch: Partial<LibraryPreferences>): Promise<Result<void>>;
}

export type LibraryImportSource =
  | { kind: 'pdf' | 'bibtex' | 'csl'; file: File }
  | { kind: 'url'; url: string };
export interface LibraryImportJob {
  id: Id; title: string; folderId: Id | null;
  phase: 'queued' | 'reading' | 'validating' | 'password-required' | 'saving' | 'completed' | 'failed' | 'cancelled';
  progress?: { completed: number; total?: number; unit: 'bytes' | 'pages' };
  passwordRequest?: { requestId: Id; incorrect: boolean };
  added?: number; reused?: number; error?: string;
}
