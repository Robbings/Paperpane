import { ZoteroImportDialog } from '@/ui/library/ZoteroImportDialog';
import { RestoreBackupDialog } from '@/ui/library/RestoreBackupDialog';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useLocalPreferences } from './use-local-preferences';
import { LibraryView } from '@/ui/library/LibraryView';
import type { PaperView } from '@/ui/library/types';
import { Button, Dialog, EmptyState, Toaster, toast } from '@/ui/components';
import { createLibraryService } from '@/domain/library/service';
import { createLibraryImports } from '@/domain/library/imports';
import { createLibraryEnrichment } from '@/domain/library/enrichment';
import type { LibraryImportJob, LibraryPatch, LibraryRow } from '@/contracts/library';
import type { Result } from '@/contracts/common';

export function createLibraryRuntime() {
  const owner = createLibraryService();
  const imports = createLibraryImports(owner.database, owner.invalidate);
  const enrichment = createLibraryEnrichment(owner.database, owner.service, imports, owner.invalidate);
  return { ...owner, imports, dispose() { enrichment.dispose(); imports.dispose(); owner.dispose(); void owner.database.close(); } };
}
type Runtime = ReturnType<typeof createLibraryRuntime>;
const errorToast = (error: unknown) => toast.show({ tone: 'error', message: error instanceof Error ? error.message : '操作失败，请重试' });
async function report<T>(promise: Promise<Result<T>>): Promise<Result<T>> {
  const result = await promise; if (!result.ok) toast.show({ tone: 'error', message: result.error.message }); return result;
}
export function downloadFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = name.replace(/[\x00-\x1f/\\]/g, '_'); link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
const asPaper = (row: LibraryRow): PaperView => ({ ...row, annotationCount: row.annotationCount ?? 0 });
const pending = (job: LibraryImportJob) => !['completed', 'failed', 'cancelled'].includes(job.phase);

/** Connects the library service to its view, dialogs and controls. */
export function LibraryPage({ owner }: { owner: Runtime }) {
  useLocalPreferences();
  const { service, imports } = owner;
  const [zotero,setZotero]=useState<{mode:'import'|'export';ids:string[];folderId:string|null}>();
  const [restoreOpen,setRestoreOpen]=useState(false);
  const snapshot = useSyncExternalStore(service.subscribe, service.getSnapshot);
  const jobs = useSyncExternalStore(imports.subscribe, imports.getSnapshot);
  const [exported, setExported] = useState<{ text: string; format: 'bibtex' | 'apa' | 'csv' }>();
  const data = snapshot.data;
  const loadError = 'error' in snapshot ? snapshot.error : undefined;
  const papers = data.items.map(asPaper);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (imports.getSnapshot().some(pending)) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [imports]);
  async function exportSelected(ids: string[], format: 'bibtex' | 'apa' | 'csv') {
    try {
      const items = await Promise.all(ids.map(id => owner.database.getItem(id)));
      if (items.some(item => !item)) throw new Error('部分条目已不存在，请重新选择');
      const { exportCitations } = await import('@/domain/library/bibliography');
      const text = exportCitations(items as LibraryRow[], format);
      if (format === 'csv') downloadFile(new Blob([text], { type: 'text/csv;charset=utf-8' }), 'Paperpane-citations.csv');
      else {
        try { await navigator.clipboard.writeText(text); toast.show({ message: items.some(i => !i?.authors.length || !i.year) ? '引用已复制；部分条目缺少作者或年份，可在详情中补充' : '引用已复制', tone: 'success' }); }
        catch { setExported({ text, format }); }
      }
    } catch (error) { errorToast(error); }
  }
  function update(id: string, patch: Partial<PaperView>) {
    const item = data.items.find(i => i.id === id);
    if (!item) { errorToast(new Error('请重新选中要编辑的条目')); return; }
    const clean: LibraryPatch = {}, baseline: LibraryPatch = {};
    for (const key of ['title', 'authors', 'year', 'venue', 'abstract', 'shortNote'] as const) {
      if (key in patch) { Object.assign(clean, { [key]: patch[key] }); Object.assign(baseline, { [key]: item[key] }); }
    }
    void report(service.update(id, item.revision, clean, baseline));
  }
  // A later refresh failed while the list is still shown: say so once, with a retry.
  useEffect(() => {
    if (loadError && snapshot.state !== 'failed')
      toast.show({ tone: 'warning', message: loadError.message, action: { label: '重新读取', onAction: () => void owner.refresh() } });
  }, [loadError, snapshot.state, owner]);
  return <>
    <div style={{ height: '100%' }}>
      {snapshot.state === 'failed' ? <EmptyState icon="exclaim" title="暂时无法读取文献库" description={snapshot.error?.message} actions={<Button onClick={() => void owner.refresh()}>重试</Button>} /> :
      snapshot.state !== 'loading' && <LibraryView
        papers={papers} total={data.total} onLoadMore={service.loadMore}
        paperById={id => papers.find(p => p.id === id)}
        folders={data.folders} tags={data.tags} collectionTagIds={data.collectionTagIds} counts={data.counts}
        query={data.query} onQuery={patch => {
          if (patch.fields?.some(f => data.unavailableSearchFields.includes(f))) toast.show({ tone: 'warning', message: '正文与 AI 总结还没有索引；本次只搜索已接入的书目信息和短注释' });
          service.setQuery(patch);
        }}
        prefs={data.preferences} onPrefs={patch => { void report(service.setPreferences(patch)); }}
        onOpen={(id, newTab) => {
          const paper = papers.find(p => p.id === id);
          if (!paper?.hasPdf) { errorToast(new Error('这条书目还没有 PDF')); return; }
          const target = new URL('reader.html', location.href); target.searchParams.set('item', id);
          if (newTab) window.open(target.href, '_blank', 'noopener'); else location.assign(target.href);
        }}
        // Resolve bulk intent against current stored values, including other-page changes.
        onToggleStar={(ids, on) => { void report(ids.length > 1 ? service.toggleStars(ids) : service.star(ids, on)); }}
        onUpdate={update}
        onAddTag={(ids, tag) => { void report(service.addTag(ids, tag)); }}
        onAddTags={async (ids, tags) => {
          const result = await service.addTags(ids, tags);
          if (!result.ok) return { ok: false, message: result.error.message };
          toast.show({ message: '标签已保存', tone: 'success' });
          return { ok: true };
        }}
        onRemoveTag={(id, tag) => { void report(service.removeTag(id, tag)); }}
        onMovePapers={(ids, folder) => { void report(service.move(ids, folder)); }}
        onRemoveFromLibrary={ids => { void report(service.remove(ids)).then(result => {
          if (result.ok) toast.show({ message: '已移出文献库，PDF 仍保留', duration: 8000, action: { label: '撤销', onAction: () => { void report(service.restore(result.value)); } } });
        }); }}
        onCreateFolder={parent => { const id = crypto.randomUUID(); void report(service.createFolder(id, parent)); return id; }}
        onRenameFolder={(id, name) => { void report(service.renameFolder(id, name)); }}
        onMoveFolder={(id, parent) => { void report(service.moveFolder(id, parent)); }}
        onDeleteFolder={id => { void report(service.deleteFolder(id)); }}
        onImport={(kind, files, folder) => { if (files.length) imports.addFiles(kind, files, folder); }}
        imports={{
          jobs,
          onImportUrl: async (url, folder) => {
            try { await imports.addUrl(url, folder); return null; }
            catch (error) { return error instanceof Error ? error.message : '无法加入导入队列，请检查网址'; }
          },
          onCancel: id => { void imports.cancel(id).catch(errorToast); },
          onRetry: id => { void imports.retry(id).catch(errorToast); },
          onPassword: (id, requestId, password) => { void imports.password(id, requestId, password).catch(errorToast); },
        }}
        onImportZotero={folderId=>setZotero({mode:'import',ids:[],folderId})}
        onExportZotero={ids=>setZotero({mode:'export',ids,folderId:null})}
        onRestoreBackup={()=>setRestoreOpen(true)}
        onExportCitations={(ids, format) => { void exportSelected(ids, format); }}
      />}
    </div>
    <ZoteroImportDialog open={!!zotero} mode={zotero?.mode??'import'} ids={zotero?.ids??[]} folderId={zotero?.folderId??null} folders={data.folders} onClose={()=>setZotero(undefined)} onDone={()=>void owner.refresh()}/>
    <RestoreBackupDialog open={restoreOpen} onClose={()=>setRestoreOpen(false)} onDone={()=>void owner.refresh()}/>
    <Dialog open={!!exported} onClose={() => setExported(undefined)} title="引用已生成" description="浏览器未允许写入剪贴板，可下载后复制。"
      footer={<Button onClick={() => { if (exported) downloadFile(new Blob([exported.text], { type: 'text/plain;charset=utf-8' }), `Paperpane-citations.${exported.format === 'bibtex' ? 'bib' : 'txt'}`); }}>下载引用</Button>}>
      <pre style={{ whiteSpace: 'pre-wrap', maxHeight: '40vh', overflow: 'auto' }}>{exported?.text}</pre>
    </Dialog>
    <Toaster />
  </>;
}
