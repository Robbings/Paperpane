import type { DocumentRef } from '@/contracts/document';
import type { ExtractedPaper, TranslationRun, TranslationSentence, SentenceTranslation } from '@/contracts/translation';
import { TranslationStore } from '@/data/translation-store';
import { ModelSettingsStore } from '@/data/model-settings';
import { EXTRACTION_VERSION } from './extract';
import { createLlmEngine, PROMPT_VERSION } from './engines/llm';
import type { TranslationEngine } from './engine';
import { TranslationError, retryPolicy } from './errors';
import { llmTranslationSettings } from './settings';
import { runTranslationQueue } from './queue';
const message = (e: unknown) => e instanceof Error ? e.message : '翻译没有完成，请重试。';
export { decodeTranslations } from './output';

export class TranslationSession {
  requestScope?: { page?: number; ids?: string[] };
  paper?: ExtractedPaper;
  run?: TranslationRun;
  loading = true;
  error?: string;
  extractProgress = 0;
  saveFailed = false;
  activeRequests = 0;
  retrying = new Map<string, string>();
  private db = new TranslationStore();
  private settings = new ModelSettingsStore();
  private abort = new AbortController();
  private active?: Promise<void>;
  private taskAbort?: AbortController;
  private loadingTask?: Promise<void>;
  private disposed = false;
  private pauseRequested = false;
  private persistedRevision?: string;
  private writeTail: Promise<void> = Promise.resolve();
  constructor(readonly ref: DocumentRef, private extract: (signal: AbortSignal, progress: (n: number) => void) => Promise<ExtractedPaper>, private changed: () => void, readonly selection?: NonNullable<TranslationRun['selection']>) {}
  private update() { if (!this.disposed) this.changed(); }
  load() { return this.loadingTask ??= this.loadPaper(); }
  private async loadPaper() {
    try {
      this.paper = this.selection ? undefined : await this.db.extraction(this.ref, EXTRACTION_VERSION); this.abort.signal.throwIfAborted();
      if (!this.paper) {
        this.paper = await this.extract(this.abort.signal, n => { this.extractProgress = n; this.update(); });
        this.abort.signal.throwIfAborted(); if (!this.selection) await this.db.saveExtraction(this.paper);
      }
      this.abort.signal.throwIfAborted(); this.run = await this.db.latest(this.ref, this.selection?.key); this.abort.signal.throwIfAborted();
      this.persistedRevision = this.run?.revision;
      if (this.run) this.run.sessionId ??= this.run.id;
      if (this.run?.extractionVersion !== this.paper.version) this.run = undefined;
      if (this.run && ['running', 'pausing'].includes(this.run.phase)) {
        this.run.phase = 'interrupted';
        for (const o of Object.values(this.run.outputs)) if (o.state === 'streaming') o.state = 'partial';
      }
    } catch (e) { if (!this.abort.signal.aborted) this.error = message(e); }
    finally { this.loading = false; this.update(); }
  }
  /** All workers share one revisioned write queue. Snapshot when dequeued, never stale worker copies. */
  private save(recover = false): Promise<void> {
    const write = this.writeTail.catch(() => {}).then(async () => {
      if (!this.run) return;
      if (this.saveFailed && !recover) throw new TranslationError('译文尚未保存，请先重试保存。', false, true);
      const next = { ...structuredClone(this.run), revision: crypto.randomUUID(), updatedAt: new Date().toISOString() };
      try {
        await this.db.saveRun(next, this.persistedRevision);
        this.run.revision = next.revision; this.persistedRevision = next.revision; this.saveFailed = false;
      } catch (e) {
        this.saveFailed = true; this.taskAbort?.abort();
        throw new TranslationError('译文未能保存，请保持此页打开后重试保存。' + message(e), false, true);
      }
      this.update();
    });
    this.writeTail = write; return write;
  }
  needsRepeat(page?: number) {
    return this.paper?.sentences.some(s => (page === undefined || s.anchor.pages.some(p => p.pageIndex === page)) && ['partial', 'failed', 'streaming'].includes(this.run?.outputs[s.id]?.state ?? '')) ?? false;
  }
  resume(language: string) {
    return this.start(language, undefined, true, this.run?.requested);
  }
  start(language: string, page?: number, retry = false, onlyIds?: string[], replace = false): Promise<void> {
    if (this.active) return this.active;
    if (this.loading || !this.paper || this.disposed) return Promise.resolve();
    this.pauseRequested = false; this.requestScope = { page, ids: onlyIds };
    this.active = this.execute(language, page, retry, onlyIds, replace).catch(e => {
      this.error = message(e); if (this.run) { this.run.phase = 'failed'; this.run.error = this.error; } this.update();
    }).finally(() => { this.active = undefined; this.taskAbort = undefined; this.retrying.clear(); this.update(); });
    return this.active;
  }
  private async execute(language: string, page: number | undefined, retry: boolean, onlyIds?: string[], replace = false) {
    if (!navigator.locks) throw new Error('当前浏览器不支持任务互斥锁，请使用新版 Chrome 或 Edge。');
    await navigator.locks.request(`paperpane-translation:${this.ref.documentId}:${this.ref.fileVersion}${this.selection ? `:selection:${this.selection.key}` : ''}`, { ifAvailable: true }, async lock => {
      if (!lock) throw new Error('这篇论文正在另一个窗口翻译，请在那里暂停后再操作。');
      this.abort.signal.throwIfAborted(); this.error = undefined;
      if (this.saveFailed) await this.save(true);
      const latest = await this.db.latest(this.ref, this.selection?.key); this.persistedRevision = latest?.revision;
      const c = await this.settings.resolveConnection(); this.abort.signal.throwIfAborted(); if (this.pauseRequested) return;
      const same = latest && latest.extractionVersion === this.paper!.version && latest.profile.language === language && latest.profile.modelId === c.model.id && latest.profile.modelName === c.model.modelId && latest.profile.endpointId === c.endpoint.id && latest.profile.endpointUrl === c.endpoint.baseUrl && latest.profile.protocol === c.endpoint.protocol && (latest.profile.sourceLanguage ?? 'auto') === (this.selection?.sourceLanguage ?? 'auto') && [PROMPT_VERSION, 'sentence-markdown-math-2'].includes(latest.profile.promptVersion);
      if (retry && onlyIds && latest && !same) throw new Error('本次任务的模型或语言已变化，请使用原配置继续，或重新选择页面开始新版本。');
      const candidates = this.paper!.sentences.filter(s => s.kind !== 'formula' && (!onlyIds || onlyIds.includes(s.id)) && (page === undefined || s.anchor.pages.some(p => p.pageIndex === page)));
      const continuing = !!(retry && !replace && same && candidates.every(s => latest.requested.includes(s.id)));
      const now = new Date().toISOString();
      this.run = continuing ? latest! : {
        ...this.ref, id: crypto.randomUUID(), sessionId: crypto.randomUUID(), revision: 'new',
        parentRunId: latest?.id, extractionVersion: this.paper!.version, createdAt: now, updatedAt: now,
        selection: this.selection ? structuredClone(this.selection) : undefined,
        scope: this.selection ? { kind: 'selection', ids: candidates.map(s=>s.id) } : onlyIds ? { kind: 'selection', ids: [...onlyIds] } : page === undefined ? { kind: 'document' } : { kind: 'page', page },
        profile: { modelId: c.model.id, modelName: c.model.modelId, endpointId: c.endpoint.id, endpointUrl: c.endpoint.baseUrl, protocol: c.endpoint.protocol, configRevision: c.view.revision, language, sourceLanguage: this.selection?.sourceLanguage, promptVersion: PROMPT_VERSION },
        phase: 'idle', requested: candidates.map(s => s.id), outputs: same ? structuredClone(latest.outputs) : {}, attempts: [],
      };
      if (!continuing) this.persistedRevision = undefined;
      this.run.sessionId ??= this.run.id;
      if (replace) for (const sentence of candidates) delete this.run.outputs[sentence.id];
      const selected = candidates.filter(s => this.run!.outputs[s.id]?.state !== 'done');
      if (!selected.length) {
        if (!candidates.length) this.error = '此页没有可翻译文字，扫描件暂不支持。';
        else { this.run.phase = 'completed'; this.run.error = undefined; await this.save(); }
        this.update(); return;
      }
      this.run.phase = 'running'; this.run.error = undefined;
      for (const s of selected) this.run.outputs[s.id] = { ...this.run.outputs[s.id], text: this.run.outputs[s.id]?.text ?? '', state: 'pending' };
      await this.save();
      // Pack adjacent paragraphs without crossing a page boundary. Avoid one request per heading.
      const batches: TranslationSentence[][] = [];
      const batching = llmTranslationSettings(c.view.runtime);
      const charLimit = Math.min(batching.batchCharacters, c.view.runtime.maxOutputTokens ? Math.max(500, c.view.runtime.maxOutputTokens * .85) : batching.batchCharacters);
      for (const s of selected) {
        const last = batches.at(-1);
        if (last && last[0]!.anchor.pages[0]?.pageIndex === s.anchor.pages[0]?.pageIndex && last.length < batching.batchSentences && last.reduce((n, x) => n + x.source.length, 0) + s.source.length < charLimit) last.push(s);
        else batches.push([s]);
      }
      this.taskAbort = new AbortController();
      const signal = AbortSignal.any([this.abort.signal, this.taskAbort.signal]);
      const engine = createLlmEngine(c);
      const result = await runTranslationQueue(batches, {
        concurrency: c.view.runtime.concurrency, signal, minInterval: Math.ceil(60000 / batching.requestsPerMinute),
        execute: async (batch, retryRound, requestSignal) => {
          for (const sentence of batch) this.retrying.delete(sentence.id);
          if (!this.retrying.size) this.run!.error = undefined;
          this.update();
          const remaining = batch.filter(s => this.run!.outputs[s.id]?.state !== 'done');
          if (remaining.length) await this.translateBatch(engine, remaining, language, c.view.revision, retryRound, requestSignal);
        },
        split: batch => {
          const remaining = batch.filter(s => this.run!.outputs[s.id]?.state !== 'done');
          const middle = Math.ceil(remaining.length / 2);
          return [remaining.slice(0, middle), remaining.slice(middle)].filter(part => part.length);
        },
        onRetry: async (batch, attempt, delay, error) => {
          for (const sentence of batch) if (this.run!.outputs[sentence.id]?.state !== 'done')
            this.retrying.set(sentence.id, `第 ${attempt} 轮恢复，等待 ${Math.ceil(delay / 1000)} 秒`);
          this.run!.error = error; await this.save(); this.update();
        },
      });
      if (this.saveFailed) throw new Error('译文未能保存，请保持此页打开后重试保存。');
      this.retrying.clear();
      this.run.error = result.errors.length ? [...new Set(result.errors)].join(' ') : undefined;
      this.run.phase = this.pauseRequested || this.abort.signal.aborted ? 'paused' : result.errors.length ? 'failed' : this.run.requested.every(id => this.run!.outputs[id]?.state === 'done') ? 'completed' : 'paused';
      await this.save();
    });
  }
  private async translateBatch(engine: TranslationEngine, batch: TranslationSentence[], language: string, configRevision: string, retryRound: number, signal: AbortSignal) {
    const run = this.run!;
    const attempt = { id: crypto.randomUUID(), sessionId: run.sessionId ?? run.id, sentenceIds: batch.map(s => s.id), raw: '', startedAt: new Date().toISOString(), configRevision, promptVersion: PROMPT_VERSION, engine: engine.id, retryRound, state: 'running' as const };
    run.attempts.push(attempt); const a = run.attempts.at(-1)!;
    for (const s of batch) run.outputs[s.id] = { ...run.outputs[s.id], text: run.outputs[s.id]?.text ?? '', state: 'streaming' };
    const paragraphs = new Set(batch.map(s => s.paragraphId));
    const context = this.paper!.sentences.filter(s => paragraphs.has(s.paragraphId)).map(s => s.source).join(' ');
    this.activeRequests++; this.update();
    try {
      await this.save(); signal.throwIfAborted();
      await engine.translate({ sentences: batch, context, language, sourceLanguage: this.selection?.sourceLanguage, signal, sessionId: run.sessionId ?? run.id, onDiagnostics: detail => { a.diagnostics = detail; } }, async output => {
        a.raw += output.raw;
        for (const value of output.sentences) if (a.sentenceIds.includes(value.id)) {
          run.outputs[value.id] = { text: value.text, state: value.complete ? 'done' : 'streaming', format: 'markdown-math-v1', inferredMath: value.inferredMath };
        }
        await this.save();
      });
      a.state = 'complete'; await this.save();
    } catch (e) {
      const reason = signal.aborted ? '请求已停止，已收到的译文保留。' : message(e);
      for (const s of batch) {
        const old = run.outputs[s.id]!;
        if (old.state !== 'done') run.outputs[s.id] = { ...old, state: old.text ? 'partial' : 'failed', error: reason };
      }
      a.state = a.raw ? 'partial' : 'failed'; a.error = reason;
      a.diagnostics = { ...a.diagnostics, ...retryPolicy(e).diagnostics, ...(signal.aborted ? { category: 'cancelled' } : {}) };
      if (!this.saveFailed) await this.save();
      // A lost terminal frame must not resend sentences already durably received in full.
      if (!batch.every(s => run.outputs[s.id]?.state === 'done') || this.saveFailed) throw e;
    } finally {
      a.finishedAt = new Date().toISOString();
      try { if (!this.saveFailed) await this.save(); }
      finally { this.activeRequests--; this.update(); }
    }
  }
  async pause() { if (!this.active) return; this.pauseRequested = true; if (this.run) this.run.phase = 'pausing'; this.taskAbort?.abort(); this.update(); await this.active; }
  async retrySave() { try { await this.save(true); this.error = undefined; this.update(); } catch (e) { this.error = message(e); this.update(); } }
  output(id: string): SentenceTranslation { return this.run?.outputs[id] ?? { text: '', state: 'pending' }; }
  async dispose() { this.disposed = true; this.pauseRequested = true; this.abort.abort(); this.taskAbort?.abort(); await Promise.all([this.active, this.loadingTask]); await this.writeTail.catch(() => {}); await Promise.all([this.db.close(), this.settings.close()]); }
}
