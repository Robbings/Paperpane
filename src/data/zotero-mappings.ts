import { LibraryDatabase } from './library-database';
import type { LibraryItem } from '@/contracts/library';
import { collectionPlan, type ImportDestination } from '@/zotero/catalog';
import { itemFolders } from './library-records';
import type { ZoteroData } from '@/zotero/types';
export interface ZoteroLink {itemKey:string;version?:number;attachmentKey?:string;attachmentVersion?:number;fileHash?:string;uploaded?:boolean;collections:string[];annotationKeys?:Record<string,{key:string;version?:number;color?:string;localColor?:string}>;importedShortNote?:string;noteKey?:string;noteVersion?:number;original?:ZoteroData}
const request=<T>(r:IDBRequest<T>)=>new Promise<T>((ok,no)=>{r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});
export class ZoteroMappings extends LibraryDatabase{
  async folders(){const db=await this.open();return (await request(db.transaction('libraryFolders').objectStore('libraryFolders').getAll())).filter(f=>!f.deletedAt) as import('@/contracts/library').LibraryFolder[];}
  /** Create the source hierarchy once, then assign every collection in one transaction. */
  async fileImported(itemId:string,userId:string,collectionKeys:readonly string[],destination:ImportDestination){
    if(destination.kind==='folder'){await this.move([itemId],destination.folderId);return;}
    const plan=collectionPlan(userId,destination.collections,collectionKeys);
    const db=await this.open(),tx=db.transaction(['libraryFolders','libraryItems'],'readwrite',{durability:'strict'});
    const completion=new Promise<void>((ok,no)=>{tx.oncomplete=()=>ok();tx.onabort=()=>no(tx.error??new Error('目录保存失败'));});void completion.catch(()=>{});
    try{
      const item=await request(tx.objectStore('libraryItems').get(itemId)) as LibraryItem|undefined;if(!item)throw new Error('导入的论文已不存在');
      const now=new Date().toISOString();
      for(const folder of plan.folders){
        const previous=await request(tx.objectStore('libraryFolders').get(folder.id));
        if(!previous||previous.deletedAt)tx.objectStore('libraryFolders').put({...folder,createdAt:previous?.createdAt??now,updatedAt:now,revision:crypto.randomUUID()});
      }
      const folders=[...new Set([...plan.memberships,...itemFolders(item)])];
      tx.objectStore('libraryItems').put({...item,folderId:folders[0]??null,folderIds:folders.slice(1),revision:crypto.randomUUID(),updatedAt:now});
      await completion;
    }catch(e){try{tx.abort();}catch{}await completion.catch(()=>{});throw e;}
  }
  async link(userId:string,itemId:string):Promise<ZoteroLink|undefined>{const db=await this.open();return (await request(db.transaction('meta').objectStore('meta').get(`zotero-map:${userId}:${itemId}`)))?.value;}
  async saveLink(userId:string,itemId:string,value:ZoteroLink){await this.saveRecord(`zotero-map:${userId}:${itemId}`,value);}
  async saveRecord(key:string,value:unknown){const db=await this.open(),tx=db.transaction('meta','readwrite',{durability:'strict'});tx.objectStore('meta').put({key,value});await new Promise<void>((ok,no)=>{tx.oncomplete=()=>ok();tx.onabort=()=>no(tx.error);});}
  async tagLabels(ids:readonly string[]){const db=await this.open();const values=await request(db.transaction('libraryTags').objectStore('libraryTags').getAll());return values.filter(v=>ids.includes(v.id)&&!v.deletedAt).map(v=>v.label as string);}
  async rawItem(id:string):Promise<LibraryItem|undefined>{const db=await this.open();return request(db.transaction('libraryItems').objectStore('libraryItems').get(id));}
  async imported(key:string):Promise<LibraryItem|undefined>{const db=await this.open();return request(db.transaction('libraryItems').objectStore('libraryItems').index('byBibliographyKey').get(key));}
}
