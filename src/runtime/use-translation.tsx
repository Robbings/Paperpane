import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useSelectionTranslation } from './use-selection-translation';
import { TranslationPane } from '@/ui/reader/translation/TranslationPane';
import type { TranslationMode, TranslationPageView, TranslationSentenceView } from '@/ui/reader/translation/types';
import { EmptyState, IconButton, ProgressBar, toast } from '@/ui/components';
import { TranslationConfirm } from '@/ui/reader/translation/TranslationConfirm';
import { TranslationMarkdown } from './translation-markdown';
import { TranslationSession } from '@/translation/session';
import type { ReaderController } from './reader-controller';
import { concreteKey, savedEngineKey } from '@/translation/resolve';
import { engineName, engineOptions, paperEngineValue } from '@/ui/settings/engine-options';
import { machineProvider } from '@/translation/machine-providers';
import { literalTranslation } from '@/translation/machine/text';
import type { TranslationConfirmRequest, TranslationCost } from '@/ui/reader/translation/TranslationConfirm';
import type { Preferences, SettingsView } from '@/ui/settings/types';
import type { TranslationSentence } from '@/contracts/translation';
export function useTranslation(owner:ReaderController|undefined,preferences:Preferences,settings:SettingsView,settingsReady:boolean){
  const [open,setOpen]=useState(false),[mode,setMode]=useState<TranslationMode>('translation'),[follow,setFollow]=useState(true);
  const [session,setSession]=useState<TranslationSession>(),[,render]=useState(0),[active,setActive]=useState<string|null>(null);
  const [reveal,setReveal]=useState<{id:string;key:number;smooth:boolean;flash:boolean}|null>(null);
  const [override,setOverride]=useState<string>();
  const options=engineOptions(settings), value=override ?? paperEngineValue(settings), key=concreteKey(settings,value);
  const [confirm,setConfirm]=useState<{session:TranslationSession; action:TranslationConfirmRequest['action']; page?:number; ids?:string[]; key:string; label:string; language:string; cost:TranslationCost}|null>(null);
  const selectionWindow=useSelectionTranslation(owner,preferences,settings,settingsReady);
  const current=useRef({open,follow,active});current.current={open,follow,active};
  const followGuard=useRef({suppressUntil:0,manualUntil:0});
  const document=owner?.reader.getSnapshot().data.document;const phase=owner?.reader.getSnapshot().data.phase;
  useEffect(()=>{
    if(!owner||!document)return;
    let alive=true;const s=new TranslationSession(document,(signal,progress)=>owner.reader.extractTranslation(signal,progress),()=>{if(alive)render(n=>n+1);});
    owner.trackTranslation(s);
    setSession(s);setActive(null);setReveal(null);setConfirm(null);
    return()=>{alive=false;void owner.releaseTranslation(s);};
  },[owner,document?.documentId,document?.fileVersion]);
  // Loading/render phase changes must not dispose a session holding unsaved text.
  useEffect(()=>{
    if(session&&phase==='ready'&&session.ref.documentId===document?.documentId&&session.ref.fileVersion===document?.fileVersion)void session.load();
  },[session,phase,document?.documentId,document?.fileVersion]);
  const sentences=session?.paper?.sentences??[];
  const rects=(s:TranslationSentence)=>s.anchor.pages.flatMap(p=>{const result=owner?.reader.project({...s.anchor,pages:[p]},'viewport');return result?.state==='ready'?result.rects.map(r=>r.rect):[];});
  useEffect(()=>{
    if(!owner||!session?.paper)return;
    const scroller=owner.reader.translationScrollElement();
    scroller.classList.add('pp-translation-page-actions');
    let hoverFrame=0, geometryFrame=0, followTimer:ReturnType<typeof setTimeout>|undefined;
    let pointer:{x:number;y:number}|undefined, lastFollow:string|undefined, intentUntil=0;
    const inPaper=(target:EventTarget|null)=>target instanceof Node&&scroller.contains(target);
    const find=(x:number,y:number)=>session.paper!.sentences.find(s=>rects(s).some(r=>x>=r.left&&x<=r.left+r.width&&y>=r.top&&y<=r.top+r.height));
    const onMove=(e:PointerEvent)=>{
      if(!current.current.open)return;const target=e.target as Element;
      if(!target.closest?.('.pp-pdf-surface')){if(!target.closest?.('.pp-tr'))setActive(null);return;}
      cancelAnimationFrame(hoverFrame);hoverFrame=requestAnimationFrame(()=>setActive(find(e.clientX,e.clientY)?.id??null));
    };
    const down=(e:PointerEvent)=>{pointer={x:e.clientX,y:e.clientY};if(inPaper(e.target))intentUntil=Date.now()+2000;};
    const click=(e:MouseEvent)=>{
      if(!current.current.open||!pointer||Math.hypot(e.clientX-pointer.x,e.clientY-pointer.y)>4||!window.getSelection()?.isCollapsed||!(e.target as Element).closest?.('.pp-pdf-surface'))return;
      const s=find(e.clientX,e.clientY);if(s){followGuard.current.suppressUntil=Date.now()+1200;setActive(s.id);setReveal({id:s.id,key:Date.now(),smooth:false,flash:true});}
    };
    const intent=(e:Event)=>{
      const target=e.target as Element;
      if(target.closest?.('.pp-tr')){followGuard.current.manualUntil=Date.now()+4000;return;}
      if(inPaper(target)){intentUntil=Date.now()+2000;followGuard.current.manualUntil=0;}
    };
    const key=(e:KeyboardEvent)=>{if(['ArrowDown','ArrowUp','PageDown','PageUp','Home','End',' '].includes(e.key))intent(e);};
    const followReading=()=>{
      const now=Date.now();
      if(!current.current.open||!current.current.follow||now>intentUntil||now<followGuard.current.suppressUntil||now<followGuard.current.manualUntil||!window.getSelection()?.isCollapsed)return;
      const viewport=owner.reader.translationViewport(),line=viewport.top+Math.min(140,viewport.height*.25);
      const page=owner.reader.getSnapshot().data.position.pageIndex;
      const candidates=session.paper!.sentences.filter(s=>s.kind!=='formula'&&s.anchor.pages.some(p=>p.pageIndex===page)).flatMap(s=>{
        const visible=rects(s).filter(r=>r.top+r.height>viewport.top+40&&r.top<viewport.bottom&&r.left+r.width>viewport.left&&r.left<viewport.right);
        return visible.length?[{s,r:visible.reduce((a,b)=>Math.abs(a.top-line)<Math.abs(b.top-line)?a:b)}]:[];
      });
      if(!candidates.length)return;
      // Prefer the first visible column; do not oscillate between columns sharing a baseline.
      const left=Math.min(...candidates.map(x=>x.r.left));
      const column=candidates.filter(x=>x.r.left<left+Math.max(70,viewport.width*.18));
      const best=column.reduce((a,b)=>Math.abs(a.r.top-line)<=Math.abs(b.r.top-line)?a:b);
      const prior=column.find(x=>x.s.id===lastFollow);
      if(prior&&Math.abs(prior.r.top-line)<=Math.abs(best.r.top-line)+35)return;
      if(best.s.id!==lastFollow){lastFollow=best.s.id;setReveal({id:best.s.id,key:Date.now(),smooth:true,flash:false});}
    };
    const scroll=()=>{clearTimeout(followTimer);followTimer=setTimeout(followReading,180);};
    // Projection changes repaint only. They must never initiate scrolling in the translation pane.
    const geometry=()=>{cancelAnimationFrame(geometryFrame);geometryFrame=requestAnimationFrame(()=>render(n=>n+1));};
    window.addEventListener('pointermove',onMove);window.addEventListener('pointerdown',down);window.addEventListener('click',click);
    window.addEventListener('wheel',intent,{passive:true});window.addEventListener('touchmove',intent,{passive:true});window.addEventListener('keydown',key);
    scroller.addEventListener('scroll',scroll,{passive:true});const off=owner.reader.subscribeProjection('viewport',geometry);
    return()=>{scroller.classList.remove('pp-translation-page-actions');cancelAnimationFrame(hoverFrame);cancelAnimationFrame(geometryFrame);clearTimeout(followTimer);off();scroller.removeEventListener('scroll',scroll);window.removeEventListener('pointermove',onMove);window.removeEventListener('pointerdown',down);window.removeEventListener('click',click);window.removeEventListener('wheel',intent);window.removeEventListener('touchmove',intent);window.removeEventListener('keydown',key);};
  },[owner,session,session?.paper]);
  const pageCount=session?.paper?.pageCount??owner?.reader.getSnapshot().data.pageCount??0;
  const pages:TranslationPageView[]=Array.from({length:pageCount},(_,pageIndex)=>{
    const owned=sentences.filter(s=>s.anchor.pages[0]?.pageIndex===pageIndex);
    const covered=sentences.filter(s=>s.kind!=='formula'&&s.anchor.pages.some(p=>p.pageIndex===pageIndex));
    const view:TranslationSentenceView[]=owned.map((s,i)=>{const out=session!.output(s.id);return {id:s.id,pageIndex,endsOnPage:s.anchor.pages.at(-1)!.pageIndex,kind:s.kind,source:`${s.source} `,inferredMath:out.inferredMath,text:s.kind==='formula'?'公式 · 查看原文':out.text,state:s.kind==='formula'?'done':out.state,approximate:s.approximate,paragraphStart:i===0||owned[i-1]?.paragraphId!==s.paragraphId};});
    const started=covered.some(s=>session?.run?.outputs[s.id]);
    const counts=new Map<string,number>();
    for (const s of covered) {
      const out=session?.run?.outputs[s.id];
      if (out?.state!=='done') continue;
      const source=out.engine ?? savedEngineKey(session!.run!.profile);
      if (source!==key) counts.set(source,(counts.get(source) ?? 0)+1);
    }
    const other=[...counts].sort((a,b)=>b[1]-a[1])[0]?.[0];
    const engineLabel=other ? (options.some(o=>o.value===other) ? engineName(options,other) : '其他引擎') : undefined;
    return {pageIndex,engineLabel,sentences:view,state:!covered.length?'failed':covered.every(s=>session?.output(s.id).state==='done')?'done':covered.some(s=>session?.output(s.id).state==='streaming')?'translating':started?'partial':'untranslated',error:!covered.length?'此页没有可翻译的文字，扫描件暂不支持。':undefined};
  });
  const run=session?.run;
  const failureMessage=session?.error ?? (run?.phase==='failed'?run.error:undefined);
  useEffect(()=>{if(failureMessage)toast.show({message:'翻译未能完成，可在译文栏的任务状态中查看原因并重试。',tone:'warning',duration:5000});},[failureMessage]);
  const start=(page?:number,retry=false,ids?:string[],replace=false,language:string=preferences.translationLanguage)=>{
    if (!session) return;
    if (!settingsReady) { owner?.report('翻译设置尚未就绪，请稍后再试。'); return; }
    const api=settings.translationApis?.find(a=>'mt:'+a.id===key);
    const paid=api && !machineProvider(api.kind)?.unofficial;
    const remaining=sentences.filter(s=>s.kind!=='formula' && (!ids || ids.includes(s.id)) &&
      (page===undefined || s.anchor.pages.some(p=>p.pageIndex===page)) &&
      (replace || run?.profile.language!==language || run.outputs[s.id]?.state!=='done'));
    if (replace || retry || (paid && page===undefined)) {
      const cost:TranslationCost=paid ? {kind:'characters',characters:remaining.reduce((n,s)=>n+[...s.source].length,0)} :
        api ? {kind:'free'} : {kind:'tokens'};
      setConfirm({session,page,ids,language,key,label:engineName(options,key),cost,action:replace?'retranslate':retry?'retry':'translate'});
      return;
    }
    session.engineOverride=key;
    void session.start(language,page,retry,ids,replace);
  };
  const activeSentence=sentences.find(s=>s.id===active);
  const viewport=owner?.reader.translationViewport();
  const highlightOverlay=open&&activeSentence&&viewport?createPortal(<svg aria-hidden="true" width="100%" height="100%" style={{position:'fixed',inset:0,pointerEvents:'none',zIndex:2,clipPath:`inset(${Math.max(0,viewport.top)}px ${Math.max(0,window.innerWidth-viewport.right)}px ${Math.max(0,window.innerHeight-viewport.bottom)}px ${Math.max(0,viewport.left)}px)`}}><path fill="var(--pp-trans-link)" d={rects(activeSentence).map(r=>`M ${r.left} ${r.top} h ${r.width} v ${r.height} h ${-r.width} Z`).join(' ')}/></svg>,window.document.body):null;
  const busy=run?.phase==='running'||run?.phase==='pausing';
  const pageActions=owner&&session?.paper&&viewport?createPortal(<div className="pp-tr-page-actions">
    {owner.reader.translationPageRects().filter(({rect})=>rect.bottom>viewport.top+112).map(({pageIndex,rect})=><div className="pp-tr-page-action pp-glass" data-tone="float" key={pageIndex} style={{left:rect.right-viewport.left+owner.reader.translationScrollElement().scrollLeft+6,top:Math.max(rect.top+8,viewport.top+72)-viewport.top+owner.reader.translationScrollElement().scrollTop}}>
      <IconButton icon="translate" size="md" shape="pill" label={`翻译第 ${pageIndex+1} 页`} disabled={busy||!!pages[pageIndex]?.error} onClick={()=>{
        setOpen(true);const sentence=sentences.find(s=>s.anchor.pages[0]?.pageIndex===pageIndex);
        if(sentence)setReveal({id:sentence.id,key:Date.now(),smooth:false,flash:false});
        if(pages[pageIndex]?.state!=='done')start(pageIndex,session.needsRepeat(pageIndex));
      }}/>
    </div>)}
  </div>,owner.reader.translationScrollElement()):null;
  const overlay=<>{highlightOverlay}{pageActions}{selectionWindow}</>;
  const loading=session?.loading;
  const panel=loading?<EmptyState icon="file" title="正在整理原文" description={`已读取 ${session.extractProgress} / ${pageCount} 页，还没有发出翻译请求。`} actions={<ProgressBar label="整理原文" value={pageCount?session.extractProgress/pageCount:undefined}/>}/>:
    !session?.paper?<EmptyState icon="file" title="原文尚未就绪" description={session?.error??'请先打开 PDF。'}/>:
    <div style={{display:'contents','--pp-text-read':`${(preferences.translationFontSize??preferences.uiFontSize)*.875/16}rem`} as CSSProperties}>
      <TranslationPane engine={{value,options}} onEngine={setOverride} renderText={s=>session?.output(s.id).engine?.startsWith('mt:') ? literalTranslation(s.text) : <TranslationMarkdown text={s.text} inferredMath={s.inferredMath}/>} pages={pages} mode={mode} onMode={setMode} follow={follow} onFollow={setFollow} onClose={()=>{setOpen(false);setActive(null);}} activeId={active} onHover={setActive} onLocate={id=>{const s=sentences.find(x=>x.id===id);if(s){followGuard.current.suppressUntil=Date.now()+1500;setActive(id);void owner?.reader.locate(s.anchor);}}} reveal={reveal}
        task={{saveFailed:session.saveFailed,completedSentences:run?.requested.filter(id=>run.outputs[id]?.state==='done').length,totalSentences:run?.requested.length,phase:session.error?'failed':run?.phase??'idle',completedPages:pages.filter(p=>p.state==='done').length,totalPages:pageCount,current:session.retrying.size?`${session.activeRequests} 个请求进行中，${session.retrying.values().next().value}`:session.activeRequests?`${session.activeRequests} 个请求并发`:undefined,error:session.error??run?.error}}
        onTranslatePage={p=>start(p,session.needsRepeat(p))} onTranslateAll={()=>start()} onPause={()=>void session.pause()} onResume={()=>session.saveFailed?void session.retrySave():start(run?.scope?.page,true,run?.requested,false,run?.profile.language??preferences.translationLanguage)} onRetryPage={p=>start(p,true)} onRetranslatePage={page=>start(page,false,undefined,true)} onRetranslateAll={()=>start(undefined,false,undefined,true)}/>
    </div>;
  const confirmation = <TranslationConfirm
    engineLabel={confirm?.label} cost={confirm?.cost}
    request={confirm && confirm.session===session ? {action:confirm.action,scope:confirm.page===undefined?'document':'page'} : null}
    onClose={()=>setConfirm(null)}
    onConfirm={()=>{
      setConfirm(null);
      if (!confirm || confirm.session!==session) return;
      session.engineOverride=confirm.key;
      void session.start(confirm.language,confirm.page,confirm.action==='retry',confirm.ids,confirm.action==='retranslate');
    }}
  />;
  return {shell:{open,onToggle:()=>setOpen(o=>!o),pane:panel},overlay,confirmation};
}
