import { setPaperpaneViewerTheme } from 'pdfjs-dist/build/paperpane-theme.mjs';
import { TextLayer, AnnotationMode, AnnotationEditorType, GlobalWorkerOptions, PasswordResponses, getDocument, type PDFDocumentLoadingTask, type PDFDocumentProxy } from 'pdfjs-dist';
import { mergeHighlightRects } from 'pdfjs-dist/build/paperpane-highlight-geometry.mjs';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { EventBus, PDFFindController, PDFLinkService, PDFViewer, ScrollMode, SpreadMode } from 'pdfjs-dist/web/pdf_viewer.mjs';
import type { AnnotationEditorUIManager } from 'pdfjs-dist/types/src/display/editor/tools';
import type { AnchorService, DocumentAnchor, DocumentRef, Projection, ProjectionSpace, SelectionSnapshot } from '@/contracts/document';
import type { ReaderService, ReaderState } from '@/contracts/reader';
import { failure, success, type Result, type Snapshot } from '@/contracts/common';
import type { Annotation } from '@/contracts/annotations';
import { SavedHighlights, pdfHighlightColors } from './saved-highlights';
import { extractPaper } from '@/translation/extract';
import { passageScroll } from './locate-scroll';
import { LocateFlash } from './locate-flash';

GlobalWorkerOptions.workerSrc = workerUrl;
// Pin the invisible fallback used by both PDF.js canvas measurement and DOM.
// Generic sans-serif resolved differently in the host browser (about 6% wider),
// shifting selection endpoints. Original PDF canvas fonts are untouched.
TextLayer.fontFamilyMap.set('sans-serif', 'Arial, sans-serif');
const empty = (): ReaderState => ({ sessionId: crypto.randomUUID(), document: null, phase: 'empty', pageCount: 0, position: { pageIndex: 0, offset: 0, zoom: 1, rotation: 0 }, selection: null, menuTarget: null, tool: 'select', search: {query: '', matchCase: false, wholeWord: false, status: 'idle', total: 0, current: 0}, textLayer: 'unknown', outline: [] });
function freeze<T>(value: T): T { if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(freeze); } return value; }

/** One owner per mounted surface. No database writes or replacement UI here. */
export class PdfjsReader implements ReaderService, AnchorService {
  private snapshot: Snapshot<ReaderState> = freeze({ mode: 'live', state: 'ready', data: empty() });
  private listeners = new Set<() => void>();
  private projections = { page: new Set<() => void>(), viewport: new Set<() => void>() };
  private eventBus = new EventBus();
  private viewer: PDFViewer;
  private pageTheme: {background:string;foreground:string} | null = null;
  private links: PDFLinkService;
  private task?: PDFDocumentLoadingTask;
  private pdf?: PDFDocumentProxy;
  private highlights?: SavedHighlights;
  private annotations: readonly Annotation[] = [];
  private find: PDFFindController;
  private password?: { id: string; submit: (value: string) => void };
  private revision = 0;
  private locateRequest = 0;
  private findScrollLeft?: number;
  private locateFlash:LocateFlash;
  private disposed = false;
  private lastWheelTurn = 0;
  private pointerStart?: {x:number;y:number};
  private observer: ResizeObserver;
  private lifecycle = new AbortController();
  private sessionLifecycle = new AbortController();

  constructor(private container: HTMLDivElement, private surface: HTMLDivElement) {
    this.locateFlash=new LocateFlash(container);
    this.links = new PDFLinkService({ eventBus: this.eventBus, externalLinkTarget: 2, externalLinkRel: 'noopener noreferrer' });
    this.find = new PDFFindController({ eventBus: this.eventBus, linkService: this.links });
    this.viewer = new PDFViewer({ container, viewer: surface, eventBus: this.eventBus, linkService: this.links, findController: this.find,
      ...{ abortSignal: this.lifecycle.signal },
      annotationEditorMode: AnnotationEditorType.NONE,
      annotationEditorHighlightColors: Object.entries(pdfHighlightColors).map(([k,v])=>`${k}=${v}`).join(','),
      enablePermissions: true, enableAutoLinking: false, removePageBorders: true });
    this.links.setViewer(this.viewer);
    // Keep PDF.js match selection and its one-shot scroll guard; use the same landing policy as annotations.
    this.find.scrollMatchIntoView = ({element,pageIndex,matchIndex}) => {
      if(!this.find._scrollMatches||!element||pageIndex<0||matchIndex<0||pageIndex!==this.find.selected?.pageIdx||matchIndex!==this.find.selected?.matchIdx)return;
      this.find._scrollMatches=false;
      ++this.locateRequest;
      this.revealPassage([element.getBoundingClientRect()],this.findScrollLeft);
      this.findScrollLeft=undefined;
      this.locateFlash.show(()=>element.isConnected?[...element.getClientRects()]:[]);
    };
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
    this.eventBus.on('scalechanging', ({ scale, presetValue }: { scale: number; presetValue?: string }) => { this.position({ zoom: scale, zoomMode: presetValue === 'page-width' ? 'width' : 'manual' }); this.invalidate(true); });
    this.eventBus.on('rotationchanging', ({ pagesRotation }: { pagesRotation: 0 | 90 | 180 | 270 }) => { this.position({ rotation: pagesRotation }); this.invalidate(true); });
    this.eventBus.on('pagerendered', () => this.invalidate(true));
    // Paperpane owns the pen and menus; native editor mode stays NONE.
    const options = { signal: this.lifecycle.signal };
    surface.addEventListener('pointerdown', event => { this.pointerStart={x:event.clientX,y:event.clientY}; }, options);
    surface.addEventListener('mouseup', this.captureSelection, { ...options, capture: true });
    surface.addEventListener('keyup', this.captureSelection, options);
    container.addEventListener('scroll', () => { this.invalidate(false); this.capturePosition(); }, { ...options, passive: true });
    container.addEventListener('wheel', this.scrollPages, {...options, passive:false});
    window.addEventListener('resize', () => this.invalidate(true), options);
    this.observer = new ResizeObserver(() => {
      if (this.ready().ok && this.snapshot.data.position.zoomMode === 'width') {
        this.applyWidthScale();
      }
      this.invalidate(true);
    }); this.observer.observe(container);
  }
  private scrollPages = (event: WheelEvent) => {
    if(!this.ready().ok||event.ctrlKey||event.metaKey||(event.target as Element).closest('[data-pp-overlay]'))return;
    if(this.viewer.scrollMode===ScrollMode.HORIZONTAL&&!event.shiftKey&&!event.deltaX&&event.deltaY){
      event.preventDefault();
      this.container.scrollLeft+=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?this.container.clientWidth:1);
      return;
    }
    if(this.viewer.scrollMode!==ScrollMode.PAGE||Math.abs(event.deltaX)>Math.abs(event.deltaY)||!event.deltaY)return;
    const forward=event.deltaY>0;
    const atEdge=forward?this.container.scrollTop+this.container.clientHeight>=this.container.scrollHeight-2:this.container.scrollTop<=2;
    if(!atEdge)return;
    event.preventDefault();
    const now=performance.now();if(now-this.lastWheelTurn<400)return;
    const changed=forward?this.viewer.nextPage():this.viewer.previousPage();
    if(changed){this.lastWheelTurn=now;if(!forward)this.container.scrollTop=this.container.scrollHeight-this.container.clientHeight;this.invalidate(true);}
  };
  /** Visible paper viewport, for clipping transient translation geometry. */
  translationViewport = () => this.container.getBoundingClientRect();
  translationScrollElement = () => this.container;
  /** Geometry only: page actions are rendered by Paperpane, outside the PDF canvas. */
  translationPageRects = () => {
    const viewport = this.container.getBoundingClientRect();
    return Array.from({ length: this.snapshot.data.pageCount }, (_, pageIndex) => {
      const rect = this.viewer.getPageView(pageIndex)?.div.getBoundingClientRect();
      return rect && rect.bottom > viewport.top && rect.top < viewport.bottom ? { pageIndex, rect } : null;
    }).filter((page): page is { pageIndex: number; rect: DOMRect } => page !== null);
  };
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
    const zoomed = position.zoomMode === 'width' ? this.fitWidth() : this.setZoom(position.zoom); if (!zoomed.ok) return zoomed;
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
  private invalidate(page: boolean) { this.locateFlash?.paint(); this.revision++; if (page) this.projections.page.forEach(fn=>fn()); this.projections.viewport.forEach(fn=>fn()); }
  subscribeProjection(space: ProjectionSpace, listener: () => void) { this.projections[space].add(listener); return () => this.projections[space].delete(listener); }
  async open(blob: Blob, ref: DocumentRef): Promise<void> {
    this.locateFlash.clear();
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
      this.applyWidthScale();
      this.publish({ phase: 'ready', pageCount: pdf.numPages, passwordRequest: undefined, loadProgress: 1 });
      this.invalidate(true);
    } catch { if (!this.disposed && this.snapshot.data.sessionId === sessionId) this.publish({ phase: 'failed', error: { code: 'CORRUPT_FILE', message: '无法打开这份 PDF，请换一份文件重试。', recovery: ['choose-file'] } }); }
  }
  submitPassword(requestId: string, password: string): Result<void> { if (!this.password || this.password.id !== requestId) return failure('STALE_CONFIRMATION', '密码请求已过期'); const submit = this.password.submit; this.password = undefined; this.publish({ phase: 'loading', passwordRequest: undefined }); submit(password); return success(undefined); }
  private ready(): Result<void> { return !this.disposed && this.snapshot.data.phase === 'ready' ? success(undefined) : failure('BUSY', '论文尚未就绪'); }
  async navigate(pageIndex: number): Promise<Result<void>> { this.locateFlash.clear(); ++this.locateRequest; const ready = this.ready(); if (!ready.ok) return ready; if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= this.snapshot.data.pageCount) return failure('INVALID_INPUT', '页码超出范围'); this.viewer.scrollPageIntoView({ pageNumber: pageIndex + 1 }); return success(undefined); }
  setZoom(zoom: number): Result<void> { const ready = this.ready(); if (!ready.ok) return ready; if (!Number.isFinite(zoom) || zoom < .25 || zoom > 4) return failure('INVALID_INPUT', '缩放须在 25% 至 400% 之间'); this.viewer.currentScale = zoom; this.position({zoomMode:'manual'}); return success(undefined); }
  private applyWidthScale() {
    const page = this.viewer.getPageView(this.viewer.currentPageNumber - 1);
    if (!page) return;
    // The reader reserves real padding for its floating bar and page actions.
    // PDF.js' native page-width preset only subtracts its own viewer borders.
    const style = getComputedStyle(this.container);
    const room = this.container.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const spread = this.viewer.spreadMode !== SpreadMode.NONE && this.viewer.scrollMode !== ScrollMode.HORIZONTAL;
    const scale = Math.max(.01, (room - (spread ? 8 : 0)) / (page.width / page.scale) / (spread ? 2 : 1));
    this.viewer.currentScale = scale;
    this.position({zoomMode:'width'});
  }
  fitWidth(): Result<void> {
    const ready = this.ready(); if (!ready.ok) return ready;
    this.applyWidthScale(); return success(undefined);
  }
  setDisplay(options: {scroll:'vertical'|'horizontal'|'page'; spread:'none'|'odd'|'even'; theme:'original'|'dark'|'black'|'sepia'}) {
    if(this.disposed)return;
    const colors = options.theme==='dark' ? {background:'#2f3440',foreground:'#d9dce3'}
      : options.theme==='black' ? {background:'#101114',foreground:'#e1e1e5'}
      : options.theme==='sepia' ? {background:'#f4ecd8',foreground:'#4d4233'} : null;
    if(JSON.stringify(this.pageTheme)!==JSON.stringify(colors)) {
      this.pageTheme=colors;
      setPaperpaneViewerTheme(this.surface, colors);
      this.surface.style.setProperty('--page-bg-color',colors?.background??'#ffffff');
      for(let i=0;i<this.viewer.pagesCount;i++){
        const page=this.viewer.getPageView(i);
        page.reset({keepAnnotationLayer:true,keepAnnotationEditorLayer:true,keepTextLayer:true});
      }
      this.viewer.update();
    }
    this.viewer.scrollMode=options.scroll==='horizontal'?ScrollMode.HORIZONTAL:options.scroll==='page'?ScrollMode.PAGE:ScrollMode.VERTICAL;
    this.viewer.spreadMode=options.spread==='odd'?SpreadMode.ODD:options.spread==='even'?SpreadMode.EVEN:SpreadMode.NONE;
    if(this.snapshot.data.position.zoomMode==='width')this.applyWidthScale();
    this.invalidate(true);
  }
  setRotation(rotation: 0 | 90 | 180 | 270): Result<void> { const ready = this.ready(); if (!ready.ok) return ready; if (![0,90,180,270].includes(rotation)) return failure('INVALID_INPUT', '旋转角度无效'); const fit = this.snapshot.data.position.zoomMode === 'width'; this.viewer.pagesRotation = rotation; if(fit)this.applyWidthScale(); return success(undefined); }
  async captureImage(pageIndex:number,rect:{left:number;top:number;width:number;height:number}) {
    const view=this.viewer.getPageView(pageIndex),pdf=this.pdf,ref=this.snapshot.data.document,session=this.snapshot.data.sessionId;
    if(!view?.pdfPage||!pdf||!ref||!this.surface.contains(view.div))throw new Error('目标页尚未就绪');
    const bounds=view.div.getBoundingClientRect(),crop=view.pdfPage.view as number[];
    const a=view.viewport.convertToPdfPoint((rect.left-bounds.left)*view.viewport.width/bounds.width,(rect.top-bounds.top)*view.viewport.height/bounds.height);
    const b=view.viewport.convertToPdfPoint((rect.left+rect.width-bounds.left)*view.viewport.width/bounds.width,(rect.top+rect.height-bounds.top)*view.viewport.height/bounds.height);
    const points=[Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[0],b[0]),Math.max(a[1],b[1])];
    const anchor:DocumentAnchor={...ref,pages:[{pageIndex,rects:[{x:points[0]!-crop[0]!,y:points[1]!-crop[1]!,width:points[2]!-points[0]!,height:points[3]!-points[1]!}]}]};
    const pdfPage=await pdf.getPage(pageIndex+1);let viewport=pdfPage.getViewport({scale:8/3,rotation:view.viewport.rotation});
    const project=(v:typeof viewport)=>[...v.convertToViewportPoint(points[0]!,points[1]!),...v.convertToViewportPoint(points[2]!,points[3]!)];
    let projected=project(viewport);const factor=Math.min(1,2048/Math.max(Math.abs(projected[2]-projected[0]),Math.abs(projected[3]-projected[1])));
    viewport=pdfPage.getViewport({scale:8/3*factor,rotation:view.viewport.rotation});projected=project(viewport);
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.ceil(Math.abs(projected[2]-projected[0])));canvas.height=Math.max(1,Math.ceil(Math.abs(projected[3]-projected[1])));
    const task=pdfPage.render({canvas,viewport,transform:[1,0,0,1,-Math.min(projected[0],projected[2]),-Math.min(projected[1],projected[3])],background:'#ffffff',annotationMode:AnnotationMode.DISABLE});
    const abort=()=>task.cancel();this.sessionLifecycle.signal.addEventListener('abort',abort,{once:true});
    try{await task.promise;if(this.snapshot.data.sessionId!==session)throw new Error('论文已切换');const blob=await new Promise<Blob>((ok,no)=>canvas.toBlob(b=>b?ok(b):no(new Error('无法生成截图')),'image/png'));return {anchor,blob};}
    finally{this.sessionLifecycle.signal.removeEventListener('abort',abort);canvas.width=canvas.height=0;}
  }
  /** Original white page, independent of viewer zoom, theme and saved annotations. */
  async layoutPage(pageIndex:number,signal:AbortSignal){
    const pdf=this.pdf,ref=this.snapshot.data.document,session=this.snapshot.data.sessionId;
    if(!pdf||!ref)throw new Error('论文尚未就绪');
    const page=await pdf.getPage(pageIndex+1),base=page.getViewport({scale:1,rotation:0});
    const viewport=page.getViewport({scale:1600/Math.max(base.width,base.height),rotation:0});
    const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
    const all=AbortSignal.any([signal,this.sessionLifecycle.signal]);all.throwIfAborted();
    const task=page.render({canvas,viewport,background:'#ffffff',annotationMode:AnnotationMode.DISABLE}),abort=()=>task.cancel();all.addEventListener('abort',abort,{once:true});
    try{await task.promise;all.throwIfAborted();if(this.snapshot.data.sessionId!==session)throw new Error('论文已切换');
      const blob=await new Promise<Blob>((ok,no)=>canvas.toBlob(b=>b?ok(b):no(new Error('页面渲染失败')),'image/png'));
      return {blob,width:canvas.width,height:canvas.height};
    }finally{all.removeEventListener('abort',abort);canvas.width=canvas.height=0;}
  }
  async elementAnchor(pageIndex:number,box:readonly number[]):Promise<DocumentAnchor>{
    const pdf=this.pdf,ref=this.snapshot.data.document;if(!pdf||!ref)throw new Error('论文尚未就绪');
    const page=await pdf.getPage(pageIndex+1),crop=page.view as number[],v=page.getViewport({scale:1,rotation:0});
    const a=v.convertToPdfPoint(box[0]!*v.width,box[1]!*v.height),b=v.convertToPdfPoint(box[2]!*v.width,box[3]!*v.height);
    return {...ref,pages:[{pageIndex,rects:[{x:Math.min(a[0],b[0])-crop[0]!,y:Math.min(a[1],b[1])-crop[1]!,width:Math.abs(b[0]-a[0]),height:Math.abs(b[1]-a[1])}]}]};
  }
  async elementText(anchor:DocumentAnchor){
    if(!this.pdf||!this.matches(anchor))return '';
    const parts:string[]=[];
    for(const a of anchor.pages){const page=await this.pdf.getPage(a.pageIndex+1),crop=page.view as number[],text=await page.getTextContent();
      for(const item of text.items){if(!('str' in item))continue;const x=item.transform[4]-crop[0]!,y=item.transform[5]-crop[1]!,w=item.width,h=item.height;
        if(a.rects.some(r=>x+w>=r.x&&x<=r.x+r.width&&y+h>=r.y&&y<=r.y+r.height))parts.push(item.str);
      }
    }return parts.join(' ').replace(/\s+/g,' ').trim();
  }
  async captureAnchor(anchor:DocumentAnchor,signal:AbortSignal){
    const pdf=this.pdf,session=this.snapshot.data.sessionId;
    if(!pdf||!this.matches(anchor))throw new Error('论文已切换');
    const part=anchor.pages[0]!,r=part.rects[0]!,page=await pdf.getPage(part.pageIndex+1),crop=page.view as number[];
    const scale=Math.min(4,2048/Math.max(r.width,r.height)),v=page.getViewport({scale,rotation:0});
    const a=v.convertToViewportPoint(r.x+crop[0]!,r.y+crop[1]!),b=v.convertToViewportPoint(r.x+r.width+crop[0]!,r.y+r.height+crop[1]!);
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.ceil(Math.abs(b[0]-a[0])));canvas.height=Math.max(1,Math.ceil(Math.abs(b[1]-a[1])));
    const all=AbortSignal.any([signal,this.sessionLifecycle.signal]);all.throwIfAborted();
    const task=page.render({canvas,viewport:v,transform:[1,0,0,1,-Math.min(a[0],b[0]),-Math.min(a[1],b[1])],background:'#ffffff',annotationMode:AnnotationMode.DISABLE}),abort=()=>task.cancel();all.addEventListener('abort',abort,{once:true});
    try{await task.promise;all.throwIfAborted();if(this.snapshot.data.sessionId!==session)throw new Error('论文已切换');
      const blob=await new Promise<Blob>((ok,no)=>canvas.toBlob(b=>b?ok(b):no(new Error('截图失败')),'image/png'));return {anchor,blob};
    }finally{all.removeEventListener('abort',abort);canvas.width=canvas.height=0;}
  }
  async extractTranslation(signal: AbortSignal, progress: (n:number)=>void) {
    const pdf=this.pdf, ref=this.snapshot.data.document;
    if(!pdf||!ref||this.snapshot.data.phase!=='ready')throw new Error('论文尚未就绪。');
    return extractPaper(pdf,ref,AbortSignal.any([signal,this.sessionLifecycle.signal]),progress);
  }
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
      const clientRects: {left:number;top:number;right:number;bottom:number;width:number;height:number}[] = [];
      const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!part.intersectsNode(node)) continue;
        const leaf = document.createRange(); leaf.selectNodeContents(node);
        if (node === part.startContainer) leaf.setStart(node, part.startOffset);
        if (node === part.endContainer) leaf.setEnd(node, part.endOffset);
        if (leaf.collapsed || !leaf.toString().trim()) continue;
        const span = node.parentElement;
        if (!span) continue;
        const em = span.getBoundingClientRect();
        // A browser Range includes fallback-font ascent/descent outside PDF.js's
        // positioned glyph run. Keep its selected character extent, but use the
        // text layer's em box in the perpendicular direction (also at 90/270°).
        const vertical = view.viewport.rotation % 180 !== 0;
        for (const rect of leaf.getClientRects()) {
          const left = vertical ? em.left : rect.left, right = vertical ? em.right : rect.right;
          const top = vertical ? rect.top : em.top, bottom = vertical ? rect.bottom : em.bottom;
          if(right>left && bottom>top)clientRects.push({left,right,top,bottom,width:right-left,height:bottom-top});
        }
      }
      const rects = clientRects.filter(r=>r.width>0 && r.height>0).map(r=>{
        const a = view.viewport.convertToPdfPoint((r.left-bounds.left)*view.viewport.width/bounds.width, (r.top-bounds.top)*view.viewport.height/bounds.height) as number[];
        const b = view.viewport.convertToPdfPoint((r.right-bounds.left)*view.viewport.width/bounds.width, (r.bottom-bounds.top)*view.viewport.height/bounds.height) as number[];
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
      // PAGE mode retains page views but detaches every other spread. Their
      // local PDF geometry is valid; zero screen bounds are not a projection.
      if (space === 'viewport' && (!layer.isConnected || !this.surface.contains(layer) || bounds.width <= 0 || bounds.height <= 0)) {
        pending.push(item.pageIndex); continue;
      }
      for (const r of item.rects) { const a = view.viewport.convertToViewportPoint(r.x+crop[0]!,r.y+crop[1]!) as number[], b = view.viewport.convertToViewportPoint(r.x+r.width+crop[0]!,r.y+r.height+crop[1]!) as number[]; const v = [...a,...b];
        rects.push({ pageIndex: item.pageIndex, rect: { left: Math.min(v[0]!,v[2]!)+(space==='viewport'?bounds.left:0), top: Math.min(v[1]!,v[3]!)+(space==='viewport'?bounds.top:0), width: Math.abs(v[2]!-v[0]!), height: Math.abs(v[3]!-v[1]!) } }); }
    }
    return pending.length ? { space, state: 'pending', pageIndexes: pending } : { space, state: 'ready', accuracy: 'exact', revision: String(this.revision), rects };
  }
  private revealPassage(rects:readonly {left:number;top:number;width:number;height:number}[],preferredLeft?:number){
    if(!rects.length)return;
    const left=Math.min(...rects.map(r=>r.left)),top=Math.min(...rects.map(r=>r.top));
    const right=Math.max(...rects.map(r=>r.left+r.width)),bottom=Math.max(...rects.map(r=>r.top+r.height));
    const el=this.container,box=el.getBoundingClientRect();
    const destination=passageScroll({left,top,width:right-left,height:bottom-top},{left:box.left+el.clientLeft,top:box.top+el.clientTop,width:el.clientWidth,height:el.clientHeight,scrollLeft:el.scrollLeft,scrollTop:el.scrollTop,scrollWidth:el.scrollWidth,scrollHeight:el.scrollHeight},preferredLeft);
    el.scrollTo({...destination,behavior:'instant'});
    this.viewer.update();this.capturePosition();this.invalidate(false);
  }
  async locate(anchor: DocumentAnchor) {
    if (!this.matches(anchor) || !anchor.pages.length || !this.pdf) return { state: 'unavailable' as const, error: { code: 'NOT_FOUND' as const, message: '定位目标不属于当前文档', recovery: [] } };
    this.locateFlash.clear();
    const page=anchor.pages[0]!,session=this.snapshot.data.sessionId,ticket=++this.locateRequest;
    try {
      const pdfPage=await this.pdf.getPage(page.pageIndex+1);
      if(this.disposed||this.snapshot.data.sessionId!==session||ticket!==this.locateRequest)throw new Error('Stale location');
      const view=this.viewer.getPageView(page.pageIndex);
      if(!view)throw new Error('Missing page');
      // Load the page's true crop/rotation geometry without first jumping to its upper-left corner.
      if(!view.pdfPage)view.setPdfPage(pdfPage);
      const preferredLeft=this.container.scrollLeft;
      if(this.viewer.scrollMode===ScrollMode.PAGE&&!this.surface.contains(view.div)){
        // Let PDF.js attach the requested page/spread before measuring it.
        // Do not call navigate(): that would cancel this location request.
        this.viewer.scrollPageIntoView({pageNumber:page.pageIndex+1});
        await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
        if(this.disposed||this.snapshot.data.sessionId!==session||ticket!==this.locateRequest)throw new Error('Stale location');
      }
      const projection=this.project({...anchor,pages:[page]},'viewport');
      if(projection.state!=='ready')throw new Error('Missing geometry');
      this.revealPassage(projection.rects.length?projection.rects.map(r=>r.rect):[view.div.getBoundingClientRect()],preferredLeft);
      this.locateFlash.show(()=>anchor.pages.flatMap(part=>{
        const current=this.project({...anchor,pages:[part]},'viewport');
        return current.state==='ready'?current.rects.map(r=>r.rect):[];
      }));
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
    this.locateFlash.clear();this.findScrollLeft=this.container.scrollLeft;++this.locateRequest;
    this.publish({search:{query,...options,status:query?'searching':'idle',total:0,current:0}});
    if (!query) { this.eventBus.dispatch('findbarclose', {source:this}); return; }
    this.eventBus.dispatch('find', {source:this, type:'', query, caseSensitive:options.matchCase, entireWord:options.wholeWord, highlightAll:true, findPrevious:false, matchDiacritics:false});
  }
  stepSearch(direction: 1 | -1) { this.locateFlash.clear();this.findScrollLeft=this.container.scrollLeft;++this.locateRequest; const s=this.snapshot.data.search; if(s.query) this.eventBus.dispatch('find',{source:this,type:'again',query:s.query,caseSensitive:s.matchCase,entireWord:s.wholeWord,highlightAll:true,findPrevious:direction===-1,matchDiacritics:false}); }
  closeSearch() { this.search('',{matchCase:false,wholeWord:false}); }
  async cancelOpen(): Promise<void> {
    this.locateFlash.clear();
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
  async dispose() { if (this.disposed) return; setPaperpaneViewerTheme(this.surface, null); this.locateFlash.clear(); this.disposed = true; this.sessionLifecycle.abort(); this.lifecycle.abort(); this.observer.disconnect(); this.listeners.clear(); Object.values(this.projections).forEach(s=>s.clear()); this.password = undefined; this.highlights?.dispose(); this.highlights = undefined; this.links.setDocument(null); this.viewer.setDocument(null); await this.task?.destroy().catch(()=>{}); }
}
