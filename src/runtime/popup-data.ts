import type { StoredDocument } from '@/data/database';
import type { RecentPaperView } from '@/ui/popup/types';

export function recentPaperViews(documents: readonly StoredDocument[], titles: ReadonlyMap<string, string> = new Map()): RecentPaperView[] {
  return documents.filter(doc => !doc.deletedAt && !!doc.lastReadAt && Number.isFinite(Date.parse(doc.lastReadAt))
    && !['local-missing', 'remote-missing'].includes(doc.file.availability))
    .sort((a, b) => Date.parse(b.lastReadAt!) - Date.parse(a.lastReadAt!) || a.id.localeCompare(b.id)).slice(0, 3)
    .map(doc => {
      const progress = doc.position && doc.pageCount && doc.pageCount > 0 ? (doc.position.pageIndex + doc.position.offset) / doc.pageCount : undefined;
      return { id: doc.id, title: titles.get(doc.id)?.trim() || doc.title, lastReadAt: doc.lastReadAt!,
        progress: typeof progress === 'number' && Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : undefined };
    });
}
