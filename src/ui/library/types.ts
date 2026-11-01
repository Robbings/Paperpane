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
  folderIds?: string[];
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
  | { kind: 'starred' }
  | { kind: 'unfiled' }
  | { kind: 'folder'; folderId: string };

export type ColumnId = 'starred' | 'title' | 'authors' | 'year' | 'venue' | 'addedAt' | 'lastReadAt' | 'tags' | 'pages';

export type SearchField = 'title' | 'authors' | 'abstract' | 'venue' | 'note' | 'body' | 'summary';

export interface LibraryQuery {
  collection: Collection;
  text: string;
  fields: SearchField[];
  /** A paper matches when it has any of these tags. */
  tagIds: string[];
  sort: { column: ColumnId; direction: 'asc' | 'desc' };
}

export interface LibraryViewPreferences {
  mode: 'compact' | 'detailed';
  visibleColumns: ColumnId[];
  columnWidths: Partial<Record<ColumnId, number>>;
  /** Side panes; undefined follows the window width. */
  sidebarOpen?: boolean;
  detailOpen?: boolean;
}

/** One file or link in the import queue, in the order it was added. */
export interface ImportJobView {
  id: string;
  title: string;
  phase: 'queued' | 'reading' | 'validating' | 'password-required' | 'saving' | 'completed' | 'failed' | 'cancelled';
  progress?: { completed: number; total?: number; unit: 'bytes' | 'pages' };
  /** The PDF is locked; incorrect is set after a wrong password. */
  passwordRequest?: { requestId: string; incorrect: boolean };
  /** When completed: papers added, and ones already in the library that were reused. */
  added?: number;
  reused?: number;
  error?: string;
}

/** The import queue and the link import, for the library page. */
export interface LibraryImports {
  jobs: readonly ImportJobView[];
  /** Queues a PDF link; resolves with an error message when it cannot be queued. */
  onImportUrl: (url: string, folderId: string | null) => Promise<string | null>;
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  onPassword: (id: string, requestId: string, password: string) => void;
}
