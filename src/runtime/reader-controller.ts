import { AnnotationDatabase } from '@/data/annotation-database';
import { AnnotationSession } from '@/domain/annotations/session';
import { createDocumentService } from '@/document/service';
import { PdfjsReader } from '@/document/reader/pdfjs-reader';
import type { Annotation, HighlightColor } from '@/contracts/annotations';
import type { DocumentAnchor } from '@/contracts/document';
import type { StoredDocument } from '@/data/database';
import { readingPersistence } from './reading-persistence';

/** Session ownership and UI mapping only; file identity/import remains with the library. */
export class ReaderController {
  readonly db = new AnnotationDatabase();
  readonly imports = createDocumentService(this.db);
  readonly reader: PdfjsReader;
  annotations?: AnnotationSession;
  document?: StoredDocument;
  message = '';
  translateSelection?: (anchor: DocumentAnchor, text?: string) => void;
  private reading?: ReturnType<typeof readingPersistence>;
  private unsubscribeAnnotations?: () => void;
  private cleanups: (() => void)[] = [];
  private disposed = false;
  private epoch = 0;
  private restoring = false;
  private openedJobs = new Set<string>();
  private creations = new Map<string, Promise<string | null>>();
  private lastColor: HighlightColor = 'yellow';
  constructor(container: HTMLDivElement, surface: HTMLDivElement, private update: () => void) {
    this.reader = new PdfjsReader(container, surface);
    this.cleanups.push(this.reader.subscribe(() => {
      const state = this.reader.getSnapshot().data;
      if (state.phase === 'ready' && !this.restoring) this.reading?.update(state.position);
      if (state.tool === 'auto-highlight' && state.menuTarget?.kind === 'selection') void this.createHighlight(state.menuTarget.selection.id);
      update();
    }), this.reader.subscribeProjection('viewport', update), this.imports.service.subscribe(() => {
      for (const job of this.imports.service.getSnapshot().data.jobs) if (job.phase === 'readable' && job.document && !this.openedJobs.has(job.id)) {
        this.openedJobs.add(job.id); void this.open(job.document.documentId);
      }
      update();
    }));
  }
  report(message: string) { if (!this.disposed) { this.message = message; this.update(); } }
  async start() {
    const params = new URLSearchParams(location.search);
    const id = params.get('documentId') ?? params.get('item');
    if (id) await this.open(id);
    else { const docs = await this.db.list().catch(() => []); if (!this.disposed && docs[0]) await this.open(docs[0].id); }
  }
  async open(id: string) {
    const epoch = ++this.epoch;
    try {
      await this.annotations?.flush();
      if (this.annotations?.getSnapshot().data.hasDrafts) { this.report('当前批注有未保存的更改，请处理后再切换论文。'); return; }
      const doc = await this.db.resolveReaderDocument(id);
      if (!doc) throw new Error('文献没有可读取的 PDF，请先在文献库关联原文件。');
      const blob = await this.db.readFile(doc);
      if (this.disposed || epoch !== this.epoch) return;
      this.unsubscribeAnnotations?.(); await this.annotations?.dispose(); await this.reading?.dispose();
      if (this.disposed || epoch !== this.epoch) return;
      this.document = doc; this.message = ''; this.creations.clear();
      const ref = {documentId:doc.id,fileVersion:doc.fileVersion};
      this.annotations = new AnnotationSession(this.db, ref);
      const annotations = this.annotations;
      this.unsubscribeAnnotations = annotations.subscribe(() => { this.reader.setAnnotations(annotations.getSnapshot().data.items); this.update(); });
      this.restoring = true;
      const url = new URL(location.href); url.searchParams.delete('item'); url.searchParams.set('documentId', doc.id); history.replaceState(null, '', url);
      this.update();
      const opening = this.reader.open(blob, ref);
      await annotations.refresh();
      await opening;
      if (this.disposed || epoch !== this.epoch) return;
      if (doc.position) await this.reader.restorePosition(doc.position);
      if (this.disposed || epoch !== this.epoch) return;
      this.reading = readingPersistence(this.db, ref, () => this.report('阅读位置保存失败，请保持页面打开后重试。'));
      this.restoring = false;
      if (this.reader.getSnapshot().data.phase === 'ready') this.reading.update(this.reader.getSnapshot().data.position);
    } catch (error) { if (!this.disposed && epoch === this.epoch) this.report(error instanceof Error ? error.message : '无法打开 PDF'); }
  }
  createHighlight(id: string, color = this.lastColor): Promise<string | null> {
    const existing = this.creations.get(id); if (existing) return existing;
    const captured = this.reader.resolveSelection(id), annotations = this.annotations, epoch = this.epoch;
    if (!captured.ok || !annotations) { this.report(captured.ok ? '批注存储尚未就绪' : captured.error.message); return Promise.resolve(null); }
    this.lastColor = color; this.reader.clearNativeSelection(id);
    // Start on a microtask so subscription callbacks see the deduplication entry first.
    const promise = Promise.resolve().then(async () => {
      const result = await annotations.create({ kind: 'highlight', selection: captured.value, color });
      if (!result.ok) { this.report(result.error.message); this.creations.delete(id); return null; }
      if (!this.disposed && epoch === this.epoch) {
        this.reader.setAnnotations(annotations.getSnapshot().data.items);
        if (this.reader.getSnapshot().data.selection?.id === id) this.reader.showAnnotation(result.value.id);
      }
      return result.value.id;
    });
    this.creations.set(id, promise); return promise;
  }
  colorAnnotation(id: string, color: HighlightColor) { this.lastColor=color; this.annotations?.edit(id,{color}); }
  rects(anchor: DocumentAnchor) {
    return anchor.pages.flatMap(page => { const p=this.reader.project({...anchor,pages:[page]},'viewport'); return p.state==='ready' ? p.rects.map(item=>item.rect) : []; });
  }
  item(id: string): Annotation | undefined { return this.annotations?.getSnapshot().data.items.find(row => row.id === id && !row.deletedAt); }
  selectionAction(id: string, action: string) { const selection=this.reader.resolveSelection(id); if(selection.ok) { if(action==='translate'&&this.translateSelection)this.translateSelection(selection.value.anchor,selection.value.text);else this.textAction(selection.value.text,action); } else this.report(selection.error.message); }
  textAction(text: string, action: string) {
    if (action === 'copy') void navigator.clipboard.writeText(text).catch(() => this.report('复制失败，请使用系统复制快捷键。'));
    else this.report('翻译、解释和问答将在后续接入，目前没有发送模型请求。');
  }
  async exportAnnotations(copy = false) {
    const result = await this.annotations?.export('markdown'); if (!result) return;
    if (!result.ok) { this.report(result.error.message); return; }
    if (copy) { await navigator.clipboard.writeText(result.value.text).catch(() => this.report('复制失败')); return; }
    const url = URL.createObjectURL(new Blob([result.value.text], {type:result.value.mimeType}));
    const a=document.createElement('a'); a.href=url; a.download=result.value.filename; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async dispose() {
    this.disposed=true; this.epoch++; this.cleanups.forEach(fn=>fn()); this.unsubscribeAnnotations?.(); this.imports.dispose();
    await Promise.all([this.annotations?.dispose(),this.reading?.dispose(),this.reader.dispose()]); await this.db.close();
  }
}
