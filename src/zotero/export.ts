import { ZoteroClient, ZoteroError, zoteroKey } from './client';
import { ZoteroMappings } from '@/data/zotero-mappings';
import { TransferStore } from '@/data/transfer-store';
import { AnnotationDatabase } from '@/data/annotation-database';
import { toZoteroAnnotations } from './annotations';
import { plainNote } from './notes';
import { exportNotes } from '@/domain/notes/export';
import { pdfViews } from './pdf-geometry';
import { stable } from '@/sync/merge';
import { md5 } from './md5';
import { ConnectionStore, type ZoteroFileStorage } from '@/sync/settings';
import { putZoteroFile, zoteroFolder } from './webdav-discovery';
import type { ZoteroTransferItemResult } from './import';
import type { ZoteroData, ZoteroItem } from './types';
/** Reserve keys before dispatch, so retrying a partially successful export does not create copies.
 * Files go to Zotero's storage, or to the WebDAV folder Zotero desktop syncs with, as `storage` says. */
export async function exportZotero(client:ZoteroClient,ids:readonly string[],collection:string|null,signal:AbortSignal,onResult:(value:ZoteroTransferItemResult)=>void,storage:ZoteroFileStorage='zotero'){
  let folder:Awaited<ReturnType<typeof zoteroFolder>>|undefined;
  if(storage==='webdav'){
    const connections=new ConnectionStore();
    try{const dav=await connections.dav();if(!dav)throw new Error('WebDAV 已断开，请重新连接或改用 Zotero 存储');folder=await zoteroFolder(dav,signal);}finally{await connections.close();}
  }
  const db=new ZoteroMappings(),annotations=new AnnotationDatabase();
  const existing=async(key:string)=>{try{return await client.item(key,signal);}catch(e){if(e instanceof ZoteroError&&e.status===404)return undefined;throw e;}};
  const save=async(data:ZoteroData,knownVersion?:number):Promise<ZoteroItem>=>{
    const remote=data.key?await existing(data.key):undefined;
    if(remote&&knownVersion!==undefined&&remote.version!==knownVersion)throw new ZoteroError(412,'Zotero 里有新改动，请先导入');
    if(remote&&knownVersion===undefined){
      // A reserved key whose request previously completed is adopted, never blindly overwritten.
      if(remote.data.itemType!==data.itemType||remote.data.parentItem!==data.parentItem)throw new Error('远程条目标识冲突');
      if(Object.entries(data).some(([key,value])=>!['key','version'].includes(key)&&stable(value)!==stable(remote.data[key])))throw new ZoteroError(412,'Zotero 里有新改动，请先导入');
      return remote;
    }
    return client.save({...data,...(remote?{version:knownVersion}:{})},signal);
  };
  /** WebDAV: archive and .prop first, then the item's md5/mtime, which tells Zotero desktop to download. Zotero storage: upload to an existing item. */
  const sendFile=async(key:string,attachment:ZoteroItem|undefined,fresh:ZoteroData,blob:Blob,hash:string,reserveMtime:()=>Promise<number>):Promise<ZoteroItem>=>{
    if(folder){
      const mtime=await reserveMtime();
      await putZoteroFile(folder,key,new Uint8Array(await blob.arrayBuffer()),String(attachment?.data.filename??fresh.filename),hash,mtime,signal);
      return save({...(attachment?.data??fresh),key,md5:hash,mtime},attachment?.version);
    }
    await client.upload(key,blob,String(attachment!.data.filename??fresh.filename),attachment!.data.md5,signal);
    return client.item(key,signal);
  };
  try{for(const id of ids){signal.throwIfAborted();const warnings:string[]=[];let title=id;
    try{
      const local=await db.getItem(id);if(!local)throw new Error('所选文献已不存在');title=local.title;
      const transfer=new TransferStore();try{await transfer.migrateConflicts();}finally{await transfer.close();}
      let link=await db.link(client.userId,id);
      if(!link||link.original?.itemType==='attachment')link={itemKey:zoteroKey(),attachmentKey:undefined,collections:[],annotationKeys:{}};
      const checkpoint=async()=>db.saveLink(client.userId,id,link!);
      await checkpoint();
      const remote=await existing(link.itemKey);
      const item:ZoteroData={...(remote?.data??{itemType:'journalArticle',tags:[],collections:[]}),key:link.itemKey,title:local.title,creators:local.authors.map(name=>({creatorType:'author',name})),abstractNote:local.abstract??'',date:local.year?String(local.year):'',collections:[...new Set([...(remote?.data.collections??link.collections),...(collection?[collection]:[])])],extra:`${String(remote?.data.extra??'').replace(/\n?Paperpane:.*$/m,'')}\nPaperpane: ${id}`.trim()};
      if(item.itemType==='journalArticle'){item.publicationTitle=local.venue??'';item.DOI=local.doi??'';}
      const labels=await db.tagLabels(local.tagIds);item.tags=[...new Set([...(remote?.data.tags??[]).map(t=>t.tag),...labels])].map(tag=>({tag}));
      const persisted=await save(item,link.version);link.version=persisted.version;link.collections=persisted.data.collections??[];await checkpoint();
      if(local.document){
        const doc=await db.getDocument(local.document.documentId);if(!doc||doc.fileVersion!==local.document.fileVersion)throw new Error('本机 PDF 版本已改变');
        const blob=await db.readFile(doc),hash=md5(new Uint8Array(await blob.arrayBuffer()));
        if(!link.attachmentKey){link.attachmentKey=zoteroKey();await checkpoint();}
        const fresh:ZoteroData={key:link.attachmentKey,itemType:'attachment',parentItem:link.itemKey,linkMode:'imported_file',title:doc.originalFilename,filename:doc.originalFilename,contentType:'application/pdf',tags:[]};
        let attachment=await existing(link.attachmentKey);
        if(attachment){
          if(attachment.data.itemType!=='attachment'||attachment.data.parentItem!==link.itemKey)throw new Error('远程附件标识冲突');
          if(link.attachmentVersion!==undefined&&attachment.version!==link.attachmentVersion){
            // A different remote file is an edit made in Zotero. The same bytes are a lost response or Zotero desktop touching the item: adopt them.
            if(attachment.data.md5!==hash)throw new ZoteroError(412,'Zotero 附件有改动，请先导入');
            if(!link.uploaded||link.fileHash!==doc.file.sha256){link.uploaded=true;link.fileHash=doc.file.sha256;link.attachmentStorage=storage;delete link.fileMtime;}
          }
        }else if(!folder)attachment=await save(fresh,link.attachmentVersion);
        if(attachment){link.attachmentVersion=attachment.version;await checkpoint();}
        if(!link.uploaded||link.fileHash!==doc.file.sha256||(link.attachmentStorage??'zotero')!==storage){
          const saved=await sendFile(link.attachmentKey,attachment,fresh,blob,hash,async()=>{const mtime=link!.fileMtime??=Date.now();await checkpoint();return mtime;});
          link.uploaded=true;link.fileHash=doc.file.sha256;link.attachmentStorage=storage;delete link.fileMtime;link.attachmentVersion=saved.version;await checkpoint();
        }
        const rows=(await annotations.load(local.document)).items.filter(r=>!r.deletedAt);
        if(rows.length){
          const views=await pdfViews(blob,signal);link.annotationKeys??={};
          for(const row of rows){const values=toZoteroAnnotations(row,link.attachmentKey,views);
            const groups=new Map<string,{slots:string[];value:ZoteroData;version?:number}>();
            for(let index=0;index<values.length;index++){
              const slot=row.id+':'+row.anchor.pages[index]!.pageIndex;
              const target=link.annotationKeys[slot]??{key:zoteroKey()};link.annotationKeys[slot]=target;
              const group=groups.get(target.key);
              if(group){
                const first=JSON.parse(String(group.value.annotationPosition)),next=JSON.parse(String(values[index]!.annotationPosition));
                if(next.pageIndex!==first.pageIndex+1||first.nextPageRects)throw new Error('跨页批注没有导出');first.nextPageRects=next.rects;group.value.annotationPosition=JSON.stringify(first);group.slots.push(slot);
              }else groups.set(target.key,{slots:[slot],value:{...values[index]!,key:target.key,...(target.localColor===row.color&&target.color?{annotationColor:target.color}:{})},version:target.version});
            }
            await checkpoint();
            for(const group of groups.values()){const saved=await save(group.value,group.version);for(const slot of group.slots){link.annotationKeys[slot]!.version=saved.version;link.annotationKeys[slot]!.color=saved.data.annotationColor;link.annotationKeys[slot]!.localColor=row.color;}await checkpoint();}
          }

        }
      }else warnings.push('这条书目没有关联 PDF');
      if(local.shortNote?.trim()&&local.shortNote!==link.importedShortNote){
        if(!link.noteKey){link.noteKey=zoteroKey();await checkpoint();}
        const saved=await save({key:link.noteKey,itemType:'note',parentItem:link.itemKey,note:plainNote(local.shortNote),tags:[]},link.noteVersion);link.noteVersion=saved.version;await checkpoint();
      }
      const notes = await exportNotes([local], false);
      if(notes){
        const hash=md5(new Uint8Array(await notes.arrayBuffer()));
        link.notesAttachment??={key:zoteroKey()};await checkpoint();
        const target=link.notesAttachment;
        const fresh:ZoteroData={key:target.key,itemType:'attachment',parentItem:link.itemKey,linkMode:'imported_file',title:'Paperpane 阅读笔记',filename:'Paperpane-notes.zip',contentType:'application/zip',tags:[]};
        let attachment=await existing(target.key);
        if(attachment){
          if(attachment.data.itemType!=='attachment'||attachment.data.parentItem!==link.itemKey)throw new Error('远程笔记附件标识冲突');
          if(target.version!==undefined&&attachment.version!==target.version){
            // Recover a completed upload with a lost response, never replace a remote edit.
            if(attachment.data.md5!==hash)throw new ZoteroError(412,'Zotero 笔记附件有改动，请先保留远程版本');
            if(!target.uploaded||target.hash!==hash){target.uploaded=true;target.hash=hash;target.storage=storage;delete target.mtime;}
          }
        }else if(!folder)attachment=await save(fresh);
        if(attachment){target.version=attachment.version;await checkpoint();}
        if(!target.uploaded||target.hash!==hash||(target.storage??'zotero')!==storage){
          const saved=await sendFile(target.key,attachment,fresh,notes,hash,async()=>{const mtime=target.mtime??=Date.now();await checkpoint();return mtime;});
          target.uploaded=true;target.hash=hash;target.storage=storage;delete target.mtime;target.version=saved.version;await checkpoint();
        }
      }
      link.version=(await client.item(link.itemKey,signal)).version;await checkpoint();
      onResult({key:id,title,ok:true,message:'已导出到 Zotero',warnings});
    }catch(e){onResult({key:id,title,ok:false,message:e instanceof Error?e.message:'导出失败，可重试',warnings});}
  }}finally{await Promise.all([db.close(),annotations.close()]);}
}
