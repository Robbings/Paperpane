import { PaperDatabase } from './database';
import { imageReferences } from '@/transfer/assets';
import { recordPayload as payload } from '@/transfer/records';
import { stable } from '@/sync/merge';
import type { TransferSnapshot, TransferRecord, TransferResult } from '@/contracts/transfer';
export const TRANSFER_STORES=['documents','libraryItems','libraryFolders','libraryTags','libraryPreferences','annotations','annotationLayouts','meta'] as const;
const request=<T>(r:IDBRequest<T>)=>new Promise<T>((ok,no)=>{r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});
const done=(tx:IDBTransaction)=>new Promise<void>((ok,no)=>{tx.oncomplete=()=>ok();tx.onabort=()=>no(tx.error??new Error('存储事务失败'));});
/** Explicit durable-key allowlist. Never copy device IDs, runtime locks or credential stores. */
export function portableMeta(row:TransferRecord):TransferRecord|undefined{
  const key=String(row.key??'');
  if(key==='modelSettings-v1'){
    const record=structuredClone(row) as any;
    if(record.value?.view){record.value.keys={};record.value.view.endpoints=record.value.view.endpoints.map((e:any)=>({...e,hasKey:false}));record.value.view.sync={...record.value.view.sync,hasPassword:false};delete record.value.view.sync.password;}
    return record;
  }
  if(key==='readerPreferences'||/^(notes:v1:|translation:|ai-v1:|transcription:|element-copy:|formula-plan:|zotero-map:|zotero-note:|zotero-original:)/.test(key))return structuredClone(row);
  return undefined;
}
const equal=(a:unknown,b:unknown)=>stable(a)===stable(b);
function durable(name:string,row:TransferRecord){
  const value=structuredClone(row),now=new Date().toISOString();
  if(name!=='meta'&&name!=='libraryPreferences'){value.revision=crypto.randomUUID();value.createdAt??=now;value.updatedAt=now;if(name==='documents'||name==='annotations')value.save={local:'saved',sync:'pending'};}
  if(name==='annotations'||name==='annotationLayouts'){
    const ref=(name==='annotations'?value.anchor:value.document) as {documentId?:string;fileVersion?:string}|undefined;
    if(!ref?.documentId||!ref.fileVersion)throw new Error('批注缺少论文定位');
    value.documentKey=[ref.documentId,ref.fileVersion];
  }
  if(name==='meta'&&String(value.key).startsWith('notes:v1:')){
    const note=value.value as any;
    if(!note?.version?.content||!Array.isArray(note.history))throw new Error('笔记记录无效');
    note.version.revision=crypto.randomUUID();note.version.updatedAt=now;
  }
  if(name==='meta'&&value.value&&typeof value.value==='object'&&(String(value.key).startsWith('ai-v1:')||'revision' in value.value))(value.value as TransferRecord).revision=crypto.randomUUID();return value;
}
function remap(value:unknown,mapping:Map<string,string>):any{
  if(typeof value==='string'){if(mapping.has(value))return mapping.get(value);return value.split(':').map(p=>mapping.get(p)??p).join(':').replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi,id=>mapping.get(id)??id);}
  if(Array.isArray(value))return value.map(v=>remap(v,mapping));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,remap(v,mapping)]));
  return value;
}
export interface TransferConflict {id:string;store:string;key:string;local:TransferRecord;remote:TransferRecord;snapshotId:string;external?:{mappingKey:string;version:number;original?:unknown;slots?:{id:string;key:string}[]}}
export class TransferStore extends PaperDatabase {
  async snapshot(complete=true):Promise<TransferSnapshot>{
    const db=await this.open();
    const names=[...db.objectStoreNames].filter(n=>!['assets','changes','cache'].includes(n));
    if(names.some(n=>!TRANSFER_STORES.includes(n as any)))throw new Error('发现未适配的数据表，请先更新备份功能。');
    const tx=db.transaction([...names,'assets'],'readonly'),completion=done(tx);
    const values=await Promise.all([...names,'assets'].map(n=>request(tx.objectStore(n).getAll())));await completion;
    return this.makeSnapshot(db, Object.fromEntries(names.map((n,i)=>[n,values[i]??[]])), complete ? values.at(-1)??[] : [], complete);
  }
  private makeSnapshot(db:IDBDatabase,rows:Record<string,TransferRecord[]>,files:any[],complete:boolean):TransferSnapshot{
    const stores:Record<string,TransferRecord[]>={...rows,meta:(rows.meta??[]).flatMap(row=>{const portable=portableMeta(row);return portable?[portable]:[];})};
    const wanted=new Set((stores.documents??[]).map(r=>(r.file as any)?.assetId).filter(Boolean));
    for(const hash of imageReferences(stores))wanted.add('note-image:'+hash);
    const assets=files.filter(r=>wanted.has(r.id)).map(r=>({...r,database:db.name,mimeType:r.id.startsWith('note-image:')?'image/png' as const:'application/pdf' as const}));
    return {format:'paperpane-backup',version:2,id:crypto.randomUUID(),createdAt:new Date().toISOString(),complete,databases:[{name:db.name,version:db.version,stores}],assets,preferences:{}};
  }
  /** Snapshot comparison and status writes share a transaction with every content writer. */
  async updateTransferState(update:(snapshot:TransferSnapshot,meta:TransferRecord[])=>Record<string,unknown>){
    const db=await this.open(),tx=db.transaction([...TRANSFER_STORES],'readwrite',{durability:'strict'}),completion=done(tx);void completion.catch(()=>{});
    try{
      const rows=Object.fromEntries(await Promise.all(TRANSFER_STORES.map(async name=>[name,await request(tx.objectStore(name).getAll())])));
      const entries=update(this.makeSnapshot(db,rows,[],false),rows.meta??[]);
      for(const [key,value] of Object.entries(entries))tx.objectStore('meta').put({key,value});
      await completion;
      if(Object.keys(entries).length){const channel=new BroadcastChannel('paperpane-transfer');channel.postMessage({type:'status'});channel.close();}
    }catch(error){try{tx.abort();}catch{}await completion.catch(()=>{});throw error;}
  }
  async restore(snapshot:TransferSnapshot,expected?:TransferSnapshot,external?:TransferConflict['external']):Promise<TransferResult>{
    const db=await this.open();
    if(snapshot.databases.length!==1||snapshot.databases[0]?.name!==db.name||snapshot.databases[0].version>db.version)throw new Error('备份数据库版本不兼容');
    const incoming=snapshot.databases[0].stores;
    if(Object.keys(incoming).some(n=>!TRANSFER_STORES.includes(n as any)))throw new Error('备份包含未知数据表');
    const tx=db.transaction([...TRANSFER_STORES,'assets'],'readwrite',{durability:'strict'}),completion=done(tx);void completion.catch(()=>{});
    try{
      const current=Object.fromEntries(await Promise.all(TRANSFER_STORES.map(async name=>[name,await request(tx.objectStore(name).getAll())] as const))) as Record<typeof TRANSFER_STORES[number], any[]>;
      const available=new Set(await request(tx.objectStore('assets').getAllKeys()));
      for(const asset of snapshot.assets)available.add(asset.id);
      const mapping=new Map<string,string>();
      for(const row of current.documents)if(row.file?.sha256)mapping.set('d-'+row.file.sha256,row.id);
      for(const row of current.libraryItems)if(row.documentId){const doc=current.documents.find(d=>d.id===row.documentId);if(doc?.file?.sha256)mapping.set('i-'+doc.file.sha256,row.id);}
      for(const row of current.libraryTags)mapping.set('t-'+encodeURIComponent(row.normalized),row.id);

      for(const doc of incoming.documents??[]){const found=current.documents.find(d=>d.file?.sha256&&(d.file as any).sha256===(doc.file as any)?.sha256);if(found)mapping.set(String(doc.id),String(found.id));}
      for(const tag of incoming.libraryTags??[]){const found=current.libraryTags.find(t=>t.normalized===tag.normalized);if(found)mapping.set(String(tag.id),String(found.id));}
      for(const item of incoming.libraryItems??[]){const docId=mapping.get(String(item.documentId))??item.documentId;const found=current.libraryItems.find(i=>docId&&i.documentId===docId);if(found)mapping.set(String(item.id),String(found.id));}
      const result:TransferResult={imported:0,unchanged:0,conflicts:0,warnings:[]};
      for(const [name,rows] of Object.entries(incoming))for(const original of rows){
        const portable=name==='meta'?portableMeta(original):original;if(!portable)continue;
        const row=remap(portable,mapping) as TransferRecord;
        if(name==='documents'&&row.file){const file=row.file as any;file.availability=available.has(file.assetId)?'local':'local-missing';}
        const key=String(name==='meta'||name==='libraryPreferences'?row.key:row.id);
        if(!key||key==='undefined')throw new Error('恢复记录缺少标识');
        const old=current[name as keyof typeof current]?.find((r:any)=>String(name==='meta'||name==='libraryPreferences'?r.key:r.id)===key);
        if(!old){tx.objectStore(name).put(durable(name,row));result.imported++;}
        else if(equal(payload(old),payload(row))){
          if(name==='documents'&&(old.file as any)?.availability!==(row.file as any)?.availability)tx.objectStore(name).put(durable(name,row));
          result.unchanged++;
        }
        else if(expected?.databases[0]?.stores[name]?.some(r=>equal(payload(remap(r,mapping)),payload(old)))){tx.objectStore(name).put(durable(name,row));result.imported++;}
        else{
          const id=`transfer-conflict:${snapshot.id}:${name}:${key}`;
          const conflict:TransferConflict={id,store:name,key,local:old,remote:row,snapshotId:snapshot.id,...(external?{external}:{})};
          tx.objectStore('meta').put({key:id,value:conflict});result.conflicts++;
        }
      }
      for(const asset of snapshot.assets){if(asset.database!==db.name)throw new Error('文件来源数据库无效');const {database,...data}=asset;tx.objectStore('assets').put(data);}
      if(!snapshot.complete)result.warnings.push('这是数据备份，未包含的 PDF 和图片仍需重新关联。');
      if(snapshot.version===1)result.warnings.push('旧版备份不保证包含整篇笔记、笔记历史和嵌入图片。');
      await completion;this.notify();return result;
    }catch(error){try{tx.abort();}catch{}await completion.catch(()=>{});throw error;}
  }
  async trash():Promise<{store:string;key:string;record:TransferRecord}[]>{const db=await this.open(),names=['libraryItems','libraryFolders','libraryTags','annotations'];const tx=db.transaction(names,'readonly');return (await Promise.all(names.map(async name=>(await request(tx.objectStore(name).getAll())).filter(r=>r.deletedAt||(name==='libraryItems'&&r.inLibrary===false)).map(record=>({store:name,key:String(record.id),record}))))).flat();}
  async restoreTrash(item:{store:string;key:string;record:TransferRecord}){const db=await this.open();if(!['libraryItems','libraryFolders','libraryTags','annotations'].includes(item.store))throw new Error('回收站记录无效');const tx=db.transaction(item.store,'readwrite',{durability:'strict'}),completion=done(tx);try{const current=await request(tx.objectStore(item.store).get(item.key));if(!equal(current,item.record))throw new Error('记录已改变，请重新读取');const value={...current,deletedAt:undefined,...(item.store==='libraryItems'?{inLibrary:true}:{})};tx.objectStore(item.store).put(durable(item.store,value));await completion;this.notify();}catch(e){try{tx.abort();}catch{}await completion.catch(()=>{});throw e;}}
  async conflicts():Promise<TransferConflict[]>{const db=await this.open();return (await request(db.transaction('meta').objectStore('meta').getAll(IDBKeyRange.bound('transfer-conflict:','transfer-conflict:\uffff')))).map(r=>r.value);}
  async refreshConflict(id:string){
    const db=await this.open(),tx=db.transaction([...TRANSFER_STORES],'readwrite',{durability:'strict'}),completion=done(tx);
    try{const entry=await request(tx.objectStore('meta').get(id));if(!entry)throw new Error('冲突已处理');const conflict=entry.value as TransferConflict;
      const current=await request(tx.objectStore(conflict.store).get(conflict.key));
      tx.objectStore('meta').put({key:id.replace('transfer-conflict:','transfer-history:')+':'+crypto.randomUUID(),value:{...conflict,reason:'refreshed'}});
      tx.objectStore('meta').put({key:id,value:{...conflict,local:current}});await completion;
    }catch(e){try{tx.abort();}catch{}await completion.catch(()=>{});throw e;}
  }
  async resolveConflict(id:string,choice:'local'|'remote'){
    const db=await this.open(),tx=db.transaction([...TRANSFER_STORES],'readwrite',{durability:'strict'}),completion=done(tx);
    try{const record=await request(tx.objectStore('meta').get(id));const conflict:TransferConflict|undefined=record?.value;if(!conflict)throw new Error('冲突已处理');
      const current=await request(tx.objectStore(conflict.store).get(conflict.key));if(!equal(current,conflict.local))throw new Error('本机内容已变化，请重新同步后处理');
      if(choice==='remote'){
        const remote=structuredClone(conflict.remote);
        if(conflict.store==='meta'&&conflict.key.startsWith('notes:v1:')){
          const note=remote.value as any,previous=current?.value;
          if(previous?.version)note.history=[...note.history,...(previous.history??[]),previous.version].filter((v,i,all)=>all.findIndex(x=>equal(x,v))===i);
        }
        tx.objectStore(conflict.store).put(durable(conflict.store,remote));
      }
      if(conflict.external){const info=conflict.external;const mapping=await request(tx.objectStore('meta').get(info.mappingKey));if(mapping){
        const value=mapping.value;
        if(info.slots){value.annotationKeys??={};for(const slot of info.slots)value.annotationKeys[slot.id]={...value.annotationKeys[slot.id],key:slot.key,version:info.version};}
        else{value.version=info.version;if(info.original)value.original=info.original;}
        tx.objectStore('meta').put({key:info.mappingKey,value});
      }}
      // Keep both copies as history even after resolving.
      tx.objectStore('meta').put({key:id.replace('transfer-conflict:','transfer-history:'),value:{...conflict,resolved:choice,at:new Date().toISOString()}});tx.objectStore('meta').delete(id);await completion;this.notify();
    }catch(e){try{tx.abort();}catch{}await completion.catch(()=>{});throw e;}
  }
  private notify(){for(const name of ['paperpane-notes','paperpane-documents','paperpane-annotations','paperpane-ai','paperpane-model-settings','paperpane-preferences','paperpane-transfer']){const c=new BroadcastChannel(name);c.postMessage({type:'restored'});c.close();}}
}
