import { useEffect, useRef, useState } from 'react';
import { ReaderShell } from '@/ui/reader/ReaderShell';
import { Button } from '@/ui/components';
import type { AnnotationView } from '@/ui/reader/types';
import type { ReaderState } from '@/contracts/reader';
import type { DocumentAnchor } from '@/contracts/document';
import { PdfjsReader } from '@/document/reader/pdfjs-reader';
import '@/document/reader/surface.css';

/** Temporary compatibility bridge, not the final controlled shell. No src/ui edits. */
export function ReaderProof() {
  const surface = useRef<HTMLDivElement>(null); const owner = useRef<PdfjsReader | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const [state,setState] = useState<ReaderState>(); const [title,setTitle] = useState('请选择 PDF');
  const [message,setMessage] = useState('接合验证：本页高亮仅留在当前会话，不会保存。');
  const [annotations,setAnnotations] = useState<AnnotationView[]>([]);
  const anchors = useRef(new Map<string,DocumentAnchor>());
  useEffect(()=>{
    const element = surface.current; const container = element?.closest<HTMLDivElement>('.pp-reader__paper');
    if (!element || !container) return;
    const reader = new PdfjsReader(container,element); owner.current=reader;
    const update=()=>setState(reader.getSnapshot().data); const unsubscribe=reader.subscribe(update);update();
    return ()=>{unsubscribe();owner.current=null;void reader.dispose();};
  },[]);
  const report=(text:string)=>setMessage(text);
  return <>
    <ReaderShell header={{ title, sourceLabel: 'PDF.js 接合验证 · 会话高亮不保存', pageCount: state?.pageCount??0 }}
      outline={[]} pageIndex={state?.position.pageIndex??0} zoomPercent={Math.round((state?.position.zoom??1)*100)}
      annotations={annotations} annotationStatus={{ local:'unmodified',sync:'unconfigured',simulated:true }}
      notes={{value:'',onChange:()=>report('笔记接合不在本轮验证范围。'),local:'unmodified',sync:'unconfigured',simulated:true}}
      document={<div ref={surface} className="pdfViewer pp-pdf-surface" />}
      onNavigate={index=>{void owner.current?.navigate(index).then(r=>{if(!r.ok)report(r.error.message);});}}
      onZoom={direction=>{const r=owner.current?.setZoom((state?.position.zoom??1)+(direction==='in'?.1:-.1));if(r&&!r.ok)report(r.error.message);}}
      onHighlight={(color,uiSelection)=>{
        const reader=owner.current,selection=reader?.getSnapshot().data.selection;
        if(!reader||!selection){report('文字层选区尚未捕获，请重新拖选。');return;}
        if(selection.snapshot.text.trim()!==uiSelection.text.trim()){report('选区文字已改变，请重新拖选。');return;}
        const id=selection.id;
        void reader.highlight(id,color).then(r=>{if(!r.ok){report(r.error.message);return;} anchors.current.set(id,selection.snapshot.anchor);setAnnotations(items=>[...items,{id,kind:'highlight',color,pageIndex:selection.snapshot.anchor.pages[0]!.pageIndex,quote:selection.snapshot.text}]);report('已用现有菜单创建高亮；当前会话有效，尚未落库。');});
      }}
      onSelectionAction={(action,selection)=>{if(action==='copy')void navigator.clipboard.writeText(selection.text).catch(()=>report('复制失败，请使用系统复制快捷键。'));else report('本轮只验证高亮与复制，其余选区动作尚未接通。');}}
      onLocateAnnotation={id=>{const anchor=anchors.current.get(id);if(anchor)void owner.current?.locate(anchor);}}
      onTool={tool=>{if(tool==='rotate'){const rotation=((state?.position.rotation??0)+90)%360 as 0|90|180|270;owner.current?.setRotation(rotation);}else report('该工具将在完整阅读接合阶段连接。');}}
    />
    <div style={{position:'fixed',left:18,bottom:12,zIndex:1000,display:'flex',alignItems:'center',gap:12,maxWidth:'calc(100vw - 36px)',padding:8,background:'var(--pp-surface)',borderRadius:12}}>
      <Button onClick={()=>input.current?.click()}>打开验证 PDF</Button>
      <span role="status" style={{fontSize:12}}>{state?.phase==='loading'?'正在载入真实 PDF…':state?.error?.message??message}</span>
      <input ref={input} type="file" accept="application/pdf,.pdf" hidden onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(!file)return;if(file.size>256*1024*1024){report('请选择 256 MiB 以内的 PDF。');return;}setTitle(file.name);setAnnotations([]);anchors.current.clear();report('接合验证：本页高亮仅留在当前会话，不会保存。');void owner.current?.open(file,{documentId:crypto.randomUUID(),fileVersion:crypto.randomUUID()});}} />
      {state?.passwordRequest&&<form onSubmit={event=>{event.preventDefault();const form=event.currentTarget;const value=new FormData(form).get('password');owner.current?.submitPassword(state.passwordRequest!.requestId,String(value??''));form.reset();}}><label>PDF 密码<input name="password" type="password" autoComplete="off" /></label><Button type="submit">解锁</Button>{state.passwordRequest.incorrect?'密码不正确，请重试':''}</form>}
    </div>
  </>;
}
