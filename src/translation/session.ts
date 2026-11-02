import type { DocumentRef } from '@/contracts/document';
import type { ExtractedPaper, TranslationRun, TranslationSentence, SentenceTranslation } from '@/contracts/translation';
import { TranslationStore } from '@/data/translation-store';
import { ModelSettingsStore } from '@/data/model-settings';
import { EXTRACTION_VERSION } from './extract';
import { prepareTranslation, packBatches, carryOutputs } from './task-engine';
import { savedEngineKey } from './resolve';
import type { TranslationEngine } from './engine';
import { TranslationError, retryPolicy } from './errors';
import { runTranslationQueue } from './queue';
const message = (e: unknown) => e instanceof Error ? e.message : '翻译没有完成，请重试。';
export { decodeTranslations } from './output';

export class TranslationSession {
  engineOverride?: string;
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
  private taskRun?: TranslationRun;
  private loadingTask?: Promise<void>;
  private disposed = false;
  private leaving = false;
  private closing?: Promise<boolean>;
  private pendingWrites = 0;
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
      this.abort.signal.throwIfAborted(); const latest = await this.db.latest(this.ref, this.selection?.key); this.abort.signal.throwIfAborted();
      this.run = latest; this.persistedRevision = latest?.revision;
      if (this.run) this.run.sessionId ??= this.run.id;
      if (this.run?.extractionVersion !== this.paper.version) { this.run = undefined; this.persistedRevision = undefined; }
      if (this.run && ['running', 'pausing'].includes(this.run.phase)) {
        this.run.phase = 'interrupted';
        for (const o of Object.values(this.run.outputs)) if (o.state === 'streaming') o.state = 'partial';
      }
    } catch (e) { if (!this.abort.signal.aborted) this.error = message(e); }
    finally { this.loading = false; this.update(); }
  }
  /** All workers share one revisioned write queue. Snapshot when dequeued, never stale worker copies. */
  private save(recover = false): Promise<void> {
    this.pendingWrites++;
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
    const tracked = write.finally(() => { this.pendingWrites--; this.update(); });
    this.writeTail = tracked; return tracked;
  }
  needsRepeat(page?: number) {
    return this.paper?.sentences.some(s => (page === undefined || s.anchor.pages.some(p => p.pageIndex === page)) && ['partial', 'failed', 'streaming'].includes(this.run?.outputs[s.id]?.state ?? '')) ?? false;
  }
  resume(language: string) {
    return this.start(language, undefined, true, this.run?.requested);
  }
  start(language: string, page?: number, retry = false, onlyIds?: string[], replace = false): Promise<void> {
    if (this.active) return this.active;
    if (this.loading || !this.paper || this.disposed || this.leaving) return Promise.resolve();
    this.taskAbort = new AbortController();
    const signal = AbortSignal.any([this.abort.signal, this.taskAbort.signal]);
    this.pauseRequested = false; this.requestScope = { page, ids: onlyIds };
    this.active = this.execute(language, page, retry, signal, onlyIds, replace).catch(e => {
      // Cancellation persistence belongs inside the lock, never on an old loaded snapshot.
      if (signal.aborted && !this.saveFailed) return;
      this.error = message(e); this.update();
    }).finally(() => { this.active = undefined; this.taskAbort = undefined; this.retrying.clear(); this.update(); });
    return this.active;
  }
  private get lockName() { return `paperpane-translation:${this.ref.documentId}:${this.ref.fileVersion}${this.selection ? `:selection:${this.selection.key}` : ''}`; }
  private async execute(language: string, page: number | undefined, retry: boolean, signal: AbortSignal, onlyIds?: string[], replace = false) {
    if (!navigator.locks) throw new Error('当前浏览器不支持任务互斥锁，请使用新版 Chrome 或 Edge。');
    await navigator.locks.request(this.lockName, { ifAvailable: true }, async lock => {
      if (!lock) throw new Error('这篇论文正在另一个窗口翻译，请在那里暂停后再操作。');
      try {
        signal.throwIfAborted(); this.error = undefined;
        if (this.saveFailed) await this.save(true);
        signal.throwIfAborted();
        const latest = await this.db.latest(this.ref, this.selection?.key);
        signal.throwIfAborted();
        const resolved = await this.settings.resolveTranslationEngine(this.selection ? 'selection' : 'paper', this.engineOverride);
        signal.throwIfAborted();
        const task = prepareTranslation(resolved, language, this.selection?.sourceLanguage);
        const compatible = latest && latest.extractionVersion === this.paper!.version && latest.profile.language === language &&
          (latest.profile.sourceLanguage ?? 'auto') === (this.selection?.sourceLanguage ?? 'auto');
        const same = compatible && savedEngineKey(latest.profile) === resolved.key && latest.profile.promptVersion === task.profile.promptVersion;
        if (retry && onlyIds && latest && !compatible) throw new Error('原文或翻译语言已变化，请重新开始翻译。');
        const candidates = this.paper!.sentences.filter(s => s.kind !== 'formula' && (!onlyIds || onlyIds.includes(s.id)) && (page === undefined || s.anchor.pages.some(p => p.pageIndex === page)));
        const continuing = !!(retry && !replace && same && candidates.every(s => latest.requested.includes(s.id)));
        const now = new Date().toISOString();
        this.run = continuing ? latest! : {
          ...this.ref, id: crypto.randomUUID(), sessionId: crypto.randomUUID(), revision: 'new',
          parentRunId: latest?.id, extractionVersion: this.paper!.version, createdAt: now, updatedAt: now,
          selection: this.selection ? structuredClone(this.selection) : undefined,
          scope: this.selection ? { kind: 'selection', ids: candidates.map(s=>s.id) } : onlyIds && latest?.scope ? structuredClone(latest.scope) : page === undefined ? { kind: 'document' } : { kind: 'page', page },
          profile: task.profile, phase: 'idle', requested: candidates.map(s => s.id),
          outputs: compatible ? carryOutputs(latest,!!same) : {}, attempts: [],
        };
        // No await between adopting the snapshot and its matching expected revision.
        this.persistedRevision = continuing ? latest!.revision : undefined;
        this.taskRun = this.run;
        this.run.sessionId ??= this.run.id;
        if (replace) for (const sentence of candidates) delete this.run.outputs[sentence.id];
        const selected = candidates.filter(s => this.run!.outputs[s.id]?.state !== 'done');
        if (!selected.length) {
          if (!candidates.length) this.error = '此页没有可翻译文字，扫描件暂不支持。';
          else { this.run.phase = 'completed'; this.run.error = undefined; await this.save(); signal.throwIfAborted(); }
          this.update(); return;
        }
        this.run.phase = 'running'; this.run.error = undefined;
        for (const s of selected) this.run.outputs[s.id] = { ...this.run.outputs[s.id], text: this.run.outputs[s.id]?.text ?? '', state: 'pending' };
        await this.save();
        signal.throwIfAborted();
        const batches = packBatches(selected,task);
        const result = await runTranslationQueue(batches, {
          concurrency:task.concurrency, signal, minInterval:Math.ceil(60000/task.rpm),
          execute: async (batch, retryRound, requestSignal) => {
            for (const sentence of batch) this.retrying.delete(sentence.id);
            if (!this.retrying.size) this.run!.error = undefined;
            this.update();
            const remaining = batch.filter(s => this.run!.outputs[s.id]?.state !== 'done');
            if (remaining.length) await this.translateBatch(task.engine, remaining, language, resolved.revision, retryRound, requestSignal);
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
        signal.throwIfAborted();
      } catch (e) {
        if (signal.aborted && !this.saveFailed) {
          // Early cancellation never owns the previously loaded run and must not save it.
          if (this.taskRun) { this.taskRun.phase = 'paused'; this.taskRun.error = undefined; await this.save(); }
          return;
        }
        if (this.taskRun) { this.taskRun.phase = 'failed'; this.taskRun.error = message(e); }
        throw e;
      } finally { this.taskRun = undefined; }
    });
  }
  private async translateBatch(engine: TranslationEngine, batch: TranslationSentence[], language: string, configRevision: string, retryRound: number, signal: AbortSignal) {
    const run = this.run!;
    const attempt = { id: crypto.randomUUID(), sessionId: run.sessionId ?? run.id, sentenceIds: batch.map(s => s.id), raw: '', startedAt: new Date().toISOString(), configRevision, promptVersion: run.profile.promptVersion, engine: engine.id, retryRound, state: 'running' as const };
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
          run.outputs[value.id] = { engine:savedEngineKey(run.profile), text: value.text, state: value.complete ? 'done' : 'streaming', format: 'markdown-math-v1', inferredMath: value.inferredMath };
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
  async pause() {
    if (!this.active) return;
    if (!this.pauseRequested) {
      this.pauseRequested = true;
      if (this.taskRun) this.taskRun.phase = 'pausing';
      this.taskAbort?.abort(); this.update();
    }
    await this.active;
  }
  async retrySave() {
    await this.active;
    if (!this.saveFailed || this.disposed) return;
    try {
      // Recovery must not race snapshot adoption by a new start in this or another window.
      await navigator.locks.request(this.lockName, { ifAvailable: true }, async lock => {
        if (!lock) throw new Error('这篇论文正在另一个窗口翻译，请在那里暂停后再重试保存。');
        await this.save(true);
      });
      this.error = undefined;
    } catch (e) { this.error = message(e); }
    this.update();
  }
  output(id: string): SentenceTranslation { return this.run?.outputs[id] ?? { text: '', state: 'pending' }; }
  get hasUnsavedChanges() { return !!this.active || this.pendingWrites > 0 || this.saveFailed; }
  /** Hold new starts while a document switch waits for in-flight output and durable writes. */
  async prepareToLeave(): Promise<boolean> {
    this.leaving = true;
    await this.pause();
    await this.writeTail.catch(() => {});
    return !this.saveFailed;
  }
  cancelLeave() { if (!this.disposed) this.leaving = false; }
  dispose(): Promise<boolean> {
    if (this.disposed) return Promise.resolve(true);
    if (this.closing) return this.closing;
    this.closing = (async () => {
      if (!await this.prepareToLeave()) { this.cancelLeave(); return false; }
      this.abort.abort(); await this.loadingTask;
      this.disposed = true;
      await Promise.all([this.db.close(), this.settings.close()]);
      return true;
    })().finally(() => { this.closing = undefined; });
    return this.closing;
  }
}
