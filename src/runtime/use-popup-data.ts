import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { LibraryDatabase } from '@/data/library-database';
import { pdfSourceUrl } from '@/browser-entry/pdf';
import type { ActiveTabView, RecentPaperView, TabBlock } from '@/ui/popup/types';
import { recentPaperViews } from './popup-data';

/** Popup-owned subscriptions. Independent reads cannot hide one another's errors. */
export function usePopupData() {
  const [activeTab,setActiveTab]=useState<ActiveTabView|null>(null);
  const [recent,setRecent]=useState<RecentPaperView[]>([]);
  const [recentState,setRecentState]=useState<'loading'|'ready'|'failed'>('loading');
  const [tabError,setTabError]=useState<string>(),[recentError,setRecentError]=useState<string>();
  useEffect(()=>{
    const db=new LibraryDatabase();
    let alive=true,tabEpoch=0,recentEpoch=0,activeTabId:number|undefined,timer:ReturnType<typeof setTimeout>|undefined;
    const pending=new Set<Promise<unknown>>();
    function track(task:Promise<unknown>){pending.add(task);void task.finally(()=>pending.delete(task));}
    async function loadTab(){
      const ticket=++tabEpoch;
      try{
        const [tab]=await browser.tabs.query({active:true,currentWindow:true});
        if(!alive||ticket!==tabEpoch)return;
        if(!tab?.id)throw new Error('当前标签页不可用。');
        activeTabId=tab.id;
        const result=await browser.runtime.sendMessage({type:'GET_PDF_STATE',tabId:tab.id});
        if(!result?.ok)throw new Error(result?.error??'无法识别当前页面。');
        const value=result.value;
        let inLibrary=false;
        const pdf=value.pdfUrl??value.candidateUrl;
        if(pdf&&/^https?:/.test(pdf)){
          const url=pdfSourceUrl(pdf);
          const docs=await db.list();
          const matches=docs.filter(doc=>doc.sourceUrl===url||doc.sources.includes(url));
          for(const doc of matches){if((await db.getItemForDocument(doc.id))?.inLibrary){inLibrary=true;break;}}
        }
        if(alive&&ticket===tabEpoch){
          activeTabId=tab.id;setTabError(undefined);
          setActiveTab({tabId:tab.id,title:value.title,displayUrl:value.displayUrl??'',pdf:pdf?'available':'unavailable',canOpenInReader:!!pdf,block:value.block as TabBlock|undefined,inLibrary});
        }
      }catch(reason){if(alive&&ticket===tabEpoch){setTabError(reason instanceof Error?reason.message:'无法识别当前页面。');setActiveTab({tabId:-1,title:'',displayUrl:'',pdf:'unavailable',canOpenInReader:false,block:'unavailable'});}}
    }
    async function loadRecent(){
      const ticket=++recentEpoch;
      try{
        const docs=await db.list();if(!alive)return;
        const entries=recentPaperViews(docs);
        const rows=await Promise.all(entries.map(entry=>db.getItemForDocument(entry.id)));
        const titles=new Map(rows.flatMap(row=>row?.documentId?[[row.documentId,row.title] as const]:[]));
        if(alive&&ticket===recentEpoch){setRecent(recentPaperViews(docs,titles));setRecentState('ready');setRecentError(undefined);}
      }catch{if(alive&&ticket===recentEpoch){setRecentState('failed');setRecentError('最近阅读记录读取失败，可重新打开弹窗重试。');}}
    }
    const refresh=()=>{if(!alive)return;track(loadTab());track(loadRecent());};
    const schedule=()=>{++tabEpoch;++recentEpoch;clearTimeout(timer);timer=setTimeout(refresh,50);};
    const onActivated:Parameters<typeof browser.tabs.onActivated.addListener>[0]=info=>{activeTabId=info.tabId;schedule();};
    const onUpdated:Parameters<typeof browser.tabs.onUpdated.addListener>[0]=(id,change)=>{if(id===activeTabId&&(change.url||change.title||change.status==='complete'))schedule();};
    const onRemoved=(id:number)=>{if(id===activeTabId)schedule();};
    const onStorage:Parameters<typeof browser.storage.onChanged.addListener>[0]=(changes,area)=>{if(area==='session'&&activeTabId!==undefined&&changes[`pdfTab:${activeTabId}`])schedule();};
    const onVisible=()=>{if(document.visibilityState==='visible')schedule();};
    const channel=new BroadcastChannel('paperpane-documents');channel.onmessage=schedule;
    browser.tabs.onActivated.addListener(onActivated);browser.tabs.onUpdated.addListener(onUpdated);browser.tabs.onRemoved.addListener(onRemoved);browser.storage.onChanged.addListener(onStorage);
    document.addEventListener('visibilitychange',onVisible);window.addEventListener('focus',schedule);refresh();
    return()=>{alive=false;clearTimeout(timer);channel.close();browser.tabs.onActivated.removeListener(onActivated);browser.tabs.onUpdated.removeListener(onUpdated);browser.tabs.onRemoved.removeListener(onRemoved);browser.storage.onChanged.removeListener(onStorage);document.removeEventListener('visibilitychange',onVisible);window.removeEventListener('focus',schedule);void Promise.allSettled([...pending]).then(()=>db.close()).catch(()=>{});};
  },[]);
  return{activeTab,recent,recentState,error:tabError??recentError};
}
