import { PaperDatabase } from './database';
import { imageReferences } from '@/transfer/assets';
import { recordPayload as payload } from '@/transfer/records';
import { stable, sameContent, mergeEntities, contentAt, replaceContent, type MergeVersion } from '@/sync/merge';
import { savedVersion, type SavedVersion } from '@/sync/versions';
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
  if(key==='readerPreferences'||key==='overview-template-v1'||/^(transfer-version:|notes:v1:|translation:|ai-v1:|transcription:|element-copy:|formula-plan:|zotero-map:|zotero-note:|zotero-original:)/.test(key))return structuredClone(row);
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
    await this.migrateConflicts();
    const db=await this.open();
    const names=[...db.objectStoreNames].filter(n=>!['assets','changes','cache'].includes(n));
    if(names.some(n=>!TRANSFER_STORES.includes(n as any)))throw new Error('备份来自更新的版本，请先更新纸间');
    const tx=db.transaction([...names,'assets'],'readonly'),completion=done(tx);
    const values=await Promise.all([...names,'assets'].map(n=>request(tx.objectStore(n).getAll())));await completion;
    return this.makeSnapshot(db, Object.fromEntries(names.map((n,i)=>[n,values[i]??[]])), complete ? values.at(-1)??[] : [], complete);
  }
  private makeSnapshot(db:IDBDatabase,rows:Record<string,TransferRecord[]>,files:any[],complete:boolean):TransferSnapshot{
    const stores:Record<string,TransferRecord[]>={...rows,meta:(rows.meta??[]).flatMap(row=>{const portable=portableMeta(row);return portable?[portable]:[];})};
    const wanted=new Set((stores.documents??[]).map(r=>(r.file as any)?.assetId).filter(Boolean));
    for(const hash of imageReferences(stores))wanted.add('note-image:'+hash);
    const assets=files.filter(r=>wanted.has(r.id)).map(r=>({...r,database:db.name,mimeType:r.id.startsWith('note-image:')?'image/png' as const:'application/pdf' as const}));
    return {format:'paperpane-backup',version:3,id:crypto.randomUUID(),createdAt:new Date().toISOString(),complete,databases:[{name:db.name,version:db.version,stores}],assets,preferences:{}};
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
      const result:TransferResult={imported:0,unchanged:0,conflicts:0,preserved:0,warnings:[]};
      for(const [name,rows] of Object.entries(incoming))for(const original of rows){
        const portable=name==='meta'?portableMeta(original):original;if(!portable)continue;
        const row=remap(portable,mapping) as TransferRecord;
        if(name==='documents'&&row.file){const file=row.file as any;file.availability=available.has(file.assetId)?'local':'local-missing';}
        const key=String(name==='meta'||name==='libraryPreferences'?row.key:row.id);
        if(!key||key==='undefined')throw new Error('恢复记录缺少标识');
        if(name==='meta'&&key.startsWith('transfer-version:')){const existing=current.meta.find(r=>r.key===key);if(!existing||String((row.value as any)?.savedAt)<String(existing.value?.savedAt))tx.objectStore('meta').put(row);continue;}
        const old=current[name as keyof typeof current]?.find((r:any)=>String(name==='meta'||name==='libraryPreferences'?r.key:r.id)===key);
        if(!old){tx.objectStore(name).put(durable(name,row));result.imported++;}
        else if(equal(payload(old),payload(row))){
          if(name==='documents'&&(old.file as any)?.availability!==(row.file as any)?.availability)tx.objectStore(name).put(durable(name,row));
          result.unchanged++;
        }
        else if(expected?.databases[0]?.stores[name]?.some(r=>equal(payload(remap(r,mapping)),payload(old)))){tx.objectStore(name).put(durable(name,row));result.imported++;}
        else{
          const base=expected?.databases[0]?.stores[name]?.map(r=>remap(r,mapping)).find(r=>String(name==='meta'||name==='libraryPreferences'?r.key:r.id)===key);
          const entity=[db.name,name,key].map(encodeURIComponent).join('/');
          const merged=mergeEntities(base?{[entity]:payload(base)}:{},{[entity]:payload(old)},{[entity]:payload(row)});
          const next=merged.records[entity]!;
          if(name==='documents'&&next.file)(next.file as any).availability=(row.file as any)?.availability;
          tx.objectStore(name).put(durable(name,next));
          result.preserved!+=this.keepVersions(tx,name,key,merged.versions,current.meta,snapshot.createdAt);
          result.imported++;
        }
      }
      if(external)await this.updateExternal(tx,external);
      for(const asset of snapshot.assets){if(asset.database!==db.name)throw new Error('文件来源数据库无效');const {database,...data}=asset;tx.objectStore('assets').put(data);}
      if(!snapshot.complete)result.warnings.push('这份备份不含 PDF 和图片');
      if(snapshot.version===1)result.warnings.push('旧版备份，可能缺少部分笔记');
      await completion;this.notify();return result;
    }catch(error){try{tx.abort();}catch{}await completion.catch(()=>{});throw error;}
  }
  async trash():Promise<{store:string;key:string;record:TransferRecord}[]>{const db=await this.open(),names=['libraryItems','libraryFolders','libraryTags','annotations'];const tx=db.transaction(names,'readonly');return (await Promise.all(names.map(async name=>(await request(tx.objectStore(name).getAll())).filter(r=>r.deletedAt||(name==='libraryItems'&&r.inLibrary===false)).map(record=>({store:name,key:String(record.id),record}))))).flat();}
  async restoreTrash(item:{store:string;key:string;record:TransferRecord}){const db=await this.open();if(!['libraryItems','libraryFolders','libraryTags','annotations'].includes(item.store))throw new Error('回收站记录无效');const tx=db.transaction(item.store,'readwrite',{durability:'strict'}),completion=done(tx);try{const current=await request(tx.objectStore(item.store).get(item.key));if(!equal(current,item.record))throw new Error('记录已改变，请重新读取');const value={...current,deletedAt:undefined,...(item.store==='libraryItems'?{inLibrary:true}:{})};tx.objectStore(item.store).put(durable(item.store,value));await completion;this.notify();}catch(e){try{tx.abort();}catch{}await completion.catch(()=>{});throw e;}}
  private async updateExternal(tx:IDBTransaction,info:NonNullable<TransferConflict['external']>){
    const entry=await request(tx.objectStore('meta').get(info.mappingKey));if(!entry)return;
    if(info.slots){entry.value.annotationKeys??={};for(const slot of info.slots){const old=entry.value.annotationKeys[slot.id];if((old?.version??0)<=info.version)entry.value.annotationKeys[slot.id]={...old,key:slot.key,version:info.version};}}
    else if((entry.value.version??0)<=info.version){entry.value.version=info.version;if(info.original)entry.value.original=info.original;}
    tx.objectStore('meta').put(entry);
  }
  private keepVersions(tx:IDBTransaction,store:string,key:string,versions:MergeVersion[],meta:any[],at=new Date().toISOString()){
    let count=0;
    for(const entry of versions){
      const version=savedVersion(store,key,entry.path,entry.value,at);
      if(meta.some(r=>r.key.startsWith('transfer-version:')&&equal({store:r.value.store,key:r.value.key,path:r.value.path},{store,key,path:entry.path})&&sameContent(r.value.value,entry.value)))continue;
      const existing=meta.find(r=>r.key===version.id);
      if(existing&&equal({store:existing.value.store,key:existing.value.key,path:existing.value.path,value:existing.value.value},{store,key,path:entry.path,value:entry.value}))continue;
      if(existing)version.id+=':'+crypto.randomUUID();
      const row={key:version.id,value:version};tx.objectStore('meta').put(row);meta.push(row);count++;
    }
    return count;
  }
  /** Convert old blocking conflicts against the latest content, without overwriting later edits. */
  async migrateConflicts(){
    const db=await this.open(),tx=db.transaction([...TRANSFER_STORES],'readwrite',{durability:'strict'}),completion=done(tx);void completion.catch(()=>{});
    try{
      const meta=await request(tx.objectStore('meta').getAll());let changed=false;
      for(const entry of meta.filter(r=>r.key.startsWith('transfer-conflict:'))){
        const conflict=entry.value as TransferConflict;
        if(!TRANSFER_STORES.includes(conflict.store as any))continue;
        const current=await request(tx.objectStore(conflict.store).get(conflict.key));
        // No common ancestor is assumed for an old backup conflict: retain every differing value.
        const merged=mergeEntities({}, {record:payload(current??conflict.local)}, {record:payload(conflict.remote)});
        this.keepVersions(tx,conflict.store,conflict.key,merged.versions,meta);
        // Earlier local content may have changed again while the old dialog was open.
        const prior=mergeEntities({}, {record:payload(current??conflict.local)}, {record:payload(conflict.local)});
        this.keepVersions(tx,conflict.store,conflict.key,prior.versions,meta);
        if(current){const next=merged.records.record!;if(conflict.store==='documents'&&next.file)(next.file as any).availability=current.file?.availability;tx.objectStore(conflict.store).put(durable(conflict.store,next));}
        if(conflict.external)await this.updateExternal(tx,conflict.external);
        tx.objectStore('meta').delete(entry.key);changed=true;
      }
      if(changed){const state=meta.find(r=>r.key==='transfer-sync-state')?.value;if(state?.phase==='conflicts')tx.objectStore('meta').put({key:'transfer-sync-state',value:{...state,phase:'idle',message:'已同步，有另存的版本'}});}
      await completion;if(changed)this.notify();
    }catch(e){try{tx.abort();}catch{}await completion.catch(()=>{});throw e;}
  }
  async versions():Promise<(SavedVersion&{current:unknown;paper:string;context:string})[]>{
    await this.migrateConflicts();
    const db=await this.open(),tx=db.transaction([...TRANSFER_STORES]),completion=done(tx);
    const rows:Record<string,any[]>=Object.fromEntries(await Promise.all(TRANSFER_STORES.map(async n=>[n,await request(tx.objectStore(n).getAll())])));await completion;
    return rows.meta!.filter(r=>r.key.startsWith('transfer-version:')).flatMap(r=>{
      const v=r.value as SavedVersion;if(!v||typeof v.key!=='string'||typeof v.savedAt!=='string'||!TRANSFER_STORES.includes(v.store as any)||!Array.isArray(v.path)||v.path.some(p=>typeof p!=='string'||['__proto__','constructor','prototype'].includes(p))||(v.store==='meta'&&(!portableMeta({key:v.key,value:null})||v.key.startsWith('transfer-version:'))))return [];
      const record=rows[v.store]?.find(x=>String(v.store==='meta'||v.store==='libraryPreferences'?x.key:x.id)===v.key);
      const docId=record?.anchor?.documentId??record?.document?.documentId??record?.documentId??(v.key.startsWith('ai-v1:')?v.key.split(':')[1]:v.key.startsWith('notes:v1:')?v.key.split(':')[2]:undefined);
      const doc=rows.documents!.find(x=>x.id===docId);
      const sessionIndex=v.path.indexOf('sessions'),sessionId=sessionIndex>=0?v.path[sessionIndex+1]?.slice(1):undefined;
      const session=record?.value?.sessions?.find((x:any)=>x.id===sessionId);
      return [{...v,current:contentAt(record,v.path),paper:doc?.title??record?.title??record?.name??'资料库',context:session?.title??(v.key.startsWith('notes:v1:')?'论文笔记':v.store==='annotations'?'批注':v.key.startsWith('ai-v1:')?'AI 对话与概览':v.store==='libraryFolders'?'文件夹':'文献信息')}];
    }).sort((a,b)=>b.savedAt.localeCompare(a.savedAt));
  }
  /** Only replace the selected content, never the containing conversation or paper. */
  async useVersion(id:string,expected:unknown):Promise<'applied'|'changed'>{
    const db=await this.open(),tx=db.transaction([...TRANSFER_STORES],'readwrite',{durability:'strict'}),completion=done(tx);void completion.catch(()=>{});
    try{
      const meta=await request(tx.objectStore('meta').getAll()),v=meta.find(r=>r.key===id)?.value as SavedVersion|undefined;
      if(!v||!TRANSFER_STORES.includes(v.store as any)||(v.store==='meta'&&!portableMeta({key:v.key,value:null})))throw new Error('此版本不可恢复');
      const record=await request(tx.objectStore(v.store).get(v.key));
      const current=contentAt(record,v.path);
      if(!sameContent(current,expected)){await completion;return 'changed';}
      this.keepVersions(tx,v.store,v.key,[{entity:v.key,path:v.path,value:current}],meta);
      const next=replaceContent(record,v.path,v.value);
      // Removed records remain in history; using a version does not hard-delete data.
      if(next===undefined)throw new Error('已另存移除前的版本');
      tx.objectStore(v.store).put(durable(v.store,next));
      await completion;this.notify();return 'applied';
    }catch(e){try{tx.abort();}catch{}await completion.catch(()=>{});throw e;}
  }
  private notify(){for(const name of ['paperpane-notes','paperpane-documents','paperpane-annotations','paperpane-ai','paperpane-model-settings','paperpane-preferences','paperpane-transfer']){const c=new BroadcastChannel(name);c.postMessage({type:'restored'});c.close();}}
}
