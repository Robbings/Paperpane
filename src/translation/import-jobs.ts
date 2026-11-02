import { PaperDatabase, importJobKey } from '@/data/database';
import type { DocumentRef } from '@/contracts/document';

export class ImportTranslationJobs extends PaperDatabase {
  async pending(): Promise<(DocumentRef & {retry?:boolean})[]> {
    const db = await this.open();
    const r = db
      .transaction('meta')
      .objectStore('meta')
      .getAll(IDBKeyRange.bound('auto-translate-import:', 'auto-translate-import:\uffff'));
    return new Promise((ok, no) => {
      r.onsuccess = () => ok(r.result.map((row) => row.value));
      r.onerror = () => no(r.error);
    });
  }
  async retry(ref: DocumentRef) {
    const db=await this.open(), tx=db.transaction('meta','readwrite');
    tx.objectStore('meta').put({key:importJobKey(ref),value:{documentId:ref.documentId,fileVersion:ref.fileVersion,retry:true}});
    return new Promise<void>((ok,no)=>{tx.oncomplete=()=>ok();tx.onabort=()=>no(tx.error);});
  }
  async remove(ref: DocumentRef) {
    const db = await this.open();
    const tx = db.transaction('meta', 'readwrite');
    tx.objectStore('meta').delete(importJobKey(ref));
    return new Promise<void>((ok, no) => {
      tx.oncomplete = () => ok();
      tx.onabort = () => no(tx.error);
    });
  }
}
