import { useEffect,useRef,useState,useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { SelectionMenu,toast } from '@/ui/components';
import type { PdfjsReader } from '@/document/reader/pdfjs-reader';
import type { DocumentRef } from '@/contracts/document';
import type { Preferences } from '@/ui/settings/types';
import { useDetection } from './use-detection';
import { useFormulaPreprocessing } from './preprocess';
import { expandBox,unionBox } from './geometry';
import { cachedElementValue,transcribeElement,wrapFormula,formatTable,type CopyFormat } from './transcribe';
import type { PaperElement } from './types';
import './elements.css';
type ImageValue=Awaited<ReturnType<PdfjsReader['captureImage']>>;
export function ElementOverlay({reader,document:ref,preferences,preferencesReady=false,hidden=false,configRevision,onAction}:{reader:PdfjsReader;document:DocumentRef;preferences:Preferences;preferencesReady?:boolean;hidden?:boolean;configRevision?:string;onAction:(value:ImageValue,action:string,caption?:string)=>Promise<void>}){
 const enabled=preferences.elementDetection&&(preferences.detectPictures||preferences.detectTables||preferences.detectFormulas),elements=useDetection(reader,ref,enabled),container=reader.translationScrollElement();
 useFormulaPreprocessing(reader,ref,preferences,preferencesReady,configRevision);
 const [active,setActive]=useState<string>(),[copying,setCopying]=useState<Set<string>>(new Set()),[,tick]=useState(0);
 const jobs=useRef(new Set<string>());
 const state=useRef({elements,preferences,active,hidden});state.current={elements,preferences,active,hidden};
 const root=useRef<HTMLDivElement>(null),hovering=useRef(false),lifetime=useRef(new AbortController()),hide=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),show=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),candidate=useRef<string|undefined>(undefined);
 useEffect(()=>{lifetime.current=new AbortController();return()=>{lifetime.current.abort();clearTimeout(hide.current);clearTimeout(show.current);};},[]);
 const allowed=(e:PaperElement,p:Preferences)=>e.kind==='picture'?p.detectPictures:e.kind==='table'?p.detectTables:p.detectFormulas;
 useEffect(()=>{if(!enabled||hidden||(active&&!elements.some(e=>e.id===active&&allowed(e,preferences)))){candidate.current=undefined;clearTimeout(show.current);show.current=undefined;setActive(undefined);}},[enabled,hidden,elements,preferences.detectPictures,preferences.detectTables,preferences.detectFormulas,active]);
 useEffect(()=>{
 const clear=()=>{clearTimeout(show.current);show.current=undefined;candidate.current=undefined;if(!hovering.current&&!root.current?.contains(document.activeElement)){clearTimeout(hide.current);hide.current=setTimeout(()=>setActive(undefined),180);}};
 const move=(event:PointerEvent)=>{
  // A mouse press commonly includes tiny movements before click. Keep the
  // toolbar mounted throughout that gesture so its button can receive click.
  if(!state.current.hidden&&root.current?.contains(event.target as Node)){clearTimeout(hide.current);return;}
  if(state.current.hidden||event.pointerType==='touch'||event.buttons||window.getSelection()?.toString().trim()){clearTimeout(show.current);show.current=undefined;candidate.current=undefined;setActive(undefined);return;}
  if((event.target as Element).closest('[data-pp-overlay], [data-pp-floating]')){if(!root.current?.contains(event.target as Node))clear();return;}
  let found:PaperElement|undefined,area=Infinity;
  for(const e of state.current.elements){if(!allowed(e,state.current.preferences))continue;const p=reader.project(e.anchor,'viewport');if(p.state!=='ready')continue;for(const {rect:r} of p.rects){if(event.clientX>=r.left&&event.clientX<=r.left+r.width&&event.clientY>=r.top&&event.clientY<=r.top+r.height&&r.width*r.height<area){found=e;area=r.width*r.height;}}}
  if(found){clearTimeout(hide.current);if(candidate.current!==found.id||(!state.current.active&&show.current===undefined)){clearTimeout(show.current);setActive(undefined);candidate.current=found.id;const id=found.id;show.current=setTimeout(()=>{show.current=undefined;setActive(id);},140);}}
  else clear();
 };
 const leave=()=>clear();const redraw=()=>tick(n=>n+1);
 container.addEventListener('pointermove',move,{passive:true});container.addEventListener('pointerleave',leave);const stop=reader.subscribeProjection('viewport',redraw);return()=>{stop();container.removeEventListener('pointermove',move);container.removeEventListener('pointerleave',leave);clearTimeout(hide.current);clearTimeout(show.current);};
 },[reader,container]);
 const element=elements.find(e=>e.id===active&&allowed(e,preferences));
 const projection=element?reader.project(element.anchor,'viewport'):undefined,r=projection?.state==='ready'?projection.rects[0]?.rect:undefined;
 const [barSize,setBarSize]=useState({width:235,height:32});
 useLayoutEffect(()=>{const el=root.current;if(!el)return;const measure=()=>setBarSize(old=>old.width===el.offsetWidth&&old.height===el.offsetHeight?old:{width:el.offsetWidth,height:el.offsetHeight});measure();const o=new ResizeObserver(measure);o.observe(el);return()=>o.disconnect();},[active,!!r]);
 const run=async(e:PaperElement,action:string,format:CopyFormat='image')=>{
  const key=`${action}:${e.id}`;if(jobs.current.has(key))return;jobs.current.add(key);if(action==='copy')setCopying(old=>new Set([...old,e.id]));const signal=lifetime.current.signal;
  try{
   const image=async()=>{let box=expandBox(e.region.box,e.kind);if(action!=='copy'&&e.caption)box=unionBox(box,e.caption.box);const anchor=await reader.elementAnchor(e.page.pageIndex,box);signal.throwIfAborted();return reader.captureAnchor(anchor,signal);};
   if(action==='copy'&&format==='image'){
    const item=new ClipboardItem({'image/png':image().then(v=>v.blob)});await navigator.clipboard.write([item]);toast.show({message:'已复制图片',duration:2200});
   }else if(action==='copy'){
    const textPromise=(async()=>{const cached=await cachedElementValue(e,signal);if(cached!==undefined)return cached;const [v,hint]=await Promise.all([image(),e.kind==='formula'?reader.elementText(e.anchor).catch(()=>''):Promise.resolve('')]);return transcribeElement(e,v.blob,signal,{hint});})().then(value=>{
     if(e.kind==='formula'){if(typeof value!=='string')throw new Error('公式格式无效');return {text:wrapFormula(value,preferences.mathDelimiter)};}
     if(typeof value==='string')throw new Error('表格格式无效');return formatTable(value,format);
    });
    // Start clipboard access in the user gesture; conversion resolves its data later.
    const data:Record<string,Promise<Blob>>={'text/plain':textPromise.then(v=>new Blob([v.text],{type:'text/plain'}))};
    if(format==='excel')data['text/html']=textPromise.then(v=>new Blob([v.html??''],{type:'text/html'}));
    try{await navigator.clipboard.write([new ClipboardItem(data)]);}catch{await textPromise;throw new Error('识别结果已保存，请再次点击复制');}toast.show({message:'已复制',duration:2200});
   }else{let caption='';if(e.caption){const a=await reader.elementAnchor(e.page.pageIndex,e.caption.box);caption=await reader.elementText(a);}signal.throwIfAborted();await onAction(await image(),action,caption);}
  }catch(error){if(!signal.aborted)toast.show({tone:'error',duration:4000,message:error instanceof Error?error.message:'操作失败'});}finally{jobs.current.delete(key);if(action==='copy')setCopying(old=>{const next=new Set(old);next.delete(e.id);return next;});}
 };
 if(!enabled||hidden||!element||!r)return null;
 const bounds=container.getBoundingClientRect(),barWidth=barSize.width,barHeight=barSize.height;
 const cp=element.captionAnchor?reader.project(element.captionAnchor,'viewport'):undefined,captionRect=cp?.state==='ready'?cp.rects[0]?.rect:undefined;
 const above=Math.min(r.top,captionRect?.top??r.top)-barHeight-7,below=Math.max(r.top+r.height,captionRect?captionRect.top+captionRect.height:0)+7;
 const top=above>=bounds.top+62?above:below+barHeight<=bounds.bottom-6?below:undefined;
 if(top===undefined||r.left+r.width<bounds.left||r.left>bounds.right||r.top+r.height<bounds.top||r.top>bounds.bottom)return null;
 const left=Math.max(bounds.left+8,Math.min(r.left+r.width-barWidth,bounds.right-barWidth-8));
 return <>{createPortal(<div data-pp-overlay="" className="pp-element-layer">
 <div className="pp-element-outline" style={{left:r.left-bounds.left+container.scrollLeft,top:r.top-bounds.top+container.scrollTop,width:r.width,height:r.height}}/>
 <div ref={root} className="pp-element-toolbar" data-kind={element.kind} style={{left:left-bounds.left+container.scrollLeft,top:top-bounds.top+container.scrollTop}}
 onPointerEnter={()=>{hovering.current=true;clearTimeout(hide.current);}} onPointerLeave={()=>{hovering.current=false;hide.current=setTimeout(()=>setActive(undefined),180);}} onFocusCapture={()=>clearTimeout(hide.current)} onBlurCapture={event=>{if(!event.currentTarget.contains(event.relatedTarget)&&!hovering.current)hide.current=setTimeout(()=>setActive(undefined),180);}}>
 <SelectionMenu label="论文元素操作" actions={[{id:'ask',label:'提问',icon:'ask'},{id:'explain',label:'解释',icon:'explain'},{id:'copy',label:'复制',icon:'copy',busy:copying.has(element.id)}]} layout={['ask','explain','copy']} look={preferences.selectionBar.look} onDismiss={()=>setActive(undefined)} onAction={action=>void run(element,action,element.kind==='formula'?preferences.formulaCopyMode:element.kind==='table'?preferences.tableCopyFormat:'image')}/>
 </div></div>,container)}
 </>;
}
