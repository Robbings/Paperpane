import { zoteroBibliography } from './bibliography';
import { mergeEntities } from '@/sync/merge';
import { ZoteroClient, ZoteroError } from './client';
import type { ZoteroItem } from './types';
import { ZoteroMappings, type ZoteroLink } from '@/data/zotero-mappings';
import { AnnotationDatabase } from '@/data/annotation-database';
import { TransferStore } from '@/data/transfer-store';
import { ConnectionStore } from '@/sync/settings';
import { WebDavClient } from '@/sync/webdav-client';
import { responseBytes } from '@/sync/engine';
import { fromZoteroAnnotation } from './annotations';
import { cleanZoteroNote, noteText } from './notes';
import { importPdfBlob } from './pdf-import';
import { pdfViews } from './pdf-geometry';
import { md5 } from './md5';
import { zoteroArchive } from './webdav-discovery';
export interface ZoteroTransferItemResult {key:string;title:string;ok:boolean;message:string;warnings:string[]}
export async function importZotero(client:ZoteroClient,items:readonly ZoteroItem[],folderId:string|null,signal:AbortSignal,onResult:(value:ZoteroTransferItemResult)=>void,askPassword?:(incorrect:boolean)=>Promise<string|null>,onlyAttachments?:ReadonlySet<string>){
  const db=new ZoteroMappings(),annotations=new AnnotationDatabase(),connections=new ConnectionStore();
  async function metadata(id:string,item:ZoteroItem):Promise<ZoteroLink>{
    const local=await db.rawItem(id);if(!local)throw new Error('没有找到本机文献');
    const previous=await db.link(client.userId,id);
    const link:ZoteroLink={...previous,itemKey:item.key,version:item.version,collections:item.data.collections??[],original:item.data,annotationKeys:previous?.annotationKeys??{}};
    const incoming=zoteroBibliography(item.data);
    if(previous?.original&&previous.version!==item.version){
      const before=zoteroBibliography(previous.original),current=Object.fromEntries(Object.keys(before).map(k=>[k,(local as any)[k]]));
      const result=mergeEntities({item:before},{item:current},{item:incoming});
      if(result.conflicts.length){
        const restore=new TransferStore();
        try{await restore.restore({format:'paperpane-backup',version:1,id:crypto.randomUUID(),createdAt:new Date().toISOString(),complete:false,databases:[{name:'paperpane',version:3,stores:{libraryItems:[{...local,...incoming} as unknown as Record<string,unknown>]}}],assets:[],preferences:{}},undefined,{mappingKey:`zotero-map:${client.userId}:${id}`,version:item.version,original:item.data});}finally{await restore.close();}
      }else{
        const {doi,...patch}=result.records.item!;await db.update(id,local.revision,patch);
        if(local.document&&doi)await db.saveBibliography(local.document,{version:1,doi:String(doi),sources:{}});
      }
    }else if(!previous&&!local.editedFields?.length){const {doi,...patch}=incoming;await db.update(id,local.revision,patch);if(local.document&&doi)await db.saveBibliography(local.document,{version:1,doi,sources:{}});}
    if(item.data.tags?.length)await db.addTags([id],item.data.tags.map(t=>({label:t.tag})));
    await db.saveLink(client.userId,id,link);return link;
  }
  async function notes(id:string,values:ZoteroItem[],link:ZoteroLink,warnings:string[],document?:{documentId:string;fileVersion:string}){
    const texts:string[]=[];
    for(const note of values){if(/<(?:img|iframe|object)\b/i.test(note.data.note??''))warnings.push('笔记含外部媒体，已保留原始记录，纸窗仅显示文本');const html=cleanZoteroNote(note.data.note??'');texts.push(noteText(html));await db.saveRecord(`zotero-note:${client.userId}:${note.key}`,{document,itemId:id,original:note.data,html});}
    const local=await db.getItem(id),text=texts.filter(Boolean).join('\n\n');
    if(local&&text&&(!local.shortNote||local.shortNote===link.importedShortNote)){await db.update(id,local.revision,{shortNote:text});link.importedShortNote=text;}
    else if(local&&text&&local.shortNote!==text)warnings.push('已保留本机笔记，Zotero 原始文本笔记已另存');
  }
  try{for(const item of items){
    signal.throwIfAborted();const warnings:string[]=[];let imported=0;
    try{
      const children=item.data.itemType==='attachment'?[item]:await client.children(item.key,signal);
      const pdfs=children.filter(row=>(!onlyAttachments||onlyAttachments.has(row.key))&&row.data.itemType==='attachment'&&(row.data.contentType==='application/pdf'||row.data.filename?.toLowerCase().endsWith('.pdf')));
      if(!pdfs.length){
        const bibliographyKey=`zotero:${client.userId}:${item.key}`;
        await db.importBibliography([{...zoteroBibliography(item.data),source:'web',bibliographyKey}],folderId);
        const local=await db.imported(bibliographyKey);if(local){const link=await metadata(local.id,item);await notes(local.id,children.filter(c=>c.data.itemType==='note'),link,warnings);await db.saveLink(client.userId,local.id,link);}
        warnings.push('未找到 PDF，已导入书目');
      }
      for(const attachment of pdfs){
        signal.throwIfAborted();let blob:Blob;
        try{const r=await client.download(attachment.key,signal),bytes=await responseBytes(r,1024*1024*1024,signal);if(attachment.data.md5&&md5(bytes)!==attachment.data.md5)throw new Error('附件版本校验失败，请先让 Zotero 完成同步');blob=new Blob([new Uint8Array(bytes)],{type:'application/pdf'});}
        catch(e){if(!(e instanceof ZoteroError)||![404,409].includes(e.status))throw e;const dav=await connections.dav();if(!dav)throw e;blob=await zoteroArchive(new WebDavClient(dav),attachment.key,attachment.data.filename,signal);if(attachment.data.md5&&md5(new Uint8Array(await blob.arrayBuffer()))!==attachment.data.md5)throw new Error('WebDAV 附件版本与 Zotero 不一致');}
        const doc=await importPdfBlob(db,blob,attachment.data.filename??'Zotero.pdf',folderId,signal,askPassword),ref={documentId:doc.id,fileVersion:doc.fileVersion};
        const local=await db.getItemForDocument(doc.id);if(!local)throw new Error('导入后未找到文献记录');
        const previous=await db.link(client.userId,local.id),link=await metadata(local.id,item);
        link.attachmentKey=attachment.key;link.attachmentVersion=attachment.version;link.fileHash=doc.file.sha256;link.uploaded=true;
        await db.saveLink(client.userId,local.id,link);
        const content=await client.children(attachment.key,signal);
        await notes(local.id,[...children.filter(c=>c.data.itemType==='note'),...content.filter(c=>c.data.itemType==='note')],link,warnings,ref);
        const markup=content.filter(c=>c.data.itemType==='annotation');
        const views=markup.length?await pdfViews(blob,signal):[];
        for(const annotation of markup){
          const id=`zotero:${client.userId}:${annotation.key}:${doc.fileVersion}`;
          const saved=await annotations.load(ref),existing=saved.items.find(r=>r.id===id);
          await db.saveRecord(`zotero-original:${client.userId}:${annotation.key}`,{document:ref,source:annotation});
          try{const row=fromZoteroAnnotation(annotation,ref,views,id);if(!existing){await annotations.create(ref,row.kind==='page-comment'?{kind:'page-comment',anchor:row.anchor,color:row.color,comment:row.comment}:{kind:row.kind,selection:{anchor:row.anchor,text:row.quote},color:row.color,comment:row.comment},id);}
            else if(previous?.annotationKeys?.[id+':'+row.anchor.pages[0]!.pageIndex]?.version!==annotation.version){const restore=new TransferStore();try{await restore.restore({format:'paperpane-backup',version:1,id:crypto.randomUUID(),createdAt:new Date().toISOString(),complete:false,databases:[{name:'paperpane',version:3,stores:{annotations:[row as unknown as Record<string,unknown>]}}],assets:[],preferences:{}},undefined,{mappingKey:`zotero-map:${client.userId}:${local.id}`,version:annotation.version,slots:row.anchor.pages.map(page=>({id:id+':'+page.pageIndex,key:annotation.key}))});}finally{await restore.close();}}
            for(const page of row.anchor.pages)link.annotationKeys![id+':'+page.pageIndex]={key:annotation.key,version:annotation.version,color:annotation.data.annotationColor,localColor:row.color};
            if(annotation.data.annotationColor&&!['#ffd400','#5fb236','#2ea8e5','#ff6666','#a28ae5'].includes(annotation.data.annotationColor.toLowerCase()))warnings.push('部分颜色按纸窗调色板显示，已保留原始颜色');
          }catch(e){warnings.push(e instanceof Error?e.message:'批注未能转换，已保留原始记录');}
        }
        await db.saveLink(client.userId,local.id,link);imported++;
      }
      onResult({key:item.key,title:item.data.title??item.key,ok:true,message:imported?`已导入 ${imported} 个 PDF`:'书目已导入',warnings});
    }catch(e){onResult({key:item.key,title:item.data.title??item.key,ok:false,message:e instanceof Error?e.message:'导入失败',warnings});}
  }}finally{await Promise.all([db.close(),annotations.close(),connections.close()]);const channel=new BroadcastChannel('paperpane-documents');channel.postMessage('imported');channel.close();}
}
