import type { ColumnId } from './types';

export const columnLabels: Record<ColumnId, string> = {
  starred: '标星',
  title: '标题',
  authors: '作者',
  year: '年份',
  venue: '期刊 / 会议',
  addedAt: '添加时间',
  lastReadAt: '最近阅读',
  tags: '标签',
  pages: '页数',
};

/** Columns the reader can hide; the title and star are always shown. */
export const optionalColumns: ColumnId[] = ['authors', 'year', 'venue', 'addedAt', 'lastReadAt', 'tags', 'pages'];

export const defaultVisibleColumns: ColumnId[] = ['authors', 'year', 'addedAt'];

/** Fixed widths for every column but the title, which takes the rest. */
export const columnDefaults: Record<ColumnId, { width: number; min: number }> = {
  starred: { width: 44, min: 44 },
  title: { width: 360, min: 220 },
  authors: { width: 168, min: 100 },
  year: { width: 72, min: 64 },
  venue: { width: 180, min: 100 },
  addedAt: { width: 112, min: 96 },
  lastReadAt: { width: 112, min: 96 },
  tags: { width: 150, min: 90 },
  pages: { width: 64, min: 56 },
};

/** Starred papers, newer dates and years come first on the first click. */
export const firstDirection = (column: ColumnId): 'asc' | 'desc' =>
  column === 'starred' || column === 'year' || column === 'addedAt' || column === 'lastReadAt' ? 'desc' : 'asc';

/** Dates in the list: "今天", "昨天", else "2026-10-21". */
export function formatDate(iso: string | undefined, now = new Date()): string {
  if (!iso) return '—';
  const date = new Date(iso);
  const days = Math.floor((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())) / 86_400_000);
  if (days === 0) return '今天';
  if (days === 1) return '昨天';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export const authorLine = (authors: readonly string[], max = 3) =>
  authors.length <= max ? authors.join(', ') : `${authors.slice(0, max).join(', ')} 等`;
