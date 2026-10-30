import { PaperDatabase } from '@/data/database';
/** Recomputable page boxes use cache; paid transcription results use durable meta. */
export class ElementStore extends PaperDatabase {
  async read<T>(key:string,derived=false):Promise<T|undefined>{const db=await this.open();return new Promise((ok,no)=>{const r=db.transaction(derived?'cache':'meta','readonly').objectStore(derived?'cache':'meta').get(key);r.onsuccess=()=>ok(r.result?.value);r.onerror=()=>no(r.error);});}
  async legacyCopy<T>(prefix:string):Promise<T|undefined>{const db=await this.open();return new Promise((ok,no)=>{const r=db.transaction('meta','readonly').objectStore('meta').getAll(IDBKeyRange.bound(prefix,prefix+'\uffff'));r.onsuccess=()=>ok(r.result.find(row=>row.value?.value!==undefined)?.value);r.onerror=()=>no(r.error);});}
  async write<T>(key:string,value:T,derived=false){const db=await this.open();return new Promise<void>((ok,no)=>{const tx=db.transaction(derived?'cache':'meta','readwrite',{durability:'strict'});tx.objectStore(derived?'cache':'meta').put({key,value:structuredClone(value)});tx.oncomplete=()=>ok();tx.onabort=()=>no(tx.error??new Error('识别结果未能保存'));});}
}
