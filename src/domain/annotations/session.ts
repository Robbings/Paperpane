import type { Annotation, AnnotationLayoutRecord, AnnotationNoteLayout, AnnotationService, AnnotationState, NewAnnotation } from '@/contracts/annotations';
import { failure, success, type AppError, type Result, type Snapshot } from '@/contracts/common';
import type { DocumentRef } from '@/contracts/document';
import { AnnotationDatabase, AnnotationFault } from '@/data/annotation-database';

type Patch = { color?: Annotation['color']; comment?: string };
export interface SavedAnnotationState extends AnnotationState {
  layouts: readonly AnnotationNoteLayout[];
  pending: number;
  error?: AppError;
  /** Failed drafts stay visible until explicitly discarded or retried. */
  hasDrafts: boolean;
}
function freeze<T>(value: T): T { if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(freeze); } return value; }
function detail(error: unknown): AppError {
  return { code: error instanceof AnnotationFault ? error.code : 'SAVE_FAILED', message: error instanceof Error ? error.message : '批注保存失败，请保留当前页面后重试。', recovery: ['retry'] };
}
/** Owns one document's durable annotations. PDF.js never writes this state. */
export class AnnotationSession implements AnnotationService {
  private rows = new Map<string, Annotation>();
  private layouts = new Map<string, AnnotationLayoutRecord>();
  private drafts = new Map<string, Patch>();
  private failedCreates = new Map<string, NewAnnotation>();
  private layoutDrafts = new Map<string, AnnotationNoteLayout>();
  private blocked = new Set<string>();
  private pending = 0;
  private editVersions = new Map<string, number>();
  private layoutVersions = new Map<string, number>();
  private undoRevisions = new Map<string, string>();
  private error?: AppError;
  private listeners = new Set<() => void>();
  private queue = Promise.resolve();
  private disposed = false;
  private epoch = 0;
  private channel = new BroadcastChannel('paperpane-annotations');
  private snapshot: Snapshot<SavedAnnotationState>;
  constructor(private db: AnnotationDatabase, readonly document: DocumentRef) {
    this.snapshot = { mode: 'live', state: 'loading', data: { document, items: [], layouts: [], pending: 0, hasDrafts: false } };
    this.channel.onmessage = event => { if (event.data?.documentId === document.documentId) void this.queue.then(() => this.refresh()); };
    window.addEventListener('beforeunload', this.beforeUnload);
  }
  getSnapshot = () => this.snapshot;
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => this.listeners.delete(fn); };
  private beforeUnload = (event: BeforeUnloadEvent) => { if (this.pending || this.drafts.size || this.layoutDrafts.size || this.failedCreates.size) event.preventDefault(); };
  private publish() {
    if (this.disposed) return;
    this.snapshot = freeze({ mode: 'live', ...(this.error ? {state: 'partial' as const, error:this.error} : {state:'ready' as const}), data: {
      document: this.document,
      items: [...this.rows.values()].sort((a,b) => a.anchor.pages[0]!.pageIndex-b.anchor.pages[0]!.pageIndex || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)).map(row => ({ ...row, ...this.drafts.get(row.id), save: { ...row.save, local: this.blocked.has(row.id) ? 'failed' : this.drafts.has(row.id) ? 'saving' : 'saved' } })),
      layouts: [...new Map([...this.layouts].map(([id, row]) => [id, row.layout] as const).concat([...this.layoutDrafts])).values()],
      pending: this.pending, error: this.error, hasDrafts: this.drafts.size > 0 || this.layoutDrafts.size > 0 || this.failedCreates.size > 0,
    } });
    this.listeners.forEach(fn => fn());
  }
  async refresh() {
    const epoch = ++this.epoch;
    try {
      const loaded = await this.db.load(this.document);
      if (epoch !== this.epoch || this.pending || this.disposed) return;
      // Keep the original revision under a failed draft: retry must detect conflicts.
      this.rows = new Map(loaded.items.map(row => [row.id, this.drafts.has(row.id) ? this.rows.get(row.id) ?? row : row]));
      this.layouts = new Map(loaded.layouts.map(row => [row.id, this.layoutDrafts.has(row.id) ? this.layouts.get(row.id) ?? row : row]));
      if (!this.drafts.size && !this.layoutDrafts.size && !this.failedCreates.size) this.error = undefined;
      this.publish();
    } catch (error) { this.error = detail(error); this.publish(); }
  }
  private enqueue<T>(fn: () => Promise<T>): Promise<Result<T>> {
    this.pending++; this.epoch++; this.publish();
    const result = this.queue.then(async (): Promise<Result<T>> => {
      try { return success(await fn()); }
      catch (error) { this.error = detail(error); return { ok: false, error: this.error }; }
      finally { this.pending--; this.publish(); }
    });
    this.queue = result.then(() => undefined);
    return result;
  }
  private changed() { if (!this.disposed) this.channel.postMessage({ documentId: this.document.documentId }); }
  create(input: NewAnnotation): Promise<Result<Annotation>> {
    if (this.snapshot.state === 'loading') return Promise.resolve(failure('BUSY', '批注仍在读取，请稍候。'));
    const id = crypto.randomUUID(), captured = structuredClone(input);
    return this.enqueue(async () => {
      try { const row = await this.db.create(this.document, captured, id); this.rows.set(row.id, row); this.changed(); return row; }
      catch (error) { this.failedCreates.set(id, captured); throw error; }
    });
  }
  update(id: string, expectedRevision: string, patch: Patch & { anchor?: Annotation['anchor'] }): Promise<Result<Annotation>> {
    if (patch.anchor) return Promise.resolve(failure('INVALID_INPUT', '批注锚点不能通过内容编辑改变。'));
    return this.enqueue(async () => { const row = await this.db.mutate(this.document, id, expectedRevision, patch); this.rows.set(id, row); this.changed(); return row; });
  }
  /** UI edits publish synchronously, then serialize immediately; no trailing debounce loses the last keystroke. */
  edit(id: string, patch: Patch): void {
    if (!this.rows.has(id) || this.rows.get(id)?.deletedAt) return;
    const version = (this.editVersions.get(id) ?? 0) + 1; this.editVersions.set(id, version);
    this.drafts.set(id, { ...this.drafts.get(id), ...patch }); this.publish();
    void this.enqueue(async () => {
      if (this.blocked.has(id)) return;
      const row = this.rows.get(id)!;
      try {
        const saved = await this.db.mutate(this.document, id, row.revision, patch);
        this.rows.set(id, saved);
        // An older acknowledgement must never erase a later edit, even an A→B→A sequence.
        if (this.editVersions.get(id) === version) this.drafts.delete(id);
        this.changed();
      } catch (error) { this.blocked.add(id); throw error; }
    });
  }
  remove(id: string, expectedRevision: string) { return this.mutate(id, expectedRevision, 'delete'); }
  restore(id: string, expectedRevision: string) { return this.mutate(id, expectedRevision, 'restore'); }
  private mutate(id: string, revision: string, operation: 'delete' | 'restore') {
    return this.enqueue(async () => {
      if (this.drafts.has(id)) throw new AnnotationFault('CONFLICT', '此批注有尚未保存的草稿，请先保存或处理冲突。');
      const row = await this.db.mutate(this.document, id, revision, {}, operation); this.rows.set(id, row); this.changed(); return row;
    });
  }
  async deleteCurrent(id: string): Promise<boolean> {
    await this.queue; const row = this.rows.get(id); if (!row) return false;
    const result = await this.remove(id, row.revision);
    if (result.ok) this.undoRevisions.set(id, result.value.revision);
    return result.ok;
  }
  async restoreDeleted(id: string): Promise<void> {
    await this.queue; const revision = this.undoRevisions.get(id);
    if (revision && (await this.restore(id, revision)).ok) this.undoRevisions.delete(id);
  }
  /** Capture the durable deletion revision in this particular undo action. */
  async deleteComment(id: string): Promise<(() => Promise<void>) | null> {
    const result = await this.enqueue(async () => {
      const row = this.rows.get(id);
      if (!row || row.deletedAt || this.drafts.has(id)) throw new AnnotationFault('CONFLICT', '评论已变化或有未保存的草稿，请先处理后再删除。');
      const previous = row.comment;
      const saved = await this.db.mutate(this.document, id, row.revision, { comment: '' });
      this.rows.set(id, saved); this.changed();
      return { previous, revision: saved.revision };
    });
    if (!result.ok) return null;
    const { previous, revision } = result.value;
    return async () => {
      if (this.disposed) return;
      await this.enqueue(async () => {
        if (this.drafts.has(id)) throw new AnnotationFault('CONFLICT', '评论已有新的草稿，无法撤销旧删除。');
        const saved = await this.db.mutate(this.document, id, revision, { comment: previous });
        this.rows.set(id, saved); this.changed();
      });
    };
  }
  setLayouts(next: readonly AnnotationNoteLayout[]) {
    for (const layout of next) {
      const previous = this.layoutDrafts.get(layout.id) ?? this.layouts.get(layout.id)?.layout;
      if (JSON.stringify(previous) === JSON.stringify(layout)) continue;
      const version = (this.layoutVersions.get(layout.id) ?? 0) + 1; this.layoutVersions.set(layout.id, version);
      const captured = structuredClone(layout); this.layoutDrafts.set(layout.id, captured);
      void this.enqueue(async () => {
        if (this.blocked.has(`layout:${layout.id}`)) return;
        try {
          const row = await this.db.layout(this.document, captured, this.layouts.get(layout.id)?.revision);
          this.layouts.set(layout.id, row);
          if (this.layoutVersions.get(layout.id) === version) this.layoutDrafts.delete(layout.id);
          this.changed();
        } catch (error) { this.blocked.add(`layout:${layout.id}`); throw error; }
      });
    }
    this.publish();
  }
  async retry() {
    await this.queue; this.blocked.clear(); this.error = undefined;
    for (const [id, input] of this.failedCreates) await this.enqueue(async () => {
      const row = await this.db.create(this.document, input, id);
      this.failedCreates.delete(id); this.rows.set(id, row); this.changed();
    });
    for (const [id, patch] of this.drafts) this.edit(id, { ...patch });
    const layouts = [...this.layoutDrafts.values()]; this.layoutDrafts.clear(); this.setLayouts(layouts);
    await this.queue; if (!this.drafts.size && !this.layoutDrafts.size && !this.failedCreates.size) await this.refresh();
  }
  async discardDrafts() { await this.queue; this.blocked.clear(); this.drafts.clear(); this.layoutDrafts.clear(); this.failedCreates.clear(); this.error = undefined; await this.refresh(); }
  async export(format: 'markdown' | 'csv') {
    await this.queue;
    if(this.snapshot.state==='loading')return failure('BUSY','批注仍在读取，请稍候。');
    if(this.error)return {ok:false as const,error:this.error};
    if (this.drafts.size || this.failedCreates.size) return failure('BUSY', '请先保存批注草稿。');
    const rows = [...this.rows.values()].filter(row => !row.deletedAt);
    const csv = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const content = format === 'markdown' ? rows.map(row => `## 第 ${row.anchor.pages.map(p => p.pageIndex + 1).join('、')} 页\n\n> ${row.quote.replaceAll('\n', '\n> ')}\n\n${row.comment}\n`).join('\n') : ['page,color,quote,comment', ...rows.map(row => [row.anchor.pages.map(p => p.pageIndex + 1).join(';'), row.color, row.quote, row.comment].map(csv).join(','))].join('\r\n');
    return success({ filename: `annotations.${format === 'markdown' ? 'md' : 'csv'}`, mimeType: format === 'markdown' ? 'text/markdown' : 'text/csv', text: content, warnings: [] });
  }
  async flush() { await this.queue; }
  async dispose() { await this.queue; this.disposed = true; this.channel.close(); this.listeners.clear(); window.removeEventListener('beforeunload', this.beforeUnload); }
}
