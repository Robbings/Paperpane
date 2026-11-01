import { LibraryDatabase } from './library-database';
import type { LibraryItem } from '@/contracts/library';
import type { ZoteroData } from '@/zotero/types';
export interface ZoteroLink {itemKey:string;version?:number;attachmentKey?:string;attachmentVersion?:number;fileHash?:string;uploaded?:boolean;collections:string[];annotationKeys?:Record<string,{key:string;version?:number;color?:string;localColor?:string}>;importedShortNote?:string;noteKey?:string;noteVersion?:number;original?:ZoteroData}
const request=<T>(r:IDBRequest<T>)=>new Promise<T>((ok,no)=>{r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});
export class ZoteroMappings extends LibraryDatabase{
  async link(userId:string,itemId:string):Promise<ZoteroLink|undefined>{const db=await this.open();return (await request(db.transaction('meta').objectStore('meta').get(`zotero-map:${userId}:${itemId}`)))?.value;}
  async saveLink(userId:string,itemId:string,value:ZoteroLink){await this.saveRecord(`zotero-map:${userId}:${itemId}`,value);}
  async saveRecord(key:string,value:unknown){const db=await this.open(),tx=db.transaction('meta','readwrite',{durability:'strict'});tx.objectStore('meta').put({key,value});await new Promise<void>((ok,no)=>{tx.oncomplete=()=>ok();tx.onabort=()=>no(tx.error);});}
  async tagLabels(ids:readonly string[]){const db=await this.open();const values=await request(db.transaction('libraryTags').objectStore('libraryTags').getAll());return values.filter(v=>ids.includes(v.id)&&!v.deletedAt).map(v=>v.label as string);}
  async rawItem(id:string):Promise<LibraryItem|undefined>{const db=await this.open();return request(db.transaction('libraryItems').objectStore('libraryItems').get(id));}
  async imported(key:string):Promise<LibraryItem|undefined>{const db=await this.open();return request(db.transaction('libraryItems').objectStore('libraryItems').index('byBibliographyKey').get(key));}
}
