import type { DocumentRecord, DocumentService, DocumentState, ImportJob, ImportSource } from '../document';
import { failure, success } from '../common';
import type { AppError } from '../common';
import { demoId, demoStore, now } from './store';

export interface ImportScenario { password?: string; outcome?: 'readable' | 'no-text' | 'partial'; error?: AppError; pageCount?: number }
/** Does not read files, fetch URLs, parse PDFs or persist anything. */
export function createDemoDocuments() {
  const store = demoStore<DocumentState>({ documents: [], jobs: [], recentIds: [] });
  const runs = new Map<string, { scenario: ImportScenario; epoch: number; source: ImportSource; documentId: string; fileVersion: string }>();
  let nextScenario: ImportScenario = {};
  let disposed = false;
  const job = (id: string) => store.data().jobs.find((item) => item.id === id);
  const patch = (id: string, value: Partial<ImportJob>) => store.update({ ...store.data(), jobs: store.data().jobs.map((item) => item.id === id ? { ...item, ...value } : item) });
  async function advance(id: string, unlocked = false) {
    const run = runs.get(id);
    if (!run) return;
    const epoch = ++run.epoch;
    const active = () => !disposed && runs.get(id)?.epoch === epoch;
    const gate = await store.gate();
    if (!active()) return;
    if (!gate.ok) { patch(id, { phase: 'failed', error: gate.error }); return; }
    patch(id, { phase: 'validating', error: undefined, passwordRequest: undefined, progress: undefined });
    if (run.scenario.password && !unlocked) {
      patch(id, { phase: 'password-required', passwordRequest: { requestId: demoId(), incorrect: false } });
      return;
    }
    if (run.scenario.error) { patch(id, { phase: 'failed', error: run.scenario.error }); return; }
    const pageCount = Math.max(1, Math.floor(run.scenario.pageCount ?? 3));
    patch(id, { phase: 'extracting', progress: { completed: 0, total: pageCount, unit: 'pages' } });
    const extracted = await store.gate();
    if (!active()) return;
    if (!extracted.ok) { patch(id, { phase: 'failed', error: extracted.error }); return; }
    const ref = { documentId: run.documentId, fileVersion: run.fileVersion };
    const record: DocumentRecord = {
      ...ref, id: ref.documentId, revision: demoId(), createdAt: now(), updatedAt: now(),
      title: job(id)?.title ?? '演示论文', pageCount,
      sourceUrl: run.source.kind === 'url' ? run.source.url : undefined,
      file: { assetId: demoId(), availability: 'local' },
      syncScope: run.source.intent === 'browse' ? 'record-only' : 'record-and-file',
      save: { local: 'saved', sync: 'unconfigured' },
    };
    store.update({ ...store.data(), documents: [...store.data().documents, record] });
    const phase = run.scenario.outcome ?? 'readable';
    patch(id, { phase, document: ref, progress: { completed: pageCount, total: pageCount, unit: 'pages' },
      error: phase === 'partial' ? { code: 'CORRUPT_FILE', message: '演示：部分页面不可用', recovery: ['choose-file'] } : undefined });
  }
  const service: DocumentService = {
    ...store.readable,
    async importDocument(source) {
      if (disposed) return failure('CANCELLED', '演示服务已关闭');
      if (source.kind === 'url') {
        try { if (!['http:', 'https:'].includes(new URL(source.url).protocol)) return failure('INVALID_INPUT', '仅接受 HTTP(S) 来源'); }
        catch { return failure('INVALID_INPUT', '来源网址无效'); }
      }
      const scenario = structuredClone(nextScenario); nextScenario = {};
      const id = demoId();
      runs.set(id, { scenario, source, epoch: 0, documentId: demoId(), fileVersion: demoId() });
      store.update({ ...store.data(), jobs: [...store.data().jobs, { id, title: source.kind === 'local' ? source.file.name : source.url, phase: 'reading' }] });
      void advance(id);
      return success(id);
    },
    async submitPassword(id, requestId, password) {
      const current = job(id); const run = runs.get(id);
      if (!current || !run) return failure('NOT_FOUND', '读取任务不存在');
      if (current.phase !== 'password-required' || current.passwordRequest?.requestId !== requestId) return failure('INVALID_INPUT', '密码请求已失效');
      if (password !== run.scenario.password) {
        const result = failure('WRONG_PASSWORD', '密码不正确', ['enter-password']);
        patch(id, { passwordRequest: { requestId, incorrect: true }, error: result.ok ? undefined : result.error });
        return result;
      }
      void advance(id, true);
      return success(undefined);
    },
    async cancel(id) {
      const run = runs.get(id); const current = job(id);
      if (!run || !current) return failure('NOT_FOUND', '读取任务不存在');
      if (['readable', 'partial', 'no-text', 'failed', 'cancelled'].includes(current.phase)) return failure('INVALID_INPUT', '任务已结束');
      run.epoch++;
      patch(id, { phase: 'cancelled', progress: undefined, passwordRequest: undefined, error: undefined });
      return success(undefined);
    },
    async retry(id) {
      if (disposed) return failure('CANCELLED', '演示服务已关闭');
      const current = job(id);
      if (!current) return failure('NOT_FOUND', '读取任务不存在');
      if (!['failed', 'cancelled'].includes(current.phase)) return failure('BUSY', '仅失败或取消的任务可重试');
      patch(id, { phase: 'reading', error: undefined }); void advance(id); return success(undefined);
    },
    async recordReading(ref, position) {
      const gate = await store.gate(); if (!gate.ok) return gate;
      const record = store.data().documents.find((item) => item.id === ref.documentId && item.fileVersion === ref.fileVersion);
      if (!record) return failure('FILE_MISSING', '未找到此文档版本', ['choose-file']);
      if (!Number.isInteger(position.pageIndex) || position.pageIndex < 0 || position.pageIndex >= (record.pageCount ?? Infinity) || !Number.isFinite(position.zoom) || position.zoom <= 0 || !Number.isFinite(position.offset) || position.offset < 0 || position.offset > 1 || ![0, 90, 180, 270].includes(position.rotation)) return failure('INVALID_INPUT', '阅读位置无效');
      store.update({ ...store.data(), documents: store.data().documents.map((item) => item.id === record.id ? { ...item, position, revision: demoId(), updatedAt: now(), lastReadAt: now() } : item), recentIds: [record.id, ...store.data().recentIds.filter((id) => id !== record.id)] });
      return success(undefined);
    },
  };
  return { service, controls: { ...store.controls, nextImport: (scenario: ImportScenario) => { nextScenario = structuredClone(scenario); }, dispose: () => { disposed = true; runs.forEach((run) => run.epoch++); } } };
}
