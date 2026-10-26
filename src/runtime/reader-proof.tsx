import { useCallback, useEffect, useRef, useState } from 'react';
import { ReaderShell } from '@/ui/reader/ReaderShell';
import { Button } from '@/ui/components';
import type { AnnotationView, NoteLayout, ReaderInteraction } from '@/ui/reader/types';
import type { ReaderState } from '@/contracts/reader';
import type { DocumentAnchor } from '@/contracts/document';
import { PdfjsReader } from '@/document/reader/pdfjs-reader';
import { LibraryDatabase } from '@/data/library-database';
import { readingPersistence } from './reading-persistence';
import { importError } from '@/document/errors';
import '@/document/reader/surface.css';

const idleSearch = { query: '', matchCase: false, wholeWord: false, status: 'idle', total: 0, current: 0 } as const;

/** Real PDF/open-position bridge. Research data is still explicitly session-only. */
export function ReaderProof({ libraryItemId }: { libraryItemId?: string }) {
  const surface = useRef<HTMLDivElement>(null); const owner = useRef<PdfjsReader | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [state,setState] = useState<ReaderState>(); const [title,setTitle] = useState('请选择 PDF');
  const [message,setMessage] = useState('接合验证：本页高亮仅留在当前会话，不会保存。');
  const [annotations,setAnnotations] = useState<AnnotationView[]>([]);
  const [noteLayouts, setNoteLayouts] = useState<NoteLayout[]>([]);
  const anchors = useRef(new Map<string,DocumentAnchor>());
  const storedFile = useRef<Blob | undefined>(undefined);
  useEffect(()=>{
    const element = surface.current;
    if (!element || !container) return;
    const reader = new PdfjsReader(container,element); owner.current=reader;
    const db = new LibraryDatabase(); let alive = true;
    let persistence: ReturnType<typeof readingPersistence> | undefined;
    const update=()=>{ const data = reader.getSnapshot().data; setState(data); if (data.phase === 'ready') persistence?.update(data.position); };
    const unsubscribe=reader.subscribe(update);update();
    if (libraryItemId) void (async () => {
      try {
        const item = await db.getItem(libraryItemId);
        if (!item?.document || !item.hasPdf) throw new Error('这条书目没有可用的 PDF，请返回文献库重新导入。');
        const document = await db.getDocument(item.document.documentId);
        const blob = await db.readFile(item.document);
        if (!alive) return;
        storedFile.current = blob; setTitle(item.title); setMessage('原 PDF 已从本机载入；阅读位置会保存，高亮仍只留在当前会话。');
        await reader.open(blob, item.document);
        if (!alive || reader.getSnapshot().data.phase !== 'ready') return;
        if (document?.position) { const restored = await reader.restorePosition(document.position); if (!restored.ok) setMessage(restored.error.message); }
        if (!alive) return;
        persistence = readingPersistence(db, item.document, () => { if (alive) setMessage('阅读位置保存失败，请检查本机存储空间。'); });
        persistence.update(reader.getSnapshot().data.position);
      } catch (error) { if (alive) setMessage(error instanceof Error && !(error instanceof DOMException) ? error.message : importError(error).message); }
    })();
    return ()=>{alive=false;unsubscribe();owner.current=null;void reader.dispose();void (async()=>{await persistence?.dispose();await db.close();})();};
  },[libraryItemId, container]);
  const report=(text:string)=>setMessage(text);
  const subscribeGeometry = useCallback((listener: () => void) => owner.current?.subscribeProjection('viewport', listener) ?? (() => {}), []);
  const annotationRects = useCallback((id: string) => {
    const anchor = anchors.current.get(id); if (!anchor) return null;
    const projection = owner.current?.project(anchor, 'viewport');
    return projection?.state === 'ready' ? projection.rects.map(item => item.rect) : null;
  }, []);
  const selected = state?.selection;
  const interaction: ReaderInteraction = {
    onScrollContainer: setContainer,
    menuTarget: selected?.projection.state === 'ready' ? { kind: 'selection', id: selected.id, text: selected.snapshot.text, rects: selected.projection.rects.map(item => item.rect) } : null,
    onDismissMenu: () => { if (selected) owner.current?.dismissSelection(selected.id); },
    tool: 'select',
    onToolChange: () => report('自动高亮模式尚未接合，请使用选区菜单；当前高亮仅在本次会话有效。'),
    async onCreateHighlight(id, color = 'yellow') {
      const reader = owner.current, resolved = reader?.resolveSelection(id);
      if (!reader || !resolved?.ok) { report('选区已改变，请重新拖选。'); return null; }
      const result = await reader.highlight(id, color);
      if (!result.ok) { report(result.error.message); return null; }
      anchors.current.set(id, resolved.value.anchor);
      setAnnotations(items => [...items, { id, kind: 'highlight', color, pageIndex: resolved.value.anchor.pages[0]!.pageIndex, quote: resolved.value.text }]);
      report('已创建会话高亮；批注尚未接正式存储。'); return id;
    },
    onSelectionAction(id, action) {
      const result = owner.current?.resolveSelection(id);
      if (!result?.ok) { report('选区已改变，请重新拖选。'); return; }
      if (action === 'copy') void navigator.clipboard.writeText(result.value.text).catch(() => report('复制失败，请使用系统复制快捷键。'));
      else report('翻译、解释与问答尚未接通。');
    },
    onAnnotationAction: () => report('批注的 AI 操作尚未接通。'),
    onAnnotationColor: () => report('已有 PDF 高亮的改色尚未接合。'),
    onAnnotationComment(id, comment) {
      setAnnotations(items => items.map(item => item.id === id ? { ...item, note: comment } : item));
      report('评论仅保留在当前会话，尚未接正式存储。');
    },
    onAnnotationDelete: () => report('PDF 批注删除尚未接合。'),
    annotationRects, subscribeGeometry,
    rotation: state?.position.rotation ?? 0,
    onRotate: rotation => { const result = owner.current?.setRotation(rotation); if (result && !result.ok) report(result.error.message); },
    search: idleSearch,
    onSearch: () => report('文档内查找尚未接合。'),
    onSearchStep: () => report('文档内查找尚未接合。'),
    onSearchClose: () => {},
    noteLayouts, onNoteLayouts: setNoteLayouts,
  };
  return <>
    <ReaderShell header={{ title, sourceLabel: libraryItemId ? '本机 PDF · 阅读位置已接存储 · 会话高亮不保存' : 'PDF.js 接合验证 · 会话高亮不保存', pageCount: state?.pageCount??0 }}
      outline={[]} pageIndex={state?.position.pageIndex??0} zoomPercent={Math.round((state?.position.zoom??1)*100)}
      annotations={annotations} annotationStatus={{ local:'unmodified',sync:'unconfigured',simulated:true }}
      notes={{value:'',onChange:()=>report('笔记接合不在本轮验证范围。'),local:'unmodified',sync:'unconfigured',simulated:true}}
      document={<div ref={surface} className="pdfViewer pp-pdf-surface" />}
      onNavigate={index=>{void owner.current?.navigate(index).then(r=>{if(!r.ok)report(r.error.message);});}}
      onZoom={direction=>{const r=owner.current?.setZoom((state?.position.zoom??1)+(direction==='in'?.1:-.1));if(r&&!r.ok)report(r.error.message);}}
      onZoomTo={percent => { const result = owner.current?.setZoom(percent / 100); if (result && !result.ok) report(result.error.message); }}
      interaction={interaction}
      onLocateAnnotation={id=>{const anchor=anchors.current.get(id);if(anchor)void owner.current?.locate(anchor);}}
      onTool={tool=>{if(tool==='rotate'){const rotation=((state?.position.rotation??0)+90)%360 as 0|90|180|270;owner.current?.setRotation(rotation);}else report('该工具将在完整阅读接合阶段连接。');}}
    />
    <div style={{position:'fixed',left:18,bottom:12,zIndex:1000,display:'flex',alignItems:'center',gap:12,maxWidth:'calc(100vw - 36px)',padding:8,background:'var(--pp-surface)',borderRadius:12}}>
      {libraryItemId ? <><Button onClick={()=>location.assign(new URL('library.html', location.href).href)}>返回文献库</Button><Button disabled={!storedFile.current} onClick={()=>{
        const blob=storedFile.current;if(!blob)return;const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=`${title.replace(/[\x00-\x1f/\\]/g,'_')}.pdf`;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
      }}>导出原 PDF</Button></> : <Button onClick={()=>input.current?.click()}>打开验证 PDF</Button>}
      <span role="status" style={{fontSize:12}}>{state?.phase==='loading'?'正在载入真实 PDF…':state?.error?.message??message}</span>
      <input ref={input} type="file" accept="application/pdf,.pdf" hidden onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(!file)return;if(file.size>256*1024*1024){report('请选择 256 MiB 以内的 PDF。');return;}setTitle(file.name);setAnnotations([]);anchors.current.clear();report('接合验证：本页高亮仅留在当前会话，不会保存。');void owner.current?.open(file,{documentId:crypto.randomUUID(),fileVersion:crypto.randomUUID()});}} />
      {state?.passwordRequest&&<form onSubmit={event=>{event.preventDefault();const form=event.currentTarget;const value=new FormData(form).get('password');owner.current?.submitPassword(state.passwordRequest!.requestId,String(value??''));form.reset();}}><label>PDF 密码<input name="password" type="password" autoComplete="off" /></label><Button type="submit">解锁</Button>{state.passwordRequest.incorrect?'密码不正确，请重试':''}</form>}
    </div>
  </>;
}
