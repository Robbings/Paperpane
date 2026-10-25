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

/** Columns the reader can hide; the star and title are always shown. */
export const optionalColumns: ColumnId[] = ['authors', 'year', 'venue', 'addedAt', 'lastReadAt', 'tags', 'pages'];

export const defaultVisibleColumns: ColumnId[] = ['authors', 'year', 'addedAt'];

export const columnDefaults: Record<ColumnId, { width: number; min: number; align?: 'end' }> = {
  starred: { width: 40, min: 40 },
  title: { width: 360, min: 200 },
  authors: { width: 160, min: 100 },
  year: { width: 64, min: 56, align: 'end' },
  venue: { width: 180, min: 100 },
  addedAt: { width: 104, min: 88, align: 'end' },
  lastReadAt: { width: 104, min: 88, align: 'end' },
  tags: { width: 150, min: 90 },
  pages: { width: 64, min: 56, align: 'end' },
};

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
