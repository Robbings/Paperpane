import { useEffect,useState } from 'react';
import type { PdfjsReader } from '@/document/reader/pdfjs-reader';
import type { DocumentRef } from '@/contracts/document';
import { readLayoutPage,pageElements } from './detection';
import type { PaperElement } from './types';
import { toast } from '@/ui/components';
export function useDetection(reader:PdfjsReader,ref:DocumentRef,enabled:boolean){
 const [elements,setElements]=useState<PaperElement[]>([]);
 useEffect(()=>{setElements([]);if(!enabled)return;let alive=true,running=false;let job:AbortController|undefined,currentPage=-1;const lifecycle=new AbortController(),done=new Set<number>(),failed=new Set<number>();
 const desired=()=>{const state=reader.getSnapshot().data;if(state.document?.fileVersion!==ref.fileVersion||state.document.documentId!==ref.documentId)return [];const root=reader.translationScrollElement(),bounds=root.getBoundingClientRect();const visible=[...root.querySelectorAll<HTMLElement>('.page[data-page-number]')].filter(el=>{const b=el.getBoundingClientRect();return b.width>0&&b.bottom>bounds.top&&b.top<bounds.bottom&&b.right>bounds.left&&b.left<bounds.right;}).map(el=>Number(el.dataset.pageNumber)-1);
 return [...new Set([state.position.pageIndex,...visible,state.position.pageIndex+1])].filter(n=>n>=0&&n<state.pageCount);};
 const pump=async()=>{if(running||!alive)return;running=true;try{while(alive){const index=desired().find(n=>!done.has(n)&&!failed.has(n));if(index===undefined)break;currentPage=index;job=new AbortController();const signal=AbortSignal.any([job.signal,lifecycle.signal]);
 try{const page=await readLayoutPage(reader,ref,index,signal),found=await pageElements(reader,page,signal);
 if(alive){done.add(index);setElements(old=>[...old.filter(e=>e.page.pageIndex!==index),...found]);}
 }catch(e){if(signal.aborted){if(!alive)break;}else{failed.add(index);if(failed.size===1)toast.show({tone:'error',duration:4000,message:e instanceof Error?e.message:'页面元素识别失败'});}}
 }}finally{running=false;currentPage=-1;}};
 const schedule=()=>{if(currentPage>=0&&!desired().includes(currentPage))job?.abort();void pump();};
 const off=reader.subscribe(schedule),offGeometry=reader.subscribeProjection('viewport',schedule);void pump();return()=>{alive=false;lifecycle.abort();job?.abort();off();offGeometry();};
 },[reader,ref.documentId,ref.fileVersion,enabled]);return elements;
}
