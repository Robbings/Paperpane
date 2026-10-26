import { useState } from 'react';
import { Button, Toaster, toast } from '@/ui/components';
import { LibraryView } from '@/ui/library/LibraryView';
import { samplePapers, sampleTags, querySample } from '@/ui/library/sample/libraryData';
import { defaultVisibleColumns } from '@/ui/library/columns';
import type { LibraryQuery, LibraryViewPreferences, PaperView, TagView } from '@/ui/library/types';
import { applyTheme } from '@/ui/theme';

const initial = () => structuredClone(samplePapers.slice(0, 6)).map(p => ({ ...p, folderId: null }));
const normalize = (label: string) => label.trim().normalize('NFKC').toLocaleLowerCase();
const forcedTheme = new URLSearchParams(location.search).get('theme');
if (forcedTheme === 'light' || forcedTheme === 'dark') applyTheme(forcedTheme);

/** Isolated visual preview. No database, file or production service imports. */
export function LibraryTagPreview() {
  const [papers, setPapers] = useState<PaperView[]>(initial);
  const [tags, setTags] = useState<TagView[]>(() => structuredClone(sampleTags));
  const [query, setQuery] = useState<LibraryQuery>({ collection: { kind: 'all' }, text: '', fields: ['title', 'authors'], tagIds: [], sort: { column: 'addedAt', direction: 'desc' } });
  const [prefs, setPrefs] = useState<LibraryViewPreferences>({ mode: 'compact', visibleColumns: [...defaultVisibleColumns], columnWidths: {} });
  const [reset, setReset] = useState(0);
  const { items, total } = querySample(papers, [], query, 60);
  function notice() { toast.show({ message: '本页只预览标签与星标交互，刷新后恢复。' }); }
  return <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 16px', fontSize: 12, flexWrap: 'wrap' }}>
      <span style={{ marginRight: 'auto', color: 'var(--pp-text-2)' }}>标签交互预览 · 选中两篇论文后点“加标签” · 修改仅在当前页有效</span>
      <Button size="sm" onClick={() => location.assign(new URL('library.html', location.href).href)}>打开真实文献库</Button>
      <Button size="sm" onClick={() => { setTags([]); setPapers(current => current.map(p => ({ ...p, tagIds: [] }))); }}>清空示例标签</Button>
      <Button size="sm" onClick={() => { setPapers(initial()); setTags(structuredClone(sampleTags)); setReset(i => i + 1); }}>重置预览</Button>
    </div>
    <div style={{ flex: 1, minHeight: 0 }}><LibraryView key={reset}
      papers={items} total={total} onLoadMore={() => {}} paperById={id => papers.find(p => p.id === id)}
      folders={[]} tags={tags} counts={{ all: papers.length, recent: 0, starred: papers.filter(p => p.starred).length, unfiled: papers.length, folders: {} }}
      query={query} onQuery={patch => setQuery(current => ({ ...current, ...patch }))}
      prefs={prefs} onPrefs={patch => setPrefs(current => ({ ...current, ...patch }))}
      onOpen={notice} onToggleStar={(ids, starred) => setPapers(current => current.map(p => ids.includes(p.id) ? { ...p, starred } : p))}
      onAddTags={(ids, choices) => {
        const nextTags = [...tags];
        const tagIds = choices.map(choice => {
          const found = nextTags.find(t => normalize(t.label) === normalize(choice.label));
          if (found) return found.id;
          const tag = { id: crypto.randomUUID(), label: choice.label.trim() }; nextTags.push(tag); return tag.id;
        });
        setTags(nextTags); setPapers(current => current.map(p => ids.includes(p.id) ? { ...p, tagIds: [...new Set([...p.tagIds, ...tagIds])] } : p));
        toast.show({ message: `已为 ${ids.length} 篇论文添加 ${tagIds.length} 个标签（仅本次预览）`, tone: 'success' });
      }}
      onAddTag={notice} onRemoveTag={(id, tagId) => setPapers(current => current.map(p => p.id === id ? { ...p, tagIds: p.tagIds.filter(t => t !== tagId) } : p))}
      onUpdate={notice} onMovePapers={notice} onRemoveFromLibrary={notice}
      onCreateFolder={() => { notice(); return ''; }} onRenameFolder={notice} onMoveFolder={notice} onDeleteFolder={notice}
      onImport={notice} onExportCitations={notice}
    /></div>
    <Toaster top={70} />
  </div>;
}
