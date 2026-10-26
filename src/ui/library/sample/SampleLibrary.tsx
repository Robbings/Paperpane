import { useMemo, useState } from 'react';
import { Toaster, toast } from '@/ui/components';
import { defaultVisibleColumns } from '../columns';
import { LibraryView } from '../LibraryView';
import type { CollectionCounts } from '../LibrarySidebar';
import type { FolderView, LibraryQuery, LibraryViewPreferences, PaperView, TagView } from '../types';
import { querySample, sampleFolders, samplePapers, sampleTags } from './libraryData';
import { useSampleImports } from './useSampleImports';

const CHUNK = 12;

/** 示例接线：用示例数据驱动文献库界面。所有修改只存在于当前页面，刷新即恢复。 */
export function SampleLibrary() {
  const [papers, setPapers] = useState<PaperView[]>(samplePapers);
  const imports = useSampleImports();
  const [folders, setFolders] = useState<FolderView[]>(sampleFolders);
  const [tags, setTags] = useState<TagView[]>(sampleTags);
  const [query, setQuery] = useState<LibraryQuery>({
    collection: { kind: 'all' },
    text: '',
    fields: ['title', 'authors', 'abstract', 'venue', 'note', 'body', 'summary'],
    tagIds: [],
    sort: { column: 'addedAt', direction: 'desc' },
  });
  // Loaded in chunks as the list scrolls, as the logic layer would page through the database.
  const [limit, setLimit] = useState(CHUNK);
  const [prefs, setPrefs] = useState<LibraryViewPreferences>({ mode: 'compact', visibleColumns: defaultVisibleColumns, columnWidths: {} });

  const { items, total } = useMemo(() => querySample(papers, folders, query, limit), [papers, folders, query, limit]);

  const counts = useMemo<CollectionCounts>(() => {
    const within = (folderId: string): string[] => [folderId, ...folders.filter((f) => f.parentId === folderId).flatMap((f) => within(f.id))];
    return {
      all: papers.length,
      recent: papers.filter((p) => p.lastReadAt).length,
      starred: papers.filter((p) => p.starred).length,
      unfiled: papers.filter((p) => p.folderId === null).length,
      folders: Object.fromEntries(folders.map((f) => [f.id, papers.filter((p) => p.folderId !== null && within(f.id).includes(p.folderId)).length])),
    };
  }, [papers, folders]);

  const patchPapers = (ids: string[], patch: (paper: PaperView) => Partial<PaperView>) =>
    setPapers((current) => current.map((paper) => (ids.includes(paper.id) ? { ...paper, ...patch(paper) } : paper)));

  const ensureTag = (tag: { id?: string; label: string }) => {
    if (tag.id) return tag.id;
    const existing = tags.find((t) => t.label === tag.label);
    if (existing) return existing.id;
    const id = `t-${Date.now()}`;
    setTags((current) => [...current, { id, label: tag.label }]);
    return id;
  };

  return (
    <>
      <LibraryView
        papers={items}
        total={total}
        onLoadMore={() => setLimit((current) => current + CHUNK)}
        paperById={(id) => papers.find((p) => p.id === id)}
        folders={folders}
        tags={tags}
        counts={counts}
        query={query}
        onQuery={(patch) => {
          setQuery((current) => ({ ...current, ...patch }));
          setLimit(CHUNK);
        }}
        prefs={prefs}
        onPrefs={(patch) => setPrefs((current) => ({ ...current, ...patch }))}
        onOpen={(id, newTab) => {
          const paper = papers.find((p) => p.id === id);
          toast.show({ message: `示例：${newTab ? '在新标签页' : ''}打开「${paper?.title ?? id}」` });
        }}
        onToggleStar={(ids, starred) => patchPapers(ids, () => ({ starred }))}
        onUpdate={(id, patch) => patchPapers([id], () => patch)}
        onAddTag={(ids, tag) => {
          const tagId = ensureTag(tag);
          patchPapers(ids, (paper) => ({ tagIds: paper.tagIds.includes(tagId) ? paper.tagIds : [...paper.tagIds, tagId] }));
        }}
        onRemoveTag={(id, tagId) => patchPapers([id], (paper) => ({ tagIds: paper.tagIds.filter((t) => t !== tagId) }))}
        onMovePapers={(ids, folderId) => {
          patchPapers(ids, () => ({ folderId }));
          const name = folderId ? folders.find((f) => f.id === folderId)?.name : '文献库根目录';
          toast.show({ message: `已把 ${ids.length} 篇论文移到「${name}」` });
        }}
        onRemoveFromLibrary={(ids) => {
          const removed = papers.filter((p) => ids.includes(p.id));
          setPapers((current) => current.filter((p) => !ids.includes(p.id)));
          toast.show({
            message: `已移出 ${ids.length} 篇论文`,
            action: { label: '撤销', onAction: () => setPapers((current) => [...current, ...removed]) },
          });
        }}
        onCreateFolder={(parentId) => {
          const id = `f-${Date.now()}`;
          setFolders((current) => [...current, { id, name: '新建文件夹', parentId }]);
          return id;
        }}
        onRenameFolder={(id, name) => setFolders((current) => current.map((f) => (f.id === id ? { ...f, name } : f)))}
        onMoveFolder={(id, parentId) => setFolders((current) => current.map((f) => (f.id === id ? { ...f, parentId } : f)))}
        onDeleteFolder={(id) => setFolders((current) => current.filter((f) => f.id !== id))}
        onImport={(_kind, files) => {
          if (files.length) imports.addFiles(files);
          else toast.show({ message: '没有可导入的 PDF 文件。', tone: 'warning' });
        }}
        imports={imports}
        onExportCitations={(ids, format) => toast.show({ message: `示例：导出 ${ids.length} 篇论文的${format === 'csv' ? ' CSV' : format === 'apa' ? ' APA 引用' : ' BibTeX'}` })}
      />
      <Toaster top={16} />
    </>
  );
}
