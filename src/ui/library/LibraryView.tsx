import { useUiScale } from '@/ui/use-ui-scale';
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { Button, Dialog, EmptyState, GlassSurface, Icon, IconButton, Menu, isDropHandled, toast, type MenuEntry } from '@/ui/components';
import { PAPER_DRAG_TYPE } from './dragTypes';
import { useViewport } from '@/ui/reader/useViewport';
import { defaultVisibleColumns, firstDirection } from './columns';
import { LibrarySidebar, type CollectionCounts } from './LibrarySidebar';
import { LibraryTable } from './LibraryTable';
import { ImportTasks, jobPending, UrlImportDialog } from './ImportTasks';
import { BatchTagPopover, type BatchTagChoice, type BatchTagApplyResult } from './BatchTagPopover';
import { LibraryToolbar, type ImportKind } from './LibraryToolbar';
import { folderEntries, folderPath, PaperDetail } from './PaperDetail';
import type { FolderView, LibraryImports, LibraryQuery, LibraryViewPreferences, PaperView, TagView } from './types';
import './library.css';

export interface LibraryViewProps {
  /** Results loaded so far, in order; the list asks for more as it scrolls. */
  papers: readonly PaperView[];
  /** All results for the query. */
  total: number;
  onLoadMore: () => void;
  /** Looks up any paper by id (for the detail pane across pages). */
  paperById: (id: string) => PaperView | undefined;
  folders: readonly FolderView[];
  tags: readonly TagView[];
  /** Tags used in the current collection; the sidebar lists only these. Omitted: all tags. */
  collectionTagIds?: readonly string[];
  counts: CollectionCounts;
  query: LibraryQuery;
  onQuery: (patch: Partial<LibraryQuery>) => void;
  prefs: LibraryViewPreferences;
  onPrefs: (patch: Partial<LibraryViewPreferences>) => void;
  onOpen: (id: string, newTab: boolean) => void;
  onToggleStar: (ids: string[], starred: boolean) => void;
  onUpdate: (id: string, patch: Partial<PaperView>) => void;
  onAddTag: (ids: string[], tag: { id?: string; label: string }) => void;
  /** One callback for the complete batch; failure keeps the editor and draft open. */
  onAddTags?: (ids: string[], tags: BatchTagChoice[]) => void | BatchTagApplyResult | Promise<void | BatchTagApplyResult>;
  onRemoveTag: (id: string, tagId: string) => void;
  onMovePapers: (ids: string[], folderId: string | null) => void;
  onRemoveFromLibrary: (ids: string[]) => void;
  /** Creates a folder and returns its id so it can be named inline. */
  onCreateFolder: (parentId: string | null) => string;
  onRenameFolder: (id: string, name: string) => void;
  onMoveFolder: (id: string, parentId: string | null) => void;
  onDeleteFolder: (id: string) => void;
  onImport: (kind: ImportKind, files: File[], folderId: string | null) => void;
  /** The import queue and link import; without it the toolbar shows only file imports. */
  imports?: LibraryImports;
  onImportZotero?: (folderId:string|null)=>void;
  onExportZotero?: (ids:string[])=>void;
  onRestoreBackup?: ()=>void;
  onExportCitations: (ids: string[], format: 'bibtex' | 'apa' | 'csv' | 'pdf') => void;
}

type BatchMenu = 'tag' | 'move' | 'export' | null;

const GAP = 10;
const SIDEBAR_WIDTH = 232;
const DETAIL_WIDTH = 320;
/** Narrower than this, an open pane floats over the list instead of squeezing it. */
const LIST_MIN = 480;

export function LibraryView(props: LibraryViewProps) {
  const { papers, total, folders, tags, counts, query, prefs } = props;
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(papers[0]?.id ?? null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string[] | null>(null);
  const [batchMenu, setBatchMenu] = useState<BatchMenu>(null);
  const [dropping, setDropping] = useState(false);
  const dragDepth = useRef(0);
  const batchRefs = { tag: useRef<HTMLButtonElement>(null), move: useRef<HTMLButtonElement>(null), export: useRef<HTMLButtonElement>(null) };

  // Imports: the link dialog, and the task list, which opens by itself when new jobs arrive.
  const { imports } = props;
  const [urlOpen, setUrlOpen] = useState(false);
  const [tasksOpen, setTasksOpen] = useState(false);
  const tasksRef = useRef<HTMLButtonElement>(null);
  const jobCount = imports?.jobs.length ?? 0;
  const lastJobCount = useRef(jobCount);
  useEffect(() => {
    if (jobCount > lastJobCount.current) setTasksOpen(true);
    if (jobCount === 0) setTasksOpen(false);
    lastJobCount.current = jobCount;
  }, [jobCount]);

  const viewport = useViewport();
  const uiScale = useUiScale();
  const width = viewport.width / uiScale;

  // Panes follow the window width until the reader toggles them.
  const sidebarOpen = prefs.sidebarOpen ?? width >= 920;
  const detailOpen = prefs.detailOpen ?? width >= 1200;
  const roomFor = (...panes: number[]) => width - 2 * GAP - panes.reduce((sum, pane) => sum + pane + GAP, 0);
  const sidebarDocked = sidebarOpen && roomFor(SIDEBAR_WIDTH) >= LIST_MIN;
  const detailDocked = detailOpen && roomFor(...(sidebarDocked ? [SIDEBAR_WIDTH] : []), DETAIL_WIDTH) >= LIST_MIN;
  const paneState = (open: boolean, docked: boolean) => (docked ? 'docked' : open ? 'floating' : 'closed');

  const tagsById = useMemo(() => new Map(tags.map((tag) => [tag.id, tag])), [tags]);
  const active = activeId ? (props.paperById(activeId) ?? null) : null;
  const allSelectedStarred = selectedIds.length > 0 && selectedIds.every(id => props.paperById(id)?.starred);
  const currentFolder = query.collection.kind === 'folder' ? query.collection.folderId : null;

  // Changing what is listed clears the selection.
  const changeQuery = (patch: Partial<LibraryQuery>) => {
    setSelectedIds([]);
    props.onQuery(patch);
  };

  const heading =
    query.collection.kind === 'all' ? '全部论文'
    : query.collection.kind === 'recent' ? '最近阅读'
    : query.collection.kind === 'starred' ? '已标星'
    : query.collection.kind === 'unfiled' ? '未分类'
    : folderPath(folders, query.collection.folderId);

  const filtering = query.text.trim() !== '' || query.tagIds.length > 0;
  const empty = filtering ? (
    <EmptyState
      icon="search"
      title="没有找到符合条件的论文"
      description="换个关键词，扩大搜索范围，或清除筛选条件。"
      actions={
        <Button size="sm" onClick={() => changeQuery({ text: '', tagIds: [] })}>
          清除筛选
        </Button>
      }
    />
  ) : query.collection.kind === 'folder' ? (
    <EmptyState icon="folder" title="这个文件夹还是空的" description="把论文从列表拖到左侧文件夹，或在详情里选择文件夹。" />
  ) : query.collection.kind === 'recent' ? (
    <EmptyState icon="clock" title="还没有阅读记录" description="打开过的论文会出现在这里。" />
  ) : query.collection.kind === 'starred' ? (
    <EmptyState icon="star" title="还没有标星的论文" description="点论文标题旁的星标，把常看的论文放到这里。" />
  ) : (
    <EmptyState icon="library" title="文献库还是空的" description="导入 PDF 或书目文件，或在阅读器里点「收藏」把正在读的论文加进来。" />
  );

  const isFileDrag = (event: DragEvent) => {
    const types = Array.from(event.dataTransfer.types);
    // Files from the desktop, or a link dragged in from another page (never a row or folder of this list).
    return types.includes('Files') || (!!imports && types.includes('text/uri-list') && !types.includes(PAPER_DRAG_TYPE));
  };

  const batchEntries: Record<Exclude<BatchMenu, null>, MenuEntry[]> = {
    tag: [...tags].sort((a, b) => a.label.localeCompare(b.label, 'zh-CN')).map((tag) => ({ id: tag.id, label: tag.label, icon: 'tag' as const })),
    move: folderEntries(folders, null).map((entry) => ('checked' in entry ? { ...entry, checked: undefined } : entry)),
    export: [
      { id: 'pdf', label: '下载 PDF' },
      { id: 'bibtex', label: '复制为 BibTeX' },
      { id: 'apa', label: '复制为 APA 格式' },
      { id: 'csv', label: '下载 CSV' },
      ...(props.onExportZotero?[{id:'zotero',label:'导出到 Zotero…'}]:[]),
    ],
  };
  const anchorOf = (menu: Exclude<BatchMenu, null>) => {
    const box = batchRefs[menu].current?.getBoundingClientRect();
    return box ? { x: box.left, y: box.top - 6 } : { x: 0, y: 0 };
  };

  return (
    <div
      className="pp-library"
      onDragEnter={(event) => {
        if (!isFileDrag(event)) return;
        // Cancelled here as well, so the browser never treats the drop as a navigation.
        event.preventDefault();
        dragDepth.current += 1;
        setDropping(true);
      }}
      onDragOver={(event) => {
        if (isFileDrag(event)) event.preventDefault();
      }}
      onDragLeave={(event) => {
        if (!isFileDrag(event)) return;
        dragDepth.current -= 1;
        if (dragDepth.current <= 0) setDropping(false);
      }}
      onDrop={(event) => {
        if (!isFileDrag(event)) return;
        event.preventDefault();
        dragDepth.current = 0;
        setDropping(false);
        // A folder in the sidebar already imported these files into itself.
        if (isDropHandled(event.nativeEvent)) return;
        const files = Array.from(event.dataTransfer.files).filter((file) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'));
        if (files.length) props.onImport('pdf', files, currentFolder);
        else if (imports && !event.dataTransfer.files.length) {
          const link = (event.dataTransfer.getData('text/uri-list') || event.dataTransfer.getData('text/plain')).split(/\r?\n/).find((line) => /^https?:\/\//i.test(line.trim()));
          if (link) void imports.onImportUrl(link.trim(), currentFolder).then((error) => { if (error) toast.show({ tone: 'error', message: error }); });
        }
      }}
    >
      <div className="pp-lib-pane" data-side="left" data-state={paneState(sidebarOpen, sidebarDocked)} style={{ ['--pp-pane-w' as string]: `${SIDEBAR_WIDTH / 16}rem` }} inert={!sidebarOpen}>
      <LibrarySidebar
        onImportFiles={(files, folderId) => { if (files.length) props.onImport('pdf', files, folderId); }}
        collection={query.collection}
        onCollection={(collection) => changeQuery({ collection })}
        folders={folders}
        counts={counts}
        tags={props.collectionTagIds ? tags.filter((tag) => props.collectionTagIds!.includes(tag.id) || query.tagIds.includes(tag.id)) : tags}
        activeTagIds={query.tagIds}
        onTags={(tagIds) => changeQuery({ tagIds })}
        onCreateFolder={(parentId) => setRenamingId(props.onCreateFolder(parentId))}
        renamingId={renamingId}
        onRenameStart={setRenamingId}
        onRename={(id, name) => {
          setRenamingId(null);
          props.onRenameFolder(id, name);
        }}
        onRenameCancel={() => setRenamingId(null)}
        onMoveFolder={props.onMoveFolder}
        onDeleteFolder={(id) => {
          if (currentFolder === id) changeQuery({ collection: { kind: 'all' } });
          props.onDeleteFolder(id);
        }}
        onMovePapers={props.onMovePapers}
      />
      </div>

      <main className="pp-lib-main">
        <section className="pp-lib-list" aria-label={heading}>
          <LibraryToolbar
            heading={heading}
            count={total}
            text={query.text}
            onText={(text) => changeQuery({ text })}
            fields={query.fields}
            onFields={(fields) => changeQuery({ fields })}
            prefs={prefs}
            onPrefs={props.onPrefs}
            onResetColumns={() => props.onPrefs({ visibleColumns: defaultVisibleColumns, columnWidths: {} })}
            onImport={(kind, files) => props.onImport(kind, files, currentFolder)}
            onImportZotero={props.onImportZotero?()=>props.onImportZotero?.(currentFolder):undefined}
            onRestoreBackup={props.onRestoreBackup}
            onImportUrl={imports ? () => setUrlOpen(true) : undefined}
            tasks={
              imports && imports.jobs.length > 0
                ? {
                    ref: tasksRef,
                    active: imports.jobs.filter(jobPending).length,
                    failed: imports.jobs.filter((job) => job.phase === 'failed').length,
                    open: tasksOpen,
                    onToggle: () => setTasksOpen((open) => !open),
                  }
                : undefined
            }
            sidebarOpen={sidebarOpen}
            onToggleSidebar={() => props.onPrefs({ sidebarOpen: !sidebarOpen })}
            detailOpen={detailOpen}
            onToggleDetail={() => props.onPrefs({ detailOpen: !detailOpen })}
          />
          <LibraryTable
            papers={papers}
            tagsById={tagsById}
            columns={prefs.visibleColumns}
            widths={prefs.columnWidths}
            onWidths={(patch) => props.onPrefs({ columnWidths: { ...prefs.columnWidths, ...patch } })}
            sort={query.sort}
            onSort={(column) =>
              changeQuery({
                sort: {
                  column,
                  direction: query.sort.column !== column ? firstDirection(column) : query.sort.direction === 'asc' ? 'desc' : 'asc',
                },
              })
            }
            mode={prefs.mode}
            selectedIds={selectedIds}
            activeId={activeId}
            onSelection={(ids, id) => {
              setSelectedIds(ids);
              setActiveId(id);
            }}
            onOpen={props.onOpen}
            onToggleStar={(id, on) => props.onToggleStar([id], on)}
            empty={empty}
            hasMore={papers.length < total}
            onLoadMore={props.onLoadMore}
          />

          {selectedIds.length > 0 && (
            <GlassSurface tone="bar" radius="pill" className="pp-lib-batch" role="toolbar" aria-label="批量操作">
              <span className="pp-lib-batch__count">已选 {selectedIds.length} 篇</span>
              <Button size="sm" variant="quiet" icon="star" aria-pressed={allSelectedStarred} onClick={() => props.onToggleStar(selectedIds, !allSelectedStarred)}>
                {allSelectedStarred ? '取消标星' : '标星'}
              </Button>
              <Button ref={batchRefs.tag} size="sm" variant="quiet" icon="tag" aria-haspopup={props.onAddTags ? 'dialog' : 'menu'} aria-expanded={batchMenu === 'tag'} onClick={() => setBatchMenu(batchMenu === 'tag' ? null : 'tag')}>
                加标签
              </Button>
              <Button ref={batchRefs.move} size="sm" variant="quiet" icon="folder" aria-haspopup="menu" onClick={() => setBatchMenu(batchMenu === 'move' ? null : 'move')}>
                移动到
              </Button>
              <Button ref={batchRefs.export} size="sm" variant="quiet" icon="quote" aria-haspopup="menu" onClick={() => setBatchMenu(batchMenu === 'export' ? null : 'export')}>
                导出
              </Button>
              <Button size="sm" variant="danger" icon="trash" onClick={() => setConfirmRemove(selectedIds)}>
                移出
              </Button>
              <IconButton icon="close" label="取消选择" size="md" shape="pill" onClick={() => setSelectedIds([])} />
            </GlassSurface>
          )}
        </section>
      </main>

      <div className="pp-lib-pane" data-side="right" data-state={paneState(detailOpen, detailDocked)} style={{ ['--pp-pane-w' as string]: `${DETAIL_WIDTH / 16}rem` }} inert={!detailOpen}>
      <PaperDetail
        paper={active}
        selectionCount={selectedIds.length}
        folders={folders}
        tags={tags}
        onUpdate={props.onUpdate}
        onToggleStar={(id, on) => props.onToggleStar([id], on)}
        onAddTag={(id, tag) => props.onAddTag([id], tag)}
        onRemoveTag={props.onRemoveTag}
        onMove={(id, folderId) => props.onMovePapers([id], folderId)}
        onOpen={props.onOpen}
        onRemove={(id) => setConfirmRemove([id])}
      />
      </div>

      {imports && (
        <>
          <UrlImportDialog open={urlOpen} onClose={() => setUrlOpen(false)} onSubmit={(url) => imports.onImportUrl(url, currentFolder)} />
          <ImportTasks
            anchorRef={tasksRef}
            open={tasksOpen && jobCount > 0}
            onClose={() => setTasksOpen(false)}
            jobs={imports.jobs}
            onCancel={imports.onCancel}
            onRetry={imports.onRetry}
            onPassword={imports.onPassword}
          />
        </>
      )}

      {batchMenu === 'tag' && props.onAddTags ? (
        <BatchTagPopover key={selectedIds.join(',')} anchorRef={batchRefs.tag} tags={tags} paperCount={selectedIds.length}
          onApply={choices => props.onAddTags?.([...selectedIds], choices)} onClose={() => setBatchMenu(null)} />
      ) : batchMenu && (
        <Menu
          label={batchMenu === 'tag' ? '加标签' : batchMenu === 'move' ? '移动到文件夹' : '导出'}
          entries={batchEntries[batchMenu]}
          anchor={anchorOf(batchMenu)}
          triggerRef={batchRefs[batchMenu]}
          onSelect={(id) => {
            if (batchMenu === 'tag') props.onAddTag(selectedIds, { id, label: tagsById.get(id)?.label ?? id });
            else if (batchMenu === 'move') props.onMovePapers(selectedIds, id === '__root' ? null : id);
            else if(id==='zotero')props.onExportZotero?.([...selectedIds]);
            else props.onExportCitations(selectedIds, id as 'bibtex' | 'apa' | 'csv' | 'pdf');
          }}
          onClose={() => setBatchMenu(null)}
        />
      )}

      <Dialog
        open={confirmRemove !== null}
        onClose={() => setConfirmRemove(null)}
        title={confirmRemove && confirmRemove.length > 1 ? `把 ${confirmRemove.length} 篇论文移出文献库？` : '把这篇论文移出文献库？'}
        description="只是不再出现在文献库里。PDF 文件、批注和笔记都会保留，再次收藏即可恢复。"
        footer={
          <>
            <Button onClick={() => setConfirmRemove(null)}>取消</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (confirmRemove) props.onRemoveFromLibrary(confirmRemove);
                setSelectedIds([]);
                setConfirmRemove(null);
              }}
            >
              移出
            </Button>
          </>
        }
      />

      {dropping && (
        <div className="pp-lib-drop" aria-hidden="true">
          <GlassSurface tone="float" radius="panel" className="pp-lib-drop__card">
            <Icon name="upload" size={28} strokeWidth={1.5} />
            <strong>松开以导入 PDF</strong>
            <span>{currentFolder ? `放入「${folderPath(folders, currentFolder)}」` : '放入文献库根目录'}</span>
          </GlassSurface>
        </div>
      )}
    </div>
  );
}
