import type { LibraryImportJob, LibraryImportSource } from '@/contracts/library';
import type { ImportJob } from '@/contracts/document';
import { LibraryDatabase } from '@/data/library-database';
import { createDocumentService } from '@/document/service';
import { requestImportOrigin } from '@/document/permissions';
import { parseSourceUrl } from '@/document/download';

/** One sequential queue per library page. File handles and passwords are deliberately memory-only. */
export function createLibraryImports(database: LibraryDatabase, onSaved: () => Promise<void>) {
  const documents = createDocumentService(database, { checkUrlPermissionOnly: true });
  let jobs: readonly LibraryImportJob[] = [], active: string | undefined, disposed = false;
  const listeners = new Set<() => void>();
  const sources = new Map<string, LibraryImportSource>();
  const children = new Map<string, string>();
  const waiters = new Set<() => void>();
  const signal = () => listeners.forEach(fn => fn());
  const patch = (id: string, update: Partial<LibraryImportJob>) => { jobs = jobs.map(j => j.id === id ? { ...j, ...update } : j); signal(); };
  function waitPdf(id: string, childId: string): Promise<ImportJob> {
    return new Promise((resolve, reject) => {
      let unsubscribe = () => {};
      const stop = () => { unsubscribe(); waiters.delete(stop); reject(new Error('页面已关闭')); };
      waiters.add(stop);
      const finish = () => { unsubscribe(); waiters.delete(stop); };
      const update = () => {
        const child = documents.service.getSnapshot().data.jobs.find(j => j.id === childId);
        if (!child) return;
        if (child.phase === 'readable') { finish(); resolve(child); return; }
        if (child.phase === 'failed' || child.phase === 'cancelled') { finish(); reject(new Error(child.error?.message ?? '已取消')); return; }
        patch(id, { phase: child.phase === 'password-required' ? 'password-required' : child.phase === 'reading' ? 'reading' : 'validating', progress: child.progress, passwordRequest: child.passwordRequest, error: child.error?.message });
      };
      unsubscribe = documents.service.subscribe(update); update();
    });
  }
  async function execute(id: string) {
    const source = sources.get(id)!; const job = jobs.find(j => j.id === id)!;
    try {
      patch(id, { phase: 'reading', error: undefined });
      let added = 0, reused = 0;
      if (source.kind === 'pdf' || source.kind === 'url') {
        const accepted = await documents.service.importDocument(source.kind === 'url' ? { kind: 'url', url: source.url, intent: 'import' } : { kind: 'local', file: source.file });
        if (!accepted.ok) throw new Error(accepted.error.message);
        children.set(id, accepted.value);
        // Cancellation may have happened while the service requested/checks permissions.
        if (disposed || jobs.find(j => j.id === id)?.phase === 'cancelled') await documents.service.cancel(accepted.value);
        if (disposed) return;
        const child = await waitPdf(id, accepted.value);
        if (disposed) return;
        patch(id, { phase: 'saving', progress: undefined, passwordRequest: undefined });
        const receipt = documents.getImportReceipt(accepted.value)!;
        await database.retainDocument(child.document!, job.folderId, !receipt.duplicate);
        added = Number(!receipt.duplicate); reused = Number(receipt.duplicate);
      } else {
        if (source.file.size > 10 * 1024 * 1024) throw new Error('书目文件请控制在 10 MiB 以内');
        const text = await source.file.text();
        const { parseBibliography } = await import('./bibliography');
        if (disposed || jobs.find(j => j.id === id)?.phase === 'cancelled') return;
        patch(id, { phase: 'validating' });
        let entries;
        try { entries = await parseBibliography(text, source.kind); }
        catch { throw new Error('书目解析失败：请检查 BibTeX 语法，或 CSL JSON 的标题、类型和数组结构（最多 5000 条）'); }
        if (disposed || jobs.find(j => j.id === id)?.phase === 'cancelled') return;
        patch(id, { phase: 'saving' });
        ({ added, reused } = await database.importBibliography(entries, job.folderId));
      }
      patch(id, { phase: 'completed', added, reused, error: undefined, progress: undefined, passwordRequest: undefined });
      sources.delete(id);
      await onSaved();
    } catch (error) {
      if (!disposed && jobs.find(j => j.id === id)?.phase !== 'cancelled') patch(id, { phase: 'failed', error: error instanceof Error ? error.message : '导入失败，请重试', progress: undefined, passwordRequest: undefined });
    } finally { active = undefined; if (!disposed) drain(); }
  }
  function drain() { if (active || disposed) return; const next = jobs.find(j => j.phase === 'queued'); if (next) { active = next.id; void execute(next.id); } }
  function add(source: LibraryImportSource, folderId: string | null): string {
    const id = crypto.randomUUID(); sources.set(id, source);
    jobs = [...jobs, { id, title: source.kind === 'url' ? new URL(source.url).hostname : source.file.name, folderId, phase: 'queued' }]; signal(); drain(); return id;
  }
  return {
    getSnapshot: () => jobs,
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    addFiles(kind: 'pdf' | 'bibtex' | 'csl', files: readonly File[], folderId: string | null) { return files.map(file => add({ kind, file }, folderId)); },
    async addUrl(raw: string, folderId: string | null) {
      const url = parseSourceUrl(raw).href;
      // Must run in the originating click, not after waiting behind another job.
      if (!await requestImportOrigin(url)) throw new Error('未获准读取此站点，可先下载 PDF 再导入');
      if (!disposed) add({ kind: 'url', url }, folderId);
    },
    async cancel(id: string) {
      const job = jobs.find(j => j.id === id);
      if (!job || ['saving', 'completed', 'failed', 'cancelled'].includes(job.phase)) return;
      const child = children.get(id);
      if (child) { const result = await documents.service.cancel(child); if (!result.ok) throw new Error(result.error.message); }
      patch(id, { phase: 'cancelled', passwordRequest: undefined, progress: undefined });
    },
    async retry(id: string) {
      const job = jobs.find(j => j.id === id), source = sources.get(id);
      if (!job || !source || !['failed', 'cancelled'].includes(job.phase)) return;
      if (active === id) throw new Error('正在结束上次导入，请稍后再重试');
      if (source.kind === 'url' && !await requestImportOrigin(source.url)) throw new Error('未获准读取此站点');
      if (disposed || active === id || !['failed', 'cancelled'].includes(jobs.find(j => j.id === id)?.phase ?? '')) return;
      children.delete(id); patch(id, { phase: 'queued', error: undefined, added: undefined, reused: undefined }); drain();
    },
    async password(id: string, requestId: string, password: string) {
      const child = children.get(id); if (!child) return;
      const result = await documents.service.submitPassword(child, requestId, password);
      if (!result.ok) throw new Error(result.error.message);
    },
    dispose() { disposed = true; for (const stop of waiters) stop(); documents.dispose(); listeners.clear(); sources.clear(); },
  };
}
