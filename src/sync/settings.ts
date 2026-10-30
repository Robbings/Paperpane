import { PaperDatabase } from '@/data/database';
import type { DavConnection } from './webdav-client';
const request=<T>(r:IDBRequest<T>)=>new Promise<T>((ok,no)=>{r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});
export interface SyncState {phase:'idle'|'running'|'failed'|'conflicts'|'success';message?:string;lastSuccess?:string;conditional?:boolean}
export interface TransferConnections {dav?:{url:string;username:string;hasPassword:boolean;automatic:boolean;conditional:boolean};zotero?:{userId:string;hasKey:boolean;writable:boolean}}
/** Credentials never leave the request owner via a UI snapshot or backup. */
export class ConnectionStore extends PaperDatabase {
  async raw<T>(key:string):Promise<T|undefined>{const db=await this.open();return (await request(db.transaction('meta').objectStore('meta').get(key)))?.value;}
  async write(key:string,value:unknown){const db=await this.open(),tx=db.transaction('meta','readwrite',{durability:'strict'});tx.objectStore('meta').put({key,value});await new Promise<void>((ok,no)=>{tx.oncomplete=()=>ok();tx.onabort=()=>no(tx.error);});const channel=new BroadcastChannel('paperpane-transfer');channel.postMessage({key});channel.close();}
  async view():Promise<TransferConnections>{return await this.raw<TransferConnections>('transfer-connections')??{};}
  async dav():Promise<DavConnection|undefined>{return this.raw<DavConnection>('transfer-secret-dav');}
  async zotero():Promise<string|undefined>{return this.raw<string>('transfer-secret-zotero');}
  private async writeMany(entries:Record<string,unknown>){const db=await this.open(),tx=db.transaction('meta','readwrite',{durability:'strict'});for(const [key,value] of Object.entries(entries))tx.objectStore('meta').put({key,value});await new Promise<void>((ok,no)=>{tx.oncomplete=()=>ok();tx.onabort=()=>no(tx.error);});const c=new BroadcastChannel('paperpane-transfer');for(const key of Object.keys(entries))c.postMessage({key});c.close();}
  async saveDav(connection:DavConnection,conditional:boolean,automatic=false){const view=await this.view();const same=view.dav?.url===connection.url&&view.dav?.username===connection.username;const state=await this.status();await this.writeMany({'transfer-secret-dav':connection,'transfer-connections':{...view,dav:{url:connection.url,username:connection.username,hasPassword:!!connection.password,automatic:automatic&&conditional,conditional}},...(!same?{'transfer-sync-state':{phase:'idle'}}:{'transfer-sync-state':state})});}
  async saveZotero(key:string,userId:string,writable:boolean){const view=await this.view();await this.writeMany({'transfer-secret-zotero':key,'transfer-connections':{...view,zotero:{userId,hasKey:!!key,writable}}});}
  async disconnect(service:'dav'|'zotero'){
    const view=await this.view();delete view[service];
    await this.writeMany({'transfer-connections':view,[service==='dav'?'transfer-secret-dav':'transfer-secret-zotero']:undefined,...(service==='dav'?{'transfer-sync-state':{phase:'idle'}}:{})});
  }
  async status():Promise<SyncState>{return await this.raw<SyncState>('transfer-sync-state')??{phase:'idle'};}
}
