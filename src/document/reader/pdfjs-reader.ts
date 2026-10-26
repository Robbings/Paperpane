import { AnnotationEditorType, GlobalWorkerOptions, PasswordResponses, getDocument, type PDFDocumentLoadingTask, type PDFDocumentProxy } from 'pdfjs-dist';
import { mergeHighlightRects } from 'pdfjs-dist/build/paperpane-highlight-geometry.mjs';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { EventBus, PDFFindController, PDFLinkService, PDFViewer } from 'pdfjs-dist/web/pdf_viewer.mjs';
import type { AnnotationEditorUIManager } from 'pdfjs-dist/types/src/display/editor/tools';
import type { AnchorService, DocumentAnchor, DocumentRef, Projection, ProjectionSpace, SelectionSnapshot } from '@/contracts/document';
import type { ReaderService, ReaderState } from '@/contracts/reader';
import { failure, success, type Result, type Snapshot } from '@/contracts/common';
import type { Annotation } from '@/contracts/annotations';
import { SavedHighlights, pdfHighlightColors } from './saved-highlights';

GlobalWorkerOptions.workerSrc = workerUrl;
const empty = (): ReaderState => ({ sessionId: crypto.randomUUID(), document: null, phase: 'empty', pageCount: 0, position: { pageIndex: 0, offset: 0, zoom: 1, rotation: 0 }, selection: null, menuTarget: null, tool: 'select', search: {query: '', matchCase: false, wholeWord: false, status: 'idle', total: 0, current: 0}, textLayer: 'unknown', outline: [] });
function freeze<T>(value: T): T { if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(freeze); } return value; }

/** One owner per mounted surface. No database writes or replacement UI here. */
export class PdfjsReader implements ReaderService, AnchorService {
  private snapshot: Snapshot<ReaderState> = freeze({ mode: 'live', state: 'ready', data: empty() });
  private listeners = new Set<() => void>();
  private projections = { page: new Set<() => void>(), viewport: new Set<() => void>() };
  private eventBus = new EventBus();
  private viewer: PDFViewer;
  private links: PDFLinkService;
  private task?: PDFDocumentLoadingTask;
  private pdf?: PDFDocumentProxy;
  private highlights?: SavedHighlights;
  private annotations: readonly Annotation[] = [];
  private find: PDFFindController;
  private password?: { id: string; submit: (value: string) => void };
  private revision = 0;
  private disposed = false;
  private pointerStart?: {x:number;y:number};
  private observer: ResizeObserver;
  private lifecycle = new AbortController();
  private sessionLifecycle = new AbortController();

  constructor(private container: HTMLDivElement, private surface: HTMLDivElement) {
    this.links = new PDFLinkService({ eventBus: this.eventBus, externalLinkTarget: 2, externalLinkRel: 'noopener noreferrer' });
    this.find = new PDFFindController({ eventBus: this.eventBus, linkService: this.links });
    this.viewer = new PDFViewer({ container, viewer: surface, eventBus: this.eventBus, linkService: this.links, findController: this.find,
      ...{ abortSignal: this.lifecycle.signal },
      annotationEditorMode: AnnotationEditorType.NONE,
      annotationEditorHighlightColors: Object.entries(pdfHighlightColors).map(([k,v])=>`${k}=${v}`).join(','),
      enablePermissions: true, enableAutoLinking: false, removePageBorders: true });
    this.links.setViewer(this.viewer);
    this.eventBus.on('annotationeditoruimanager', ({ uiManager }: { uiManager: AnnotationEditorUIManager }) => {
      this.highlights?.dispose();
      this.highlights = new SavedHighlights(uiManager, this.viewer, message => this.publish({ error: {code: 'UNSUPPORTED_CONTENT', message, recovery: ['reload']} }));
      this.highlights.set(this.annotations);
    });
    this.eventBus.on('annotationeditorlayerrendered', () => { void this.highlights?.render(); this.invalidate(true); });
    this.eventBus.on('textlayerrendered', () => {
      const layers = [...this.surface.querySelectorAll('.textLayer')];
      const hasText = layers.some(layer => !!layer.textContent?.trim());
      this.publish({textLayer: hasText ? (layers.every(layer => !!layer.textContent?.trim()) ? 'available' : 'partial') : 'none'});
    });
    const matches = ({matchesCount}: {matchesCount?: {total:number;current:number}}) => {
      if (!this.snapshot.data.search.query) return;
      this.publish({search: {...this.snapshot.data.search, status: 'done', total: matchesCount?.total ?? 0, current: matchesCount?.current ?? 0}});
    };
    this.eventBus.on('updatefindmatchescount', matches);
    this.eventBus.on('updatefindcontrolstate', matches);
    this.eventBus.on('pagechanging', ({ pageNumber }: { pageNumber: number }) => this.position({ pageIndex: pageNumber - 1 }));
    this.eventBus.on('scalechanging', ({ scale }: { scale: number }) => { this.position({ zoom: scale }); this.invalidate(true); });
    this.eventBus.on('rotationchanging', ({ pagesRotation }: { pagesRotation: 0 | 90 | 180 | 270 }) => { this.position({ rotation: pagesRotation }); this.invalidate(true); });
    this.eventBus.on('pagerendered', () => this.invalidate(true));
    // Paperpane owns the pen and menus; native editor mode stays NONE.
    const options = { signal: this.lifecycle.signal };
    surface.addEventListener('pointerdown', event => { this.pointerStart={x:event.clientX,y:event.clientY}; }, options);
    surface.addEventListener('mouseup', this.captureSelection, { ...options, capture: true });
    surface.addEventListener('keyup', this.captureSelection, options);
    container.addEventListener('scroll', () => { this.invalidate(false); this.capturePosition(); }, { ...options, passive: true });
    window.addEventListener('resize', () => this.invalidate(true), options);
    this.observer = new ResizeObserver(() => this.invalidate(true)); this.observer.observe(container);
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  private reset(state: ReaderState) { if (this.disposed) return; this.snapshot = freeze({mode:'live',state:'ready',data:state}); this.listeners.forEach(fn=>fn()); }
  private publish(patch: Partial<ReaderState>) { if (this.disposed) return; this.snapshot = freeze({ mode: 'live', state: 'ready', data: { ...this.snapshot.data, ...patch } }); this.listeners.forEach(fn=>fn()); }
  private position(patch: Partial<ReaderState['position']>) { this.publish({ position: { ...this.snapshot.data.position, ...patch } }); }
  private capturePosition() {
    if (!this.ready().ok) return;
    const pageIndex = this.viewer.currentPageNumber - 1;
    const page = this.viewer.getPageView(pageIndex)?.div;
    if (!page) return;
    const box = page.getBoundingClientRect();
    const offset = Math.max(0, Math.min(1, (this.container.getBoundingClientRect().top - box.top) / Math.max(1, box.height)));
    const previous = this.snapshot.data.position;
    if (previous.pageIndex !== pageIndex || Math.abs(previous.offset - offset) > .001) this.position({ pageIndex, offset });
  }
  /** Restore the vertical fraction within the displayed page after zoom/rotation. */
  async restorePosition(position: ReaderState['position']): Promise<Result<void>> {
    const ready = this.ready(); if (!ready.ok) return ready;
    if (!Number.isFinite(position.offset) || position.offset < 0 || position.offset > 1) return failure('INVALID_INPUT', '阅读位置无效');
    const rotated = this.setRotation(position.rotation); if (!rotated.ok) return rotated;
    const zoomed = this.setZoom(position.zoom); if (!zoomed.ok) return zoomed;
    const navigated = await this.navigate(position.pageIndex); if (!navigated.ok) return navigated;
    const session = this.snapshot.data.sessionId;
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    if (this.disposed || this.snapshot.data.sessionId !== session) return failure('CANCELLED', '阅读会话已改变');
    const page = this.viewer.getPageView(position.pageIndex)?.div;
    if (page) {
      const box = page.getBoundingClientRect();
      this.container.scrollTop += box.top - this.container.getBoundingClientRect().top + box.height * position.offset;
      this.capturePosition();
    }
    return success(undefined);
  }
  private invalidate(page: boolean) { this.revision++; if (page) this.projections.page.forEach(fn=>fn()); this.projections.viewport.forEach(fn=>fn()); }
  subscribeProjection(space: ProjectionSpace, listener: () => void) { this.projections[space].add(listener); return () => this.projections[space].delete(listener); }
  async open(blob: Blob, ref: DocumentRef): Promise<void> {
    this.sessionLifecycle.abort(); this.sessionLifecycle = new AbortController();
    const sessionId = crypto.randomUUID(); const previous = this.task; this.task = undefined;
    this.password = undefined; this.highlights?.dispose(); this.highlights = undefined; this.annotations = []; this.pdf = undefined;
    this.reset({ ...empty(), sessionId, document: ref, phase: 'loading' });
    this.links.setDocument(null); this.viewer.setDocument(null); await previous?.destroy().catch(() => {});
    if (this.disposed || this.snapshot.data.sessionId !== sessionId) return;
    try {
      const data = new Uint8Array(await blob.arrayBuffer());
      if (this.disposed || this.snapshot.data.sessionId !== sessionId) return;
      const task = this.task = getDocument({ data, enableXfa: false });
      task.onProgress = ({loaded,total}: {loaded:number;total:number}) => { if (this.snapshot.data.sessionId === sessionId) this.publish({loadProgress: total > 0 ? Math.min(1,loaded/total) : undefined}); };
      task.onPassword = (submit: (password: string) => void, reason: number) => { if (this.snapshot.data.sessionId !== sessionId) return; const id = crypto.randomUUID(); this.password = { id, submit }; this.publish({ phase: 'password-required', passwordRequest: { requestId: id, incorrect: reason === PasswordResponses.INCORRECT_PASSWORD } }); };
      const pdf = await task.promise;
      if (this.disposed || this.snapshot.data.sessionId !== sessionId) return;
      this.pdf = pdf; this.links.setDocument(pdf);
      const initialized = this.waitForEvent('pagesinit', this.sessionLifecycle.signal);
      this.viewer.setDocument(pdf); await initialized;
      if (this.disposed || this.snapshot.data.sessionId !== sessionId) return;
      this.viewer.currentScaleValue = 'page-width';
      this.publish({ phase: 'ready', pageCount: pdf.numPages, passwordRequest: undefined, loadProgress: 1 });
      this.invalidate(true);
    } catch { if (!this.disposed && this.snapshot.data.sessionId === sessionId) this.publish({ phase: 'failed', error: { code: 'CORRUPT_FILE', message: '无法打开这份 PDF，请换一份文件重试。', recovery: ['choose-file'] } }); }
  }
  submitPassword(requestId: string, password: string): Result<void> { if (!this.password || this.password.id !== requestId) return failure('STALE_CONFIRMATION', '密码请求已过期'); const submit = this.password.submit; this.password = undefined; this.publish({ phase: 'loading', passwordRequest: undefined }); submit(password); return success(undefined); }
  private ready(): Result<void> { return !this.disposed && this.snapshot.data.phase === 'ready' ? success(undefined) : failure('BUSY', '论文尚未就绪'); }
  async navigate(pageIndex: number): Promise<Result<void>> { const ready = this.ready(); if (!ready.ok) return ready; if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= this.snapshot.data.pageCount) return failure('INVALID_INPUT', '页码超出范围'); this.viewer.scrollPageIntoView({ pageNumber: pageIndex + 1 }); return success(undefined); }
  setZoom(zoom: number): Result<void> { const ready = this.ready(); if (!ready.ok) return ready; if (!Number.isFinite(zoom) || zoom < .25 || zoom > 4) return failure('INVALID_INPUT', '缩放须在 25% 至 400% 之间'); this.viewer.currentScale = zoom; return success(undefined); }
  setRotation(rotation: 0 | 90 | 180 | 270): Result<void> { const ready = this.ready(); if (!ready.ok) return ready; if (![0,90,180,270].includes(rotation)) return failure('INVALID_INPUT', '旋转角度无效'); this.viewer.pagesRotation = rotation; return success(undefined); }
  private matches(ref: DocumentRef) { const current = this.snapshot.data.document; return current?.documentId === ref.documentId && current.fileVersion === ref.fileVersion; }
  private captureSelection = (event: Event) => {
    if (!this.ready().ok) return;
    if (event instanceof MouseEvent && event.button !== 0) return;
    if (event instanceof KeyboardEvent && !['Shift','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)) return;
    const selection = window.getSelection(); const ref = this.snapshot.data.document;
    // A plain click on an existing band is an annotation action even if the
    // browser has not yet collapsed its old Range during mouseup capture.
    if (event instanceof MouseEvent && event.detail < 2 && !event.shiftKey && this.pointerStart && Math.hypot(event.clientX-this.pointerStart.x,event.clientY-this.pointerStart.y)<4) {
      const row=this.hitAnnotation(event.clientX,event.clientY);
      if (row) { this.showAnnotation(row.id); return; }
    }
    if (!selection || !selection.rangeCount || selection.isCollapsed || !ref) {
      this.publish({selection:null,menuTarget:null}); return;
    }
    const range = selection.getRangeAt(0);
    if (!this.surface.contains(range.commonAncestorContainer)) return;
    const pages: DocumentAnchor['pages'][number][] = [];
    // Clip the native range to each text layer, avoiding ancestors' duplicate bounding boxes.
    for (const layer of this.surface.querySelectorAll<HTMLElement>('.textLayer')) {
      if (!range.intersectsNode(layer)) continue;
      const page = layer.closest<HTMLElement>('.page'); const pageIndex = Number(page?.dataset.pageNumber) - 1;
      const view = this.viewer.getPageView(pageIndex); if (!page || !view?.pdfPage) continue;
      const part = range.cloneRange(); if (!layer.contains(part.startContainer)) part.setStart(layer, 0); if (!layer.contains(part.endContainer)) part.setEnd(layer, layer.childNodes.length);
      const bounds = layer.getBoundingClientRect(); const crop = view.pdfPage.view as number[];
      // Only leaf text ranges: container rectangles can span columns or several lines.
      const clientRects: DOMRect[] = [];
      const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!part.intersectsNode(node)) continue;
        const leaf = document.createRange(); leaf.selectNodeContents(node);
        if (node === part.startContainer) leaf.setStart(node, part.startOffset);
        if (node === part.endContainer) leaf.setEnd(node, part.endOffset);
        clientRects.push(...leaf.getClientRects());
      }
      const rects = clientRects.filter(r=>r.width>0 && r.height>0).map(r=>{
        const a = view.viewport.convertToPdfPoint(r.left-bounds.left, r.top-bounds.top) as number[];
        const b = view.viewport.convertToPdfPoint(r.right-bounds.left, r.bottom-bounds.top) as number[];
        return { x: Math.min(a[0]!,b[0]!)-crop[0]!, y: Math.min(a[1]!,b[1]!)-crop[1]!, width: Math.abs(a[0]!-b[0]!), height: Math.abs(a[1]!-b[1]!) };
      });
      if (rects.length) pages.push({ pageIndex, rects, quote: { exact: part.toString() } });
    }
    if (!pages.length || !selection.toString().trim()) return;
    const anchor: DocumentAnchor = { ...ref, pages };
    const captured = { id: crypto.randomUUID(), snapshot: { anchor, text: selection.toString() }, projection: this.project(anchor, 'viewport') as Projection & { space: 'viewport' } };
    this.publish({ selection: captured, menuTarget: {kind: 'selection', selection: captured} });
  };
  private hitAnnotation(x: number, y: number) {
    return [...this.annotations].reverse().find(row => !row.deletedAt && row.anchor.pages.some(page => {
      const projection = this.project({...row.anchor,pages:[{...page,rects:mergeHighlightRects(page.rects)}]},'viewport');
      return projection.state === 'ready' && projection.rects.some(({rect:r}) => x>=r.left-2 && x<=r.left+r.width+2 && y>=r.top-2 && y<=r.top+r.height+2);
    }));
  }
  clearNativeSelection(id: string) { if (this.snapshot.data.selection?.id === id) window.getSelection()?.removeAllRanges(); }
  resolveSelection(id: string): Result<SelectionSnapshot> { const s = this.snapshot.data.selection; return s?.id === id && this.matches(s.snapshot.anchor) && !this.disposed ? success(s.snapshot) : failure('STALE_CONFIRMATION', '选区已改变，请重新选择'); }
  dismissSelection(id: string) { if (this.snapshot.data.selection?.id === id) { this.publish({ selection: null, menuTarget: null }); } }
  project(anchor: DocumentAnchor, space: ProjectionSpace): Projection {
    if (!this.matches(anchor) || this.disposed) return { space, state: 'unavailable', error: { code: 'NOT_FOUND', message: '文档版本已改变', recovery: [] } };
    const pending: number[] = []; const rects: { pageIndex: number; rect: { left: number; top: number; width: number; height: number } }[] = [];
    for (const item of anchor.pages) {
      const view = this.viewer.getPageView(item.pageIndex); const layer = view?.div;
      if (!view?.pdfPage || !layer) { pending.push(item.pageIndex); continue; }
      const bounds = layer.getBoundingClientRect(); const crop = view.pdfPage.view as number[];
      for (const r of item.rects) { const a = view.viewport.convertToViewportPoint(r.x+crop[0]!,r.y+crop[1]!) as number[], b = view.viewport.convertToViewportPoint(r.x+r.width+crop[0]!,r.y+r.height+crop[1]!) as number[]; const v = [...a,...b];
        rects.push({ pageIndex: item.pageIndex, rect: { left: Math.min(v[0]!,v[2]!)+(space==='viewport'?bounds.left:0), top: Math.min(v[1]!,v[3]!)+(space==='viewport'?bounds.top:0), width: Math.abs(v[2]!-v[0]!), height: Math.abs(v[3]!-v[1]!) } }); }
    }
    return pending.length ? { space, state: 'pending', pageIndexes: pending } : { space, state: 'ready', accuracy: 'exact', revision: String(this.revision), rects };
  }
  async locate(anchor: DocumentAnchor) {
    if (!this.matches(anchor) || !anchor.pages.length || !this.pdf) return { state: 'unavailable' as const, error: { code: 'NOT_FOUND' as const, message: '定位目标不属于当前文档', recovery: [] } };
    const page = anchor.pages[0]!; const session = this.snapshot.data.sessionId;
    const result = await this.navigate(page.pageIndex);
    if (!result.ok) return { state: 'unavailable' as const, error: result.error };
    try {
      const pdfPage = await this.pdf.getPage(page.pageIndex + 1);
      if (this.disposed || this.snapshot.data.sessionId !== session) throw new Error('Stale session');
      const rect = page.rects[0];
      if (rect) this.viewer.scrollPageIntoView({ pageNumber: page.pageIndex + 1, destArray: [null, { name: 'XYZ' }, rect.x + pdfPage.view[0]!, rect.y + rect.height + pdfPage.view[1]!, null] });
      return { state: 'exact' as const, anchor };
    } catch { return { state: 'unavailable' as const, error: { code: 'NOT_FOUND' as const, message: '原文位置暂时不可用', recovery: [] } }; }
  }
  private waitForEvent(name: string, signal: AbortSignal): Promise<void> {
    return new Promise((resolve,reject)=>{
      if (signal.aborted) { reject(new Error('Session ended')); return; }
      const cleanup=()=>{clearTimeout(timeout);this.eventBus.off(name,done);signal.removeEventListener('abort',abort);};
      const done=()=>{cleanup();resolve();};
      const abort=()=>{cleanup();reject(new Error('Session ended'));};
      const timeout=setTimeout(()=>{cleanup();reject(new Error('Reader event timeout'));},15000);
      this.eventBus.on(name,done,{once:true});signal.addEventListener('abort',abort,{once:true});
    });
  }
  setAnnotations(items: readonly Annotation[]) {
    this.annotations = items; this.highlights?.set(items);
    const target = this.snapshot.data.menuTarget;
    if (target?.kind === 'annotation') {
      const row = items.find(row => row.id === target.annotationId && !row.deletedAt);
      if (!row) this.dismissMenu();
      else if (row.color !== target.color) this.publish({menuTarget:{...target,color:row.color}});
    }
  }
  showAnnotation(id: string) {
    const row = this.annotations.find(row => row.id === id && !row.deletedAt); if (!row) return;
    window.getSelection()?.removeAllRanges();
    this.publish({selection:null, menuTarget:{kind:'annotation',annotationId:id,anchor:row.anchor,color:row.color}});
  }
  setTool(tool: ReaderState['tool']) { this.publish({tool}); }
  dismissMenu() { if (this.snapshot.data.menuTarget || this.snapshot.data.selection) this.publish({menuTarget:null,selection:null}); }
  search(query: string, options: {matchCase: boolean; wholeWord: boolean}) {
    this.publish({search:{query,...options,status:query?'searching':'idle',total:0,current:0}});
    if (!query) { this.eventBus.dispatch('findbarclose', {source:this}); return; }
    this.eventBus.dispatch('find', {source:this, type:'', query, caseSensitive:options.matchCase, entireWord:options.wholeWord, highlightAll:true, findPrevious:false, matchDiacritics:false});
  }
  stepSearch(direction: 1 | -1) { const s=this.snapshot.data.search; if(s.query) this.eventBus.dispatch('find',{source:this,type:'again',query:s.query,caseSensitive:s.matchCase,entireWord:s.wholeWord,highlightAll:true,findPrevious:direction===-1,matchDiacritics:false}); }
  closeSearch() { this.search('',{matchCase:false,wholeWord:false}); }
  async cancelOpen(): Promise<void> {
    if (this.disposed) return;
    this.sessionLifecycle.abort(); this.sessionLifecycle = new AbortController();
    const task = this.task; this.task = undefined;
    this.password = undefined; this.highlights?.dispose(); this.highlights = undefined; this.annotations = []; this.pdf = undefined;
    this.reset(empty()); this.links.setDocument(null); this.viewer.setDocument(null);
    await task?.destroy().catch(() => {});
  }
  async cancelPassword(id: string): Promise<Result<void>> {
    if (this.password?.id !== id) return failure('STALE_CONFIRMATION','密码请求已结束');
    await this.cancelOpen(); return success(undefined);
  }
  async dispose() { if (this.disposed) return; this.disposed = true; this.sessionLifecycle.abort(); this.lifecycle.abort(); this.observer.disconnect(); this.listeners.clear(); Object.values(this.projections).forEach(s=>s.clear()); this.password = undefined; this.highlights?.dispose(); this.highlights = undefined; this.links.setDocument(null); this.viewer.setDocument(null); await this.task?.destroy().catch(()=>{}); }
}
