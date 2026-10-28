import { PaperDatabase, type StoredDocument } from './database';
import type { ExtractedPaper, TranslationRun } from '@/contracts/translation';
import type { DocumentRef } from '@/contracts/document';
const request=<T>(r:IDBRequest<T>)=>new Promise<T>((ok,no)=>{r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});
/** Durable records in meta, not cache. No schema reset or competing version upgrade. */
export class TranslationStore extends PaperDatabase {
  private async transact<T>(write:boolean, action:(tx:IDBTransaction)=>Promise<T>):Promise<T>{
    const db=await this.open();const tx=db.transaction(write?['meta','documents','changes']:['meta'],'read'+(write?'write':'only') as IDBTransactionMode,{durability:'strict'});
    const done=new Promise<void>((ok,no)=>{tx.oncomplete=()=>ok();tx.onabort=()=>no(tx.error??new Error('存储操作失败'));});void done.catch(()=>{});
    try{const value=await action(tx);await done;return value;}catch(e){try{tx.abort();}catch{}await done.catch(()=>{});throw e;}
  }
  private key(ref:DocumentRef){return `translation:${ref.documentId}:${ref.fileVersion}`;}
  async extraction(ref:DocumentRef,version:string):Promise<ExtractedPaper|undefined>{return this.transact(false,async tx=>(await request(tx.objectStore('meta').get(`${this.key(ref)}:source:${version}`)))?.value);}
  async saveExtraction(paper:ExtractedPaper){await this.transact(true,async tx=>{tx.objectStore('meta').put({key:`${this.key(paper)}:source:${paper.version}`,value:paper});});}
  async latest(ref:DocumentRef, selectionKey?:string):Promise<TranslationRun|undefined>{return this.transact(false,async tx=>{
    const meta=tx.objectStore('meta'), prefix=this.key(ref);
    const pointer=selectionKey?`${prefix}:selection:${selectionKey}:latest`:`${prefix}:latest`;
    const key=(await request(meta.get(pointer)))?.value;
    const latest:TranslationRun|undefined=key?(await request(meta.get(key)))?.value:undefined;
    if(selectionKey || latest?.scope?.kind!=='selection')return latest;
    // Legacy selection tasks could replace the document pointer. Recover the newest
    // non-selection version, without deleting or modifying any historical records.
    const records=await request(meta.getAll(IDBKeyRange.bound(`${prefix}:run:`,`${prefix}:run:\uffff`)));
    return records.map(row=>row.value as TranslationRun).filter(run=>run.scope?.kind!=='selection').sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0];
  });}
  async saveRun(run:TranslationRun,expected?:string):Promise<void>{
    await this.transact(true,async tx=>{
      const meta=tx.objectStore('meta');const key=`${this.key(run)}:run:${run.id}`;
      const old=(await request(meta.get(key)))?.value as TranslationRun|undefined;
      if(old?.revision!==expected)throw new Error('译文已在其他窗口更新，请重新打开译文栏。');
      const docs=tx.objectStore('documents');const doc=await request(docs.get(run.documentId)) as StoredDocument|undefined;
      if(!doc||doc.deletedAt||doc.fileVersion!==run.fileVersion)throw new Error('原文件版本已变化，请重新打开论文。');
      meta.put({key,value:run});
      if(run.scope?.kind==='selection') {
        // Old callers without a stable selection key are retained as history only.
        if(run.selection?.key)meta.put({key:`${this.key(run)}:selection:${run.selection.key}:latest`,value:key});
      } else meta.put({key:`${this.key(run)}:latest`,value:key});
      const device=(await request(meta.get('deviceId')))?.value??crypto.randomUUID();meta.put({key:'deviceId',value:device});
      // Record-and-file promotion and change journal are atomic with the result.
      if(run.attempts.some(a=>a.raw.length)&&doc.syncScope!=='record-and-file'){
        const updated={...doc,syncScope:'record-and-file',updatedAt:run.updatedAt,revision:crypto.randomUUID()};docs.put(updated);
        tx.objectStore('changes').add({entity:'document',entityId:doc.id,revision:updated.revision,baseRevision:doc.revision,deviceId:device,operation:'upsert',at:run.updatedAt});
      }
      tx.objectStore('changes').add({entity:'translation',entityId:run.id,documentId:run.documentId,fileVersion:run.fileVersion,revision:run.revision,baseRevision:expected,deviceId:device,operation:'upsert',at:run.updatedAt});
    });
  }
}
