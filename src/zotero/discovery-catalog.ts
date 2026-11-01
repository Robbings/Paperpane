import type { ZoteroClient } from './client';
import type { ZoteroCollection, ZoteroItem } from './types';
import type { WebDavClient } from '@/sync/webdav-client';
import { zoteroArchiveNames } from './webdav-discovery';
import { collectionLabels } from './catalog';
export interface DiscoveredPaper {
  key:string; title:string; filename?:string; paper?:ZoteroItem; paths:string[];
  status:'loading'|'ready'|'unavailable'; detail?:string;
}
/** Resolve metadata in batches; unmatched archives use their actual PDF filename. */
export async function discoveryCatalog(keys:readonly string[],dav:WebDavClient,client:ZoteroClient|undefined,signal:AbortSignal,
  onRow:(row:DiscoveredPaper)=>void,onCollections:(rows:ZoteroCollection[])=>void,onWarning:(message:string)=>void){
  let collections:ZoteroCollection[]=[],attachments:ZoteroItem[]=[],parents:ZoteroItem[]=[];
  if(client){
    try{
      collections=await client.collections(signal);onCollections(collections);
      attachments=await client.itemsByKeys(keys,signal);
      parents=await client.itemsByKeys(attachments.flatMap(a=>a.data.parentItem?[a.data.parentItem]:[]),signal);
    }catch(e){signal.throwIfAborted();onWarning((e instanceof Error?e.message:'Zotero 读取失败')+'；未关联的附件将显示 PDF 文件名，可重试读取。');}
  }
  for(const [index,key] of keys.entries()){
    signal.throwIfAborted();
    const attachment=attachments.find(a=>a.key===key);
    const paper=attachment?.data.parentItem?parents.find(p=>p.key===attachment.data.parentItem):attachment;
    if(attachment&&paper){
      const pdf=attachment.data.contentType==='application/pdf'||/\.pdf$/i.test(attachment.data.filename??'');
      onRow({key,title:paper.data.title||attachment.data.filename||`附件 ${index+1}`,filename:attachment.data.filename,paper,paths:collectionLabels(paper,collections),status:pdf?'ready':'unavailable',detail:pdf?undefined:'不是 PDF 附件'});continue;
    }
    try{
      const names=await zoteroArchiveNames(dav,key,signal);signal.throwIfAborted();
      onRow({key,title:names.length===1?names[0]!.replace(/\.pdf$/i,''):`附件 ${index+1}`,filename:names[0],paths:[],status:names.length===1?'ready':'unavailable',detail:names.length===1?'PDF 文件名 · 未关联 Zotero 书目':names.length?'包含多个 PDF，请连接 Zotero 后选择':'不是 PDF 附件'});
    }catch(e){signal.throwIfAborted();onRow({key,title:`附件 ${index+1}`,paths:[],status:'unavailable',detail:e instanceof Error?e.message:'名称读取失败'});}
  }
}
