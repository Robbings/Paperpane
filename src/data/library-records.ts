import type { LibraryItem, LibraryPreferences, LibraryQuery, PdfBibliography } from '@/contracts/library';
import type { StoredDocument } from './database';
export const LIBRARY = 'libraryItems', FOLDERS = 'libraryFolders', TAGS = 'libraryTags', PREFERENCES = 'libraryPreferences';
export const libraryDefaults: LibraryPreferences = {
  mode: 'compact', visibleColumns: ['authors', 'year', 'addedAt'], columnWidths: {},
};
export const queryDefaults: LibraryQuery = {
  collection: { kind: 'all' }, text: '', fields: ['title', 'authors', 'abstract', 'venue', 'note'], tagIds: [],
  sort: { column: 'addedAt', direction: 'desc' },
};
export function itemFromDocument(doc: StoredDocument): LibraryItem {
  const item: LibraryItem = {
    id: doc.id, revision: crypto.randomUUID(), createdAt: doc.createdAt, updatedAt: doc.updatedAt,
    title: doc.title, authors: [], documentId: doc.id, document: { documentId: doc.id, fileVersion: doc.fileVersion },
    source: doc.sourceUrl ? 'web' : 'local', inLibrary: !doc.deletedAt && doc.syncScope === 'record-and-file',
    addedAt: doc.createdAt, starred: false, folderId: null, tagIds: [],
  };
  return enrichItem(item, doc.bibliography, doc.title);
}

/** Fill unknown fields only. Explicit user edits (including clearing a field) always win. */
export function enrichItem(item: LibraryItem, bibliography: PdfBibliography | undefined, previousTitle: string): LibraryItem {
  if (!bibliography) return item;
  const next = { ...item, metadataSources: { ...item.metadataSources } };
  const edited = new Set(item.editedFields);
  for (const field of ['title', 'authors', 'year', 'venue', 'doi', 'abstract'] as const) {
    const value = bibliography[field];
    if (value === undefined || edited.has(field)) continue;
    const empty = field === 'authors' ? !item.authors.length : !item[field];
    const fallbackTitle = field === 'title' && item.title === previousTitle && !item.metadataSources?.title && !item.citation;
    if (empty || fallbackTitle) { Object.assign(next, { [field]: value }); next.metadataSources[field] = bibliography.sources[field]; }
  }
  return next;
}

export const itemFolders = (item: Pick<LibraryItem, 'folderId' | 'folderIds'>): string[] => [...new Set([...(item.folderId ? [item.folderId] : []), ...(item.folderIds ?? [])])];
