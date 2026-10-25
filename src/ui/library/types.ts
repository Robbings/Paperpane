// View models for the library UI: what the screens need, not how data is
// stored. The logic layer maps contract types onto these.

export interface PaperView {
  id: string;
  title: string;
  authors: string[];
  year?: number;
  venue?: string;
  abstract?: string;
  /** ISO 8601. */
  addedAt: string;
  lastReadAt?: string;
  /** Starred by the reader: a quick "favourite" mark. */
  starred: boolean;
  tagIds: string[];
  /** null = top level of the library. */
  folderId: string | null;
  pageCount?: number;
  annotationCount: number;
  /** 0–1 of the paper read so far, when known. */
  progress?: number;
  shortNote?: string;
  source: 'local' | 'web';
  /** False for entries imported from a bibliography without a PDF yet. */
  hasPdf: boolean;
}

export interface FolderView {
  id: string;
  name: string;
  parentId: string | null;
}

export interface TagView {
  id: string;
  label: string;
}

/** Where the list is drawn from. */
export type Collection =
  | { kind: 'all' }
  | { kind: 'recent' }
  | { kind: 'unfiled' }
  | { kind: 'folder'; folderId: string };

export type ColumnId = 'starred' | 'title' | 'authors' | 'year' | 'venue' | 'addedAt' | 'lastReadAt' | 'tags' | 'pages';

export type SearchField = 'title' | 'authors' | 'abstract' | 'venue' | 'note' | 'body' | 'summary';

export interface LibraryQuery {
  collection: Collection;
  text: string;
  fields: SearchField[];
  /** Only starred papers. */
  starredOnly: boolean;
  /** A paper matches when it has any of these tags. */
  tagIds: string[];
  sort: { column: ColumnId; direction: 'asc' | 'desc' };
  page: number;
  pageSize: 10 | 20 | 50 | 100;
}

export interface LibraryViewPreferences {
  mode: 'compact' | 'detailed';
  visibleColumns: ColumnId[];
  columnWidths: Partial<Record<ColumnId, number>>;
}
