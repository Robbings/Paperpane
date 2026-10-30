import { useResearch } from './use-research';
import { useEffect, useRef, useState } from 'react';
import { ReaderShell } from '@/ui/reader/ReaderShell';
import { Button, Dialog, EmptyState, ProgressBar, TextField, Toaster, toast } from '@/ui/components';
import type { ReaderInteraction } from '@/ui/reader/types';
import { ReaderController } from './reader-controller';
import '@/document/reader/surface.css';
import { useTranslation } from './use-translation';
import { useModelSettings } from './use-model-settings';
import { toDraft } from '@/ui/settings/types';
import { useLocalPreferences } from './use-local-preferences';
import { downloadFile } from './library-page';

/** Production reader entry; the proof URL uses exactly this same integration. */
export function LiveReaderPage() {
  const preferences = useLocalPreferences();
  const [container,setContainer] = useState<HTMLDivElement|null>(null);
  const [surface,setSurface] = useState<HTMLDivElement|null>(null);
  const [owner,setOwner] = useState<ReaderController>();
  const [,redraw] = useState(0);
  const [password,setPassword] = useState('');
  const [openFiles,setOpenFiles] = useState(() => new URLSearchParams(location.search).get('open') === 'import');
  useEffect(() => {
    const url = new URL(location.href);
    if (url.searchParams.get('open') === 'import') { url.searchParams.delete('open'); history.replaceState(null, '', url); }
  }, []);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!container || !surface) return;
    let live = true;
    const controller = new ReaderController(container,surface,()=>{if(live)redraw(n=>n+1);});
    setOwner(controller); void controller.start();
    return ()=>{live=false;void controller.dispose();};
  },[container,surface]);
  const translation=useTranslation(owner,preferences.state.preferences);
  const modelSettings=useModelSettings();
  const state=owner?.reader.getSnapshot().data;
  const research=useResearch(owner,preferences.state.preferences,modelSettings.settings.revision,preferences.state.local!=='unmodified'&&preferences.state.local!=='failed');
  useEffect(()=>{
    const media=window.matchMedia('(prefers-color-scheme: dark)');
    const apply=()=>{
      const p=preferences.state.preferences;
      const dark=document.documentElement.dataset.theme==='dark'||(!document.documentElement.dataset.theme&&media.matches);
      owner?.reader.setDisplay({scroll:p.pdfScroll,spread:p.pdfSpread,theme:p.pdfTheme==='auto'?(dark?'dark':'original'):p.pdfTheme});
    };
    apply();media.addEventListener('change',apply);
    const observer=new MutationObserver(apply);observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
    return()=>{media.removeEventListener('change',apply);observer.disconnect();};
  },[owner,state?.phase,preferences.state.preferences]);
  const saved=owner?.annotations?.getSnapshot().data;
  const documents=owner?.imports.service.getSnapshot().data.documents??[];
  const jobs=owner?.imports.service.getSnapshot().data.jobs??[];
  const job=jobs.find(job=>['reading','validating','password-required'].includes(job.phase));
  const failedJob=[...jobs].reverse().find(job=>job.phase==='failed');
  const passwordRequest=job?.passwordRequest??state?.passwordRequest;
  useEffect(()=>setPassword(''),[passwordRequest?.requestId]);
  const target=state?.menuTarget;
  const menuTarget: ReaderInteraction['menuTarget'] = target?.kind==='annotation'
    ? {kind:'annotation',annotationId:target.annotationId,rects:owner?.rects(target.anchor)??[]}
    : target?.kind==='selection' ? {kind:'selection',id:target.selection.id,text:target.selection.snapshot.text,rects:owner?.rects(target.selection.snapshot.anchor)??[]} : null;
  const report=(text:string)=>owner?.report(text);
  const cancelPassword=()=>{
    setPassword('');
    if(job?.passwordRequest)void owner?.imports.service.cancel(job.id);
    else if(state?.passwordRequest)void owner?.reader.cancelPassword(state.passwordRequest.requestId);
  };
  const interaction: ReaderInteraction = {
    onScrollContainer:setContainer, menuTarget, onDismissMenu:()=>owner?.reader.dismissMenu(),
    tool:state?.tool??'select',onToolChange:tool=>owner?.reader.setTool(tool),
    onCreateHighlight:(id,color)=>owner?.createHighlight(id,color)??Promise.resolve(null),
    onSelectionAction:(id,action)=>{if(action==='explain'||action==='ask'){const selection=owner?.reader.resolveSelection(id);if(selection?.ok)void research.selected(selection.value,action);else if(selection&&!selection.ok)report(selection.error.message);}else owner?.selectionAction(id,action);},
    onAnnotationAction:(id,action)=>{const row=owner?.item(id);if(row){if(action==='explain'||action==='ask')void research.selected({anchor:row.anchor,text:row.quote},action);else if(action==='translate'&&owner?.translateSelection)owner.translateSelection(row.anchor,row.quote);else owner?.textAction(row.quote,action);}},
    onAnnotationColor:(id,color)=>owner?.colorAnnotation(id,color),
    onAnnotationComment:(id,comment)=>owner?.annotations?.edit(id,{comment}),
    onAnnotationCommentDelete:async id=>owner?.annotations?.deleteComment(id)??null,
    onAnnotationDelete:async id=>{const ok=await owner?.annotations?.deleteCurrent(id)??false;if(ok)owner?.reader.dismissMenu();return ok;},
    onAnnotationRestore:async id=>{await owner?.annotations?.restoreDeleted(id);},
    annotationRects:id=>{const row=owner?.item(id);return row ? owner?.rects(row.anchor)??null : null;},
    subscribeGeometry:listener=>owner?.reader.subscribeProjection('viewport',listener)??(()=>{}),
    rotation:state?.position.rotation??0,onRotate:rotation=>{const r=owner?.reader.setRotation(rotation);if(r&&!r.ok)report(r.error.message);},
    search:state?.search??{query:'',matchCase:false,wholeWord:false,status:'idle',total:0,current:0},
    onSearch:(q,options)=>owner?.reader.search(q,options),onSearchStep:direction=>owner?.reader.stepSearch(direction),onSearchClose:()=>owner?.reader.closeSearch(),
    noteLayouts:saved?.layouts??[],onNoteLayouts:layouts=>owner?.annotations?.setLayouts(layouts),
  };
  const notice = saved?.error?.message || owner?.message || state?.error?.message || failedJob?.error?.message || (job ? '正在导入…' : '');
  useEffect(()=>{if(notice&&!saved?.error)toast.show({message:notice});},[notice,saved?.error]);
  const local=!saved?'unmodified':saved.error?'failed':saved.pending?'saving':'saved';
  const unavailable=<EmptyState icon="file" title="尚未接入" description="本轮完成 PDF 阅读、高亮和评论保存，其余研究功能将在后续接入。"/>;
  return <>
    <ReaderShell header={{title:owner?.document?.title??'打开论文',sourceLabel:owner?.document?.sourceUrl?new URL(owner.document.sourceUrl).hostname:'本地文件',pageCount:state?.pageCount??0}}
      outline={[]} navigationPending pageIndex={state?.position.pageIndex??0} zoomPercent={Math.round((state?.position.zoom??1)*100)}
      annotations={(saved?.items??[]).filter(row=>!row.deletedAt).map(row=>({id:row.id,kind:row.kind==='page-comment'?'comment':'highlight',color:row.color,pageIndex:row.anchor.pages[0]!.pageIndex,quote:row.quote,note:row.comment}))}
      annotationStatus={{local,sync:'unconfigured'}}
      notes={{value:'',onChange:()=>report('整篇笔记将在后续接入。'),local:'unmodified',sync:'unconfigured'}}
      panelRequest={research.panelRequest}
      panels={{...research.panels,notes:unavailable,cite:unavailable}}
      document={<>
        {(!state||state.phase==='empty'||state.phase==='failed')&&<EmptyState icon="file" title={state?.phase==='failed'?'无法打开 PDF':'打开一份论文'} description={state?.error?.message} actions={<Button onClick={()=>setOpenFiles(true)}>选择论文</Button>}/>}
        {state?.phase==='loading'&&<ProgressBar label="载入 PDF" value={state.loadProgress}/>}
        {state?.textLayer==='none'&&<p role="status">当前已加载页面没有可选择的文字，扫描件的文字识别将在后续提供。</p>}
        <div ref={setSurface} className="pdfViewer pp-pdf-surface"/>
      </>}
      interaction={interaction}
      translation={translation.shell}
      onBack={()=>void owner?.leaveForLibrary()}
      exports={[{id:'original',label:'导出原 PDF',disabled:!owner?.document}]}
      onExport={()=>{if(owner?.document)void owner.db.readFile(owner.document).then(blob=>downloadFile(blob,`${owner.document!.title}.pdf`)).catch(()=>report('原文件导出失败，请重试。'));}}
      settings={{preferences:preferences.state.preferences,onPreference:preferences.setPreference,models:modelSettings.settings.models.map(m=>({value:m.id,label:m.label||m.modelId})),defaultModelId:modelSettings.settings.defaultModelId,onDefaultModel:id=>void modelSettings.save({...toDraft(modelSettings.settings),defaultModelId:id},modelSettings.settings.revision).then(r=>{if(!r.ok)report('默认模型没有保存，请到设置页重试。');}),status:{local:preferences.state.local,sync:'unconfigured',lastSyncedAt:null,modelAvailability:modelSettings.status.modelAvailability},onOpenSettings:section=>window.open(`options.html${section?'#'+section:''}`,'_blank','noopener')}}
      onNavigate={index=>{void owner?.reader.navigate(index).then(r=>{if(!r.ok)report(r.error.message);});}}
      onZoom={direction=>{const r=owner?.reader.setZoom(Math.min(4,Math.max(.25,Math.round(((owner.reader.getSnapshot().data.position.zoom??1)+(direction==='in'?.1:-.1))*100)/100)));if(r&&!r.ok)report(r.error.message);}}
      onZoomTo={percent=>{const r=owner?.reader.setZoom(percent/100);if(r&&!r.ok)report(r.error.message);}}
      onLocateAnnotation={id=>{const row=owner?.item(id);if(row)void owner?.reader.locate(row.anchor).then(()=>owner.reader.showAnnotation(id));}}
      onTool={tool=>{if(tool==='region')research.startCapture();else if(tool==='fit-width'){const r=owner?.reader.fitWidth();if(r&&!r.ok)report(r.error.message);}else if(tool==='copy-annotations'||tool==='export-annotations')void owner?.exportAnnotations(tool==='copy-annotations');else if(tool==='open'||tool==='library')setOpenFiles(true);else report('该工具将在后续阅读能力接入时提供。');}}
    />
    {translation.overlay}{translation.confirmation}{research.overlay}
    <Dialog open={!!research.service?.saveError&&!!research.service?.unsaved} title="AI 内容尚未保存" description={research.service?.saveError} onClose={()=>{}} footer={<Button onClick={()=>void research.service?.flush()}>重试保存</Button>}/>
    <Dialog open={!!saved?.error} onClose={()=>{}} title="批注未能保存" description={saved?.error?.message} footer={<><Button onClick={()=>void owner?.annotations?.retry()}>重试保存</Button><Button onClick={()=>void owner?.annotations?.discardDrafts()}>放弃草稿，载入最新</Button></>}/>
    <Dialog open={openFiles} onClose={()=>setOpenFiles(false)} title="打开论文" description="复用文献库的 PDF 文件；导入的文件与批注保存在本机数据库。" footer={<><Button onClick={()=>{setOpenFiles(false);input.current?.click();}}>导入本地 PDF</Button><Button onClick={()=>void owner?.leaveForLibrary()}>文献库</Button></>}>
      {documents.length?documents.map(doc=><div key={doc.id}><Button onClick={()=>{setOpenFiles(false);void owner?.open(doc.id);}}>{doc.title}</Button></div>):<p>还没有导入论文。</p>}
    </Dialog>
    <input ref={input} hidden type="file" accept="application/pdf,.pdf" onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)void owner?.imports.service.importDocument({kind:'local',file}).then(r=>{if(!r.ok)report(r.error.message);});}}/>
    <Dialog open={!!passwordRequest} onClose={cancelPassword} title="这个 PDF 需要密码" description="密码只用于本次打开，不会保存。" footer={<><Button onClick={cancelPassword}>取消</Button><Button type="submit" form="reader-password" variant="primary" disabled={!password}>打开</Button></>}>
      <form id="reader-password" onSubmit={event=>{event.preventDefault();if(job?.passwordRequest)void owner?.imports.service.submitPassword(job.id,job.passwordRequest.requestId,password);else if(state?.passwordRequest)owner?.reader.submitPassword(state.passwordRequest.requestId,password);setPassword('');}}>
        <TextField label="密码" type="password" value={password} onChange={setPassword} error={passwordRequest?.incorrect?'密码不正确，请重试。':undefined}/>
      </form>
    </Dialog>
    <Toaster/>
  </>;
}
