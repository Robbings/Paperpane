import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { createLibraryService } from '@/domain/library/service';
import type { LibraryRow } from '@/contracts/library';
import type { ReaderLibraryProps } from '@/ui/reader/ReaderShell';
import type { LibraryEntryDraft } from '@/ui/reader/library/SaveToLibraryPopover';
import type { PaperView } from '@/ui/library/types';
import { toast } from '@/ui/components';
import type { ReaderController } from './reader-controller';

const asPaper = (row: LibraryRow): PaperView => ({ ...row, annotationCount: row.annotationCount ?? 0 });

/** Library data and actions for the open paper: the toolbar's 收藏 popover and the sidebar's library list. */
export function useReaderLibrary(owner: ReaderController | undefined, onOpenFiles: (files: File[]) => void): ReaderLibraryProps | undefined {
  const library = useMemo(() => createLibraryService(), []);
  useEffect(() => () => { library.dispose(); void library.database.close(); }, [library]);
  const snapshot = useSyncExternalStore(library.service.subscribe, library.service.getSnapshot);
  const document = owner?.document;
  const [item, setItem] = useState<LibraryRow>();
  // The entry follows the open paper and every library change, including other tabs.
  useEffect(() => {
    if (!document) { setItem(undefined); return; }
    let live = true;
    void library.database.getItemForDocument(document.id).then(row => { if (live) setItem(row); }).catch(() => { if (live) setItem(undefined); });
    return () => { live = false; };
  }, [library, document?.id, document?.fileVersion, snapshot]);
  if (!owner || !document || !item) return undefined;
  const data = snapshot.data;
  const tagLabel = new Map(data.tags.map(tag => [tag.id, tag.label]));
  const entry: LibraryEntryDraft = {
    title: item.title || document.title, authors: item.authors, venue: item.venue, year: item.year,
    folderId: item.inLibrary ? item.folderId : null,
    tags: item.inLibrary ? item.tagIds.flatMap(id => tagLabel.has(id) ? [{ id, label: tagLabel.get(id)! }] : []) : [],
  };
  const papers = data.items.map(asPaper);
  const fail = (error: unknown) => toast.show({ tone: 'error', message: error instanceof Error ? error.message : '文献库保存失败，请重试' });
  return {
    saved: item.inLibrary,
    entry,
    currentPaperId: item.id,
    folders: data.folders,
    tags: data.tags,
    papers,
    recent: [...papers].filter(p => p.lastReadAt).sort((a, b) => (b.lastReadAt ?? '').localeCompare(a.lastReadAt ?? '')),
    onSave: (draft, baseline) => {
      const adding = !item.inLibrary;
      void library.mutate(() => library.database.saveDocumentEntry({ documentId: document.id, fileVersion: document.fileVersion }, draft, baseline)).then(result => {
        if (!result.ok) { fail(new Error(result.error.message)); return; }
        setItem(current => current && { ...current, ...result.value.item });
        if (adding) toast.show({ tone: 'success', message: '已加入文献库' });
        // Same as an import with 「添加文档时自动翻译」 on: the queued job starts now.
        if (result.value.translationQueued) void import('@/translation/import-trigger').then(({ wakeImportedTranslation }) => wakeImportedTranslation(document.id, document.fileVersion)).catch(() => {});
      });
    },
    onRemove: () => {
      void library.service.remove([item.id]).then(result => {
        if (!result.ok) { fail(new Error(result.error.message)); return; }
        toast.show({ message: '已移到回收站', duration: 8000, action: { label: '撤销', onAction: () => { void library.service.restore(result.value); } } });
      });
    },
    onCreateFolder: (parentId, name) => {
      const id = crypto.randomUUID();
      void library.service.createFolder(id, parentId).then(async created => {
        if (!created.ok) { fail(new Error(created.error.message)); return; }
        const renamed = await library.service.renameFolder(id, name);
        if (!renamed.ok) fail(new Error(renamed.error.message));
      });
      return id;
    },
    onOpenPaper: (id, newTab) => {
      const paper = data.items.find(p => p.id === id);
      if (paper && !paper.hasPdf) { toast.show({ tone: 'warning', message: '这条书目还没有 PDF' }); return; }
      const target = new URL('reader.html', location.href); target.searchParams.set('item', id);
      if (newTab) window.open(target.href, '_blank', 'noopener');
      else if (paper?.document) void owner.open(paper.document.documentId);
      else location.assign(target.href);
    },
    onImport: onOpenFiles,
    onOpenLibrary: () => void owner.leaveForLibrary(),
  };
}
