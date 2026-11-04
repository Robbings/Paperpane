import type { BrowserPdfSource } from './browser-pdf';
import type { DocumentService, DocumentState, ImportJob, ImportSource, DocumentRef } from '../contracts/document';
import type { Result, Snapshot } from '../contracts/common';
import { failure, success } from '../contracts/common';
import { PaperDatabase, type ImportReceipt } from '../data/database';
import { abortIfNeeded, importError } from './errors';
import { downloadPdf, parseSourceUrl, readPdfBytes, safeFilename } from './download';
import { requestImportOrigin, hasImportOrigin } from './permissions';
import { readableLocalSource } from './cached-source';

type JobReceipt = ImportReceipt & { browserSource?: BrowserPdfSource };

type Run = {
  source: ImportSource; controller: AbortController; saving: boolean; epoch: number;
  unlockPassword?: string;
  password?: { requestId: string; submit: (password: string) => void };
};
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(freeze); }
  return value;
}
export interface LiveDocumentOwner {
  service: DocumentService;
  /** Storage integration methods, not yet part of the shared UI contract. */
  readFile(ref: DocumentRef): Promise<Result<Blob>>;
  clearCache(): Promise<Result<void>>;
  refresh(): Promise<void>;
  getImportReceipt(jobId: string): JobReceipt | undefined;
  dispose(): void;
}
/** Own this once per extension page, above React panels. No network work in popup lifetimes. */
export function createDocumentService(database = new PaperDatabase(), options: { checkUrlPermissionOnly?: boolean } = {}): LiveDocumentOwner {
  let snapshot: Snapshot<DocumentState> = freeze({ mode: 'live', state: 'loading', data: { documents: [], jobs: [], recentIds: [] } });
  const listeners = new Set<() => void>(); const runs = new Map<string, Run>();
  const receipts = new Map<string, JobReceipt>();
  const channel = typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel('paperpane-documents');
  let disposed = false; let refreshVersion = 0;
  function publish(next: Snapshot<DocumentState>) {
    if (disposed) return;
    snapshot = freeze(next); listeners.forEach((listener) => listener());
  }
  function patchJob(id: string, patch: Partial<ImportJob>) {
    publish({ ...snapshot, data: { ...snapshot.data, jobs: snapshot.data.jobs.map((job) => job.id === id ? { ...job, ...patch } : job) } });
  }
  async function refresh() {
    const version = ++refreshVersion;
    try {
      const documents = await database.list();
      if (version !== refreshVersion) return;
      publish({ mode: 'live', state: 'ready', data: { ...snapshot.data, documents, recentIds: documents.filter((doc) => doc.lastReadAt).map((doc) => doc.id) } });
    } catch (error) {
      if (version === refreshVersion) publish({ mode: 'live', state: snapshot.data.documents.length ? 'partial' : 'failed', data: snapshot.data, error: importError(error) });
    }
  }
  if (channel) channel.onmessage = () => { void refresh(); };
  const becameVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', becameVisible);
  void refresh();

  async function execute(id: string, run: Run) {
    const epoch = ++run.epoch;
    const signal = run.controller.signal;
    const active = () => !disposed && runs.get(id) === run && run.epoch === epoch;
    try {
      const progress = (value: NonNullable<ImportJob['progress']>) => { if (active()) patchJob(id, { progress: value }); };
      let bytes: Uint8Array<ArrayBuffer>; let filename: string; let sourceUrl: string | undefined;
      let browserSource: BrowserPdfSource | undefined;
      if (run.source.kind === 'local') {
        filename = safeFilename(run.source.file.name);
        bytes = await readPdfBytes(run.source.file, signal, progress);
      } else if (run.source.browserTabId !== undefined) {
        const { readBrowserPdf } = await import('./browser-pdf');
        ({ bytes, filename, sourceUrl, browserSource } = await readBrowserPdf(run.source.browserTabId, parseSourceUrl(run.source.url).href, signal, progress));
      } else {
        ({ bytes, filename, sourceUrl } = await downloadPdf(parseSourceUrl(run.source.url), signal, progress));
      }
      abortIfNeeded(signal);
      if (!active()) return;
      patchJob(id, { phase: 'validating', progress: undefined });
      const { inspectPdf } = await import('./inspect-pdf');
      abortIfNeeded(signal);
      const { pageCount, bibliography } = await inspectPdf(bytes, signal, (submit, incorrect) => {
        if (!active()) return;
        const requestId = crypto.randomUUID();
        run.password = { requestId, submit };
        patchJob(id, { phase: 'password-required', passwordRequest: { requestId, incorrect }, error: incorrect ? { code: 'WRONG_PASSWORD', message: '密码不正确，请重新输入', recovery: ['enter-password'] } : undefined });
      });
      run.password = undefined;
      abortIfNeeded(signal);
      patchJob(id, { phase: 'validating', passwordRequest: undefined, error: undefined });
      const hashBytes = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
      const sha256 = Array.from(hashBytes, (value) => value.toString(16).padStart(2, '0')).join('');
      abortIfNeeded(signal);
      if (!active()) return;
      // Cancellation ends before this short atomic commit. Never report cancelled after saving.
      run.saving = true;
      const receipt = await database.commitImport({ blob: run.source.kind === 'local' ? run.source.file : new Blob([bytes], { type: 'application/pdf' }), sha256, filename, pageCount, sourceUrl, bibliography,
        syncScope: run.source.intent === 'browse' ? 'record-only' : 'record-and-file' });
      receipts.set(id, { ...receipt, browserSource });
      if(receipt.translationQueued){
        // Translation is a separate, durable job. Its startup must not turn a saved PDF into a failed import.
        await import('../translation/import-trigger')
          .then(({wakeImportedTranslation})=>wakeImportedTranslation(receipt.document.id,receipt.document.fileVersion,run.unlockPassword))
          .catch(()=>{});
      }
      if (active()) patchJob(id, { phase: 'readable', document: { documentId: receipt.document.id, fileVersion: receipt.document.fileVersion }, progress: undefined, error: undefined });
      // Completed jobs cannot be retried; release their original File/URL owner.
      runs.delete(id);
      if (!disposed) { channel?.postMessage({ kind: 'invalidate' }); await refresh(); }
    } catch (error) {
      if (!active()) return;
      const detail = signal.aborted ? { code: 'CANCELLED' as const, message: '导入已取消', recovery: ['retry' as const] } : importError(error);
      if (detail.code === 'RATE_LIMITED' && run.source.kind === 'url') {
        const local = await readableLocalSource(database, run.source.url, signal).catch(() => undefined);
        if (!active() || signal.aborted) return;
        if (local) {
          receipts.set(id, { document: local, duplicate: true });
          patchJob(id, { phase: 'readable', document: { documentId: local.id, fileVersion: local.fileVersion }, progress: undefined, error: undefined });
          runs.delete(id);
          return;
        }
      }
      patchJob(id, { phase: detail.code === 'CANCELLED' ? 'cancelled' : 'failed', error: detail, passwordRequest: undefined, progress: undefined });
    } finally { if (run.epoch === epoch) { run.password = undefined; run.unlockPassword = undefined; run.saving = false; } }
  }
  const service: DocumentService = {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async importDocument(source) {
      if (disposed) return failure('CANCELLED', '导入页面已关闭');
      if (snapshot.data.jobs.some((job) => ['reading', 'validating', 'extracting', 'password-required'].includes(job.phase))) return failure('BUSY', '请先完成或取消当前导入');
      if (source.kind === 'url') {
        // The request begins in the caller's user gesture; do not await DB readiness first.
        try {
          source = { ...source, url: parseSourceUrl(source.url).href };
          if (!await (options.checkUrlPermissionOnly ? hasImportOrigin(source.url) : requestImportOrigin(source.url))) return failure('ACCESS_DENIED', '未获准读取此站点；可重试授权或先下载到本机', ['request-access', 'choose-file']);
        } catch (error) {
          const detail = importError(error);
          return { ok: false, error: detail.code === 'INVALID_INPUT' ? detail : { code: 'ACCESS_DENIED', message: '请从扩展页面点击导入以授权读取站点', recovery: ['request-access', 'choose-file'] } };
        }
      }
      if (disposed) return failure('CANCELLED', '导入页面已关闭');
      if (snapshot.data.jobs.some((job) => ['reading', 'validating', 'extracting', 'password-required'].includes(job.phase))) return failure('BUSY', '请先完成或取消当前导入');
      const id = crypto.randomUUID();
      // Capture the source so caller mutation cannot pair one file hash with another File.
      const run: Run = { source: { ...source }, controller: new AbortController(), saving: false, epoch: 0 };
      runs.set(id, run);
      const title = source.kind === 'local' ? source.file.name : new URL(source.url).hostname;
      publish({ ...snapshot, data: { ...snapshot.data, jobs: [...snapshot.data.jobs, { id, title, phase: 'reading' }] } });
      void execute(id, run); return success(id);
    },
    async submitPassword(id, requestId, password) {
      const run = runs.get(id);
      if (!run?.password || run.password.requestId !== requestId || run.controller.signal.aborted) return failure('INVALID_INPUT', '此密码请求已结束');
      const submit = run.password.submit; run.password = undefined; run.unlockPassword = password;
      patchJob(id, { phase: 'validating', passwordRequest: undefined, error: undefined });
      submit(password); return success(undefined);
    },
    async cancel(id) {
      const run = runs.get(id); const job = snapshot.data.jobs.find((item) => item.id === id);
      if (!run || !job) return failure('NOT_FOUND', '导入任务不存在');
      if (run.saving) return failure('BUSY', '正在完成文件保存，请稍候');
      if (['readable', 'failed', 'cancelled', 'partial', 'no-text'].includes(job.phase)) return failure('INVALID_INPUT', '任务已结束');
      run.controller.abort(); run.password = undefined;
      patchJob(id, { phase: 'cancelled', passwordRequest: undefined, progress: undefined, error: undefined });
      return success(undefined);
    },
    async retry(id) {
      const run = runs.get(id); const job = snapshot.data.jobs.find((item) => item.id === id);
      if (disposed || !run || !job) return failure('NOT_FOUND', '请重新选择文件或输入链接');
      if (!['failed', 'cancelled'].includes(job.phase)) return failure('BUSY', '当前任务不能重试');
      if (snapshot.data.jobs.some((item) => ['reading', 'validating', 'extracting', 'password-required'].includes(item.phase))) return failure('BUSY', '请先完成或取消当前导入');
      if (run.source.kind === 'url') {
        try { if (!await requestImportOrigin(run.source.url)) return failure('ACCESS_DENIED', '未获准读取此站点', ['request-access', 'choose-file']); }
        catch { return failure('ACCESS_DENIED', '请点击重试以授权读取站点', ['request-access', 'choose-file']); }
      }
      if (disposed) return failure('CANCELLED', '导入页面已关闭');
      if (snapshot.data.jobs.some((item) => ['reading', 'validating', 'extracting', 'password-required'].includes(item.phase))) return failure('BUSY', '请先完成或取消当前导入');
      run.controller.abort();
      const replacement: Run = { source: run.source, controller: new AbortController(), saving: false, epoch: 0 };
      runs.set(id, replacement);
      patchJob(id, { phase: 'reading', error: undefined, passwordRequest: undefined, progress: undefined });
      void execute(id, replacement); return success(undefined);
    },
    async recordReading(ref, position) {
      try { await database.recordReading(ref, structuredClone(position)); if (!disposed) { channel?.postMessage({ kind: 'invalidate' }); await refresh(); } return success(undefined); }
      catch (error) { return { ok: false, error: importError(error) }; }
    },
  };
  return {
    service, refresh,
    async readFile(ref) { try { return success(await database.readFile(ref)); } catch (error) { return { ok: false, error: importError(error) }; } },
    async clearCache() { try { await database.clearCache(); return success(undefined); } catch (error) { return { ok: false, error: importError(error) }; } },
    getImportReceipt: (id) => { const receipt = receipts.get(id); return receipt ? structuredClone(receipt) : undefined; },
    dispose() {
      disposed = true; refreshVersion++;
      runs.forEach((run) => { if (!run.saving) run.controller.abort(); });
      channel?.close(); listeners.clear();
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', becameVisible);
      // Database ownership remains with the caller; an accepted atomic commit may finish.
    },
  };
}
