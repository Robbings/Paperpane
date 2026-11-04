import { NoteSession } from '@/domain/notes/session';
import { NoteDatabase } from '@/data/note-database';
import { markdownWork } from '@/domain/notes/assets';
import { AnnotationDatabase } from '@/data/annotation-database';
import { AnnotationSession } from '@/domain/annotations/session';
import type { BrowserPdfSource } from '@/document/browser-pdf';
import { createDocumentService } from '@/document/service';
import { PdfjsReader } from '@/document/reader/pdfjs-reader';
import type { Annotation, HighlightColor } from '@/contracts/annotations';
import type { DocumentAnchor } from '@/contracts/document';
import type { StoredDocument } from '@/data/database';
import type { TranslationSession } from '@/translation/session';
import { readingPersistence } from './reading-persistence';
import { localPdfUrl, pdfSourceUrl } from '@/browser-entry/pdf';
import { browser } from 'wxt/browser';
import { hasImportOrigin, requestImportOrigin } from '@/document/permissions';
import { PreferenceStore } from '@/data/preference-store';

type ExternalImport = {
  url: string;
  browserTabId?: number;
  phase: 'checking' | 'permission' | 'importing' | 'failed';
  jobId?: string;
  error?: string;
};

/** Reads a file:// PDF. Extension pages may do so once 允许访问文件网址 is on; fetch() cannot, XHR can. */
function readLocalPdf(url: string): Promise<File> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('GET', url);
    request.responseType = 'arraybuffer';
    request.onload = () => {
      const bytes = request.response as ArrayBuffer | null;
      if (!bytes?.byteLength || (request.status !== 0 && request.status !== 200)) { reject(new Error('本地 PDF 为空或已被移动，请重新选择文件。')); return; }
      let name = '论文.pdf';
      try { name = decodeURIComponent(new URL(url).pathname.split('/').pop() || name); } catch { /* Keep the default name. */ }
      resolve(new File([bytes], name, { type: 'application/pdf' }));
    };
    request.onerror = () => reject(new Error('无法读取本地 PDF。请在扩展详情中开启「允许访问文件网址」，或用「选择论文」打开文件。'));
    request.send();
  });
}

/** Session ownership and UI mapping only; file identity/import remains with the library. */
export class ReaderController {
  readonly db = new AnnotationDatabase();
  readonly imports = createDocumentService(this.db, { checkUrlPermissionOnly: true });
  readonly reader: PdfjsReader;
  annotations?: AnnotationSession;
  notes?: NoteSession;
  private unsubscribeNotes?:()=>void;
  document?: StoredDocument;
  originalPdfUrl?: string;
  message = '';
  externalImport?: ExternalImport;
  private started = false;
  private stopping = false;
  translateSelection?: (anchor: DocumentAnchor, text?: string) => void;
  readonly researchSessions = new Set<{readonly unsaved:boolean;prepareToLeave:()=>Promise<boolean>}>();
  private translations = new Set<TranslationSession>();
  isChangingDocument = false;
  private transition: Promise<void> = Promise.resolve();
  private endTransition?: () => void;
  private resumeMarkdown?: () => void;
  private beforeUnload = (event: BeforeUnloadEvent) => { if (markdownWork.unsaved||this.notes?.unsaved||[...this.translations].some(s => s.hasUnsavedChanges)||[...this.researchSessions].some(s=>s.unsaved)) event.preventDefault(); };
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
    window.addEventListener('beforeunload', this.beforeUnload);
    this.reader = new PdfjsReader(container, surface);
    this.cleanups.push(this.reader.subscribe(() => {
      const state = this.reader.getSnapshot().data;
      if (state.phase === 'ready' && !this.restoring) this.reading?.update(state.position);
      if (state.tool === 'auto-highlight' && state.menuTarget?.kind === 'selection') void this.createHighlight(state.menuTarget.selection.id);
      update();
    }), this.reader.subscribeProjection('viewport', update), this.imports.service.subscribe(() => {
      const external = this.externalImport;
      const job = external?.jobId ? this.imports.service.getSnapshot().data.jobs.find(j => j.id === external.jobId) : undefined;
      if (external && job && (job.phase === 'failed' || job.phase === 'cancelled')) {
        external.phase = 'failed';
        external.error = job.error?.message ?? '导入已取消，可以重试或先下载 PDF 再导入。';
      }
      for (const job of this.imports.service.getSnapshot().data.jobs) if (job.phase === 'readable' && job.document && !this.openedJobs.has(job.id)) {
        this.openedJobs.add(job.id);
        const imported = job.id === external?.jobId ? external : undefined;
        void this.open(job.document.documentId, imported?.url, imported && this.imports.getImportReceipt(job.id)?.browserSource);
      }
      update();
    }));
  }
  report(message: string) { if (!this.disposed) { this.message = message; this.update(); } }
  async start() {
    if (this.started) return;
    this.started = true;
    const params = new URLSearchParams(location.search);
    const id = params.get('documentId') ?? params.get('item');
    try { const original = params.get('originalPdf'); if (original) this.originalPdfUrl = pdfSourceUrl(original); } catch { /* Ignore an invalid source hint. */ }
    if (params.get('open') === 'file' && !id && !params.has('import')) return;
    const external = params.get('import');
    const local = external !== null ? localPdfUrl(external) : undefined;
    if (local) {
      // A PDF the browser opened from this device; 返回原 PDF goes back to that file.
      this.originalPdfUrl = local; this.update();
      try { await this.openLocalFile(await readLocalPdf(local)); }
      catch (error) { this.report(error instanceof Error ? error.message : '无法读取本地 PDF。'); }
      return;
    }
    if (external !== null) {
      try {
        const tabHint = params.get('browserTab');
        const browserTabId = tabHint !== null && /^\d+$/.test(tabHint) && Number.isSafeInteger(Number(tabHint)) ? Number(tabHint) : undefined;
        this.externalImport = { url: pdfSourceUrl(external), browserTabId, phase: 'checking' };
        this.update();
        await this.importExternal(false);
      } catch (error) { this.report(error instanceof Error ? error.message : '论文链接无效。'); }
      return;
    }
    if (id) await this.open(id);
    else { const docs = await this.db.list().catch(() => []); if (!this.disposed && docs[0]) await this.open(docs[0].id); }
  }
  /** Permission requests originate in the retry/allow button's user gesture. */
  async importExternal(requestAccess = true) {
    const external = this.externalImport;
    if (!external || this.disposed || this.stopping) return;
    if (external.phase === 'importing') return;
    const permission = requestAccess ? requestImportOrigin(external.url) : hasImportOrigin(external.url);
    external.phase = 'checking'; external.error = undefined; this.update();
    try {
      const allowed = await permission;
      if (this.disposed || this.stopping) return;
      if (!allowed) {
        external.phase = 'permission'; external.error = `需要允许 Paperpane 读取 ${new URL(external.url).hostname} 的 PDF。`; this.update(); return;
      }
      if (external.jobId) {
        const result = await this.imports.service.retry(external.jobId);
        if (!result.ok) throw new Error(result.error.message);
        // retry() publishes the reading phase synchronously before returning.
        external.phase = 'importing';
      } else {
        external.phase = 'importing';
        const result = await this.imports.service.importDocument({ kind: 'url', url: external.url, intent: await this.importIntent(), browserTabId: external.browserTabId });
        if (!result.ok) throw new Error(result.error.message);
        external.jobId = result.value;
      }
      this.update();
    } catch (error) {
      if (this.disposed || this.stopping) return;
      external.phase = 'failed'; external.error = error instanceof Error ? error.message : '无法导入论文，请重试。'; this.update();
    }
  }
  /** Papers opened here join the library only when the reader asked for that in settings. */
  async importIntent(): Promise<'browse' | 'import'> {
    const store = new PreferenceStore();
    try { return (await store.read()).autoAddToLibrary === true ? 'import' : 'browse'; }
    catch { return 'browse'; }
    finally { void store.close(); }
  }
  /** Opens a PDF file from this device (file picker, drop or popup). */
  async openLocalFile(file: File) {
    if (this.disposed) return;
    const result = await this.imports.service.importDocument({ kind: 'local', file, intent: await this.importIntent() });
    if (!result.ok) this.report(result.error.message);
  }
  trackTranslation(session: TranslationSession) { this.translations.add(session); }
  async releaseTranslation(session: TranslationSession) {
    if (!await session.dispose()) return false;
    this.translations.delete(session); return true;
  }
  private releaseDocumentChange() {
    this.notes?.cancelLeave();
    this.resumeMarkdown?.(); this.resumeMarkdown = undefined;
    this.isChangingDocument = false;
    this.endTransition?.(); this.endTransition = undefined;
    this.translations.forEach(s => s.cancelLeave());
  }
  private async prepareDocumentChange() {
    if (this.isChangingDocument || this.disposed) return false;
    this.isChangingDocument = true;
    this.transition = new Promise(resolve => { this.endTransition = resolve; });
    this.resumeMarkdown = markdownWork.uploads.holdNewUploads();
    try {
      const saved = await Promise.all([...this.translations].map(s => s.prepareToLeave()));
      const aiSaved=await Promise.all([...this.researchSessions].map(s=>s.prepareToLeave()));
      if(aiSaved.some(ok=>!ok))throw new Error('AI 内容尚未保存，请先重试保存再切换论文。');
      if(!await markdownWork.prepareToLeave())throw new Error('图片尚未保存，请回到编辑器重试后再切换论文。');
      if(this.notes&&!await this.notes.prepareToLeave())throw new Error('笔记尚未保存，请重试或处理冲突后再切换论文。');
      await this.annotations?.flush();
      if (saved.some(ok => !ok)) throw new Error('译文尚未保存，已保留当前论文和翻译窗口。请先重试保存，再切换论文。');
      if (this.annotations?.getSnapshot().data.hasDrafts) throw new Error('当前批注有未保存的更改，请处理后再切换论文。');
      return true;
    } catch (error) {
      this.report(error instanceof Error ? error.message : '保存未完成，请保持当前论文打开。');
      this.releaseDocumentChange(); return false;
    }
  }
  async leaveForLibrary() {
    if (!await this.prepareDocumentChange()) return;
    try { location.href = 'library.html'; } finally { this.releaseDocumentChange(); }
  }
  async returnToOriginal() {
    const url = this.originalPdfUrl ?? this.externalImport?.url ?? this.document?.sourceUrl;
    if (!url || !await this.prepareDocumentChange()) return;
    try {
      if (!browser.runtime?.id) { location.assign(pdfSourceUrl(url)); return; }
      const result = await browser.runtime.sendMessage({ type: 'OPEN_ORIGINAL_PDF', pdfUrl: url });
      if (!result?.ok) throw new Error(result?.error ?? '无法返回原 PDF。');
    } catch (error) { this.report(error instanceof Error ? error.message : '无法返回原 PDF。'); }
    finally { this.releaseDocumentChange(); }
  }
  async open(id: string, importedSource?: string, browserSource?: BrowserPdfSource) {
    if (!await this.prepareDocumentChange()) return;
    const epoch = ++this.epoch;
    try {
      const doc = await this.db.resolveReaderDocument(id);
      if (!doc) throw new Error('文献没有可读取的 PDF，请先在文献库关联原文件。');
      const blob = await this.db.readFile(doc);
      if (this.disposed || epoch !== this.epoch) return;
      // The old view remains owned and subscribed until its last save confirms release.
      await this.annotations?.flush();
      if (this.annotations?.getSnapshot().data.hasDrafts) throw new Error('当前批注有未保存的更改，请处理后再切换论文。');
      if (this.notes && !await this.notes.dispose()) throw new Error('笔记尚未保存，已保留当前论文和草稿，请重试或处理冲突后再切换论文。');
      this.unsubscribeAnnotations?.();this.unsubscribeNotes?.();await this.annotations?.dispose(); await this.reading?.dispose();
      if (this.disposed || epoch !== this.epoch) return;
      this.originalPdfUrl = importedSource ?? (!this.externalImport && (!this.document || this.document.id === doc.id) ? this.originalPdfUrl : undefined) ?? doc.sourceUrl;
      this.document = doc; this.message = ''; this.creations.clear();
      const ref = {documentId:doc.id,fileVersion:doc.fileVersion};
      this.annotations = new AnnotationSession(this.db, ref);
      this.notes=new NoteSession(new NoteDatabase(),ref);this.unsubscribeNotes=this.notes.subscribe(()=>this.update());
      const annotations = this.annotations;
      this.unsubscribeAnnotations = annotations.subscribe(() => { this.reader.setAnnotations(annotations.getSnapshot().data.items); this.update(); });
      this.restoring = true;
      const url = new URL(location.href); url.searchParams.delete('open'); url.searchParams.delete('item'); url.searchParams.delete('import'); url.searchParams.delete('browserTab'); url.searchParams.delete('source'); url.searchParams.set('documentId', doc.id);
      if (this.originalPdfUrl) url.searchParams.set('originalPdf', this.originalPdfUrl); else url.searchParams.delete('originalPdf');
      history.replaceState(null, '', url);
      this.externalImport = undefined;
      this.update();
      const opening = this.reader.open(blob, ref);
      await Promise.all([annotations.refresh(),this.notes.refresh()]);
      await opening;
      if (this.disposed || epoch !== this.epoch) return;
      if (doc.position) await this.reader.restorePosition(doc.position);
      if (this.disposed || epoch !== this.epoch) return;
      this.reading = readingPersistence(this.db, ref, () => this.report('阅读位置保存失败，请保持页面打开后重试。'));
      this.restoring = false;
      if (this.reader.getSnapshot().data.phase === 'ready') {
        this.reading.update(this.reader.getSnapshot().data.position);
        if (browserSource) {
          const { closeImportedPdf } = await import('@/document/browser-pdf');
          await closeImportedPdf(browserSource).catch(() => {}); // The original tab may already have closed or navigated.
        }
      }
    } catch (error) { if (!this.disposed && epoch === this.epoch) this.report(error instanceof Error ? error.message : '无法打开 PDF'); }
    finally { this.releaseDocumentChange(); }
  }
  /** A comment on the selected text, without a highlight; a colour can be added later. */
  createComment(id: string): Promise<string | null> { return this.createHighlight(id, this.lastColor, 'selection-comment'); }
  createHighlight(id: string, color = this.lastColor, kind: 'highlight' | 'selection-comment' = 'highlight'): Promise<string | null> {
    const existing = this.creations.get(id); if (existing) return existing;
    const captured = this.reader.resolveSelection(id), annotations = this.annotations, epoch = this.epoch;
    if (!captured.ok || !annotations) { this.report(captured.ok ? '批注存储尚未就绪' : captured.error.message); return Promise.resolve(null); }
    this.lastColor = color; this.reader.clearNativeSelection(id);
    // Start on a microtask so subscription callbacks see the deduplication entry first.
    const promise = Promise.resolve().then(async () => {
      const result = await annotations.create({ kind, selection: captured.value, color });
      if (!result.ok) { this.report(result.error.message); this.creations.delete(id); return null; }
      if (!this.disposed && epoch === this.epoch) {
        this.reader.setAnnotations(annotations.getSnapshot().data.items);
        if (this.reader.getSnapshot().data.selection?.id === id) this.reader.showAnnotation(result.value.id);
      }
      return result.value.id;
    });
    this.creations.set(id, promise); return promise;
  }
  /**
   * Sets or removes a text annotation's highlight. Choosing the colour it already has, or null,
   * removes the highlight: the comment stays; with no comment there is nothing left to keep.
   */
  async highlightAnnotation(id: string, color: HighlightColor | null): Promise<'highlighted' | 'removed' | 'deleted' | null> {
    const row = this.item(id); if (!row || row.kind === 'page-comment' || !this.annotations) return null;
    if (color && !(row.kind === 'highlight' && row.color === color)) { this.lastColor = color; this.annotations.edit(id, { color, kind: 'highlight' }); return 'highlighted'; }
    if (row.kind !== 'highlight') return null;
    if (row.comment.trim()) { this.annotations.edit(id, { kind: 'selection-comment' }); return 'removed'; }
    return (await this.annotations.deleteCurrent(id)) ? 'deleted' : null;
  }
  colorAnnotation(id: string, color: HighlightColor) { void this.highlightAnnotation(id, color); }
  rects(anchor: DocumentAnchor) {
    return anchor.pages.flatMap(page => { const p=this.reader.project({...anchor,pages:[page]},'viewport'); return p.state==='ready' ? p.rects.map(item=>item.rect) : []; });
  }
  item(id: string): Annotation | undefined { return this.annotations?.getSnapshot().data.items.find(row => row.id === id && !row.deletedAt); }
  selectionAction(id: string, action: string) { const selection=this.reader.resolveSelection(id); if(selection.ok) { if(action==='translate'&&this.translateSelection)this.translateSelection(selection.value.anchor,selection.value.text);else this.textAction(selection.value.text,action); } else this.report(selection.error.message); }
  textAction(text: string, action: string) {
    if (action === 'copy') void navigator.clipboard.writeText(text).catch(() => this.report('复制失败，请使用系统复制快捷键。'));
    else this.report('翻译、解释和问答将在后续接入，目前没有发送模型请求。');
  }
  private exporting = false;
  async exportPdf(print = false) {
    if(this.exporting||!this.document||!this.annotations)return;
    if(this.annotations.getSnapshot().state!=='ready'){this.report('批注尚未读取完成或读取失败，请稍候或重新打开论文后重试。');return;}
    const win=print?window.open('about:blank','_blank'):null;
    if(print&&!win){this.report('请允许打开打印窗口后重试。');return;}
    if(win)win.document.body.textContent='正在准备带标注的打印页面，可关闭窗口取消。';
    this.exporting=true;
    const document=this.document,annotations=this.annotations;
    try {
      await annotations.flush();
      const saved=annotations.getSnapshot().data;
      if(saved.hasDrafts||saved.error)throw new Error('请先保存批注，再导出或打印。');
      const rows=saved.items.filter(r=>!r.deletedAt);
      const original=await this.db.readFile(document);
      const {annotatedPdf}=await import('@/document/reader/export-pdf');
      const bytes=await annotatedPdf(new Uint8Array(await original.arrayBuffer()),rows);
      if(print&&win){
        if(win.closed)return;
        const {printAnnotatedPdf}=await import('@/document/reader/print-pdf');
        await printAnnotatedPdf(win,bytes,rows,document.title);
      } else {
        const url=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:'application/pdf'}));
        const a=window.document.createElement('a');a.href=url;a.download=`${document.title}-带标注.pdf`;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
      }
    } catch(error){if(win&&!win.closed)win.close();this.report(error instanceof Error?error.message:'PDF 导出失败，请重试。');}
    finally{this.exporting=false;}
  }
  async exportAnnotations(copy = false, format: 'markdown' | 'csv' = 'markdown') {
    const result = await this.annotations?.export(format); if (!result) return;
    if (!result.ok) { this.report(result.error.message); return; }
    if (copy) { await navigator.clipboard.writeText(result.value.text).catch(() => this.report('复制失败')); return; }
    const url = URL.createObjectURL(new Blob([...(format==='csv'?['\uFEFF']:[]),result.value.text], {type:result.value.mimeType+';charset=utf-8'}));
    const a=document.createElement('a'); a.href=url; a.download=result.value.filename; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async dispose() {
    this.stopping = true;
    if (this.isChangingDocument) await this.transition;
    if (this.disposed) return true;
    if (!await this.prepareDocumentChange()) { this.stopping = false; return false; }
    const released = await Promise.all([...this.translations].map(s => this.releaseTranslation(s)));
    if (released.some(ok => !ok)) { this.stopping = false; this.releaseDocumentChange(); return false; }
    if (this.notes && !await this.notes.dispose()) {
      this.report('笔记尚未保存，已保留当前论文和草稿，请重试后再关闭。');
      this.stopping = false; this.releaseDocumentChange(); return false;
    }
    window.removeEventListener('beforeunload', this.beforeUnload);
    this.disposed=true; this.epoch++; this.cleanups.forEach(fn=>fn()); this.unsubscribeAnnotations?.();this.unsubscribeNotes?.(); this.imports.dispose();
    await Promise.all([this.annotations?.dispose(),this.reading?.dispose(),this.reader.dispose()]); await this.db.close(); this.releaseDocumentChange(); return true;
  }
}
