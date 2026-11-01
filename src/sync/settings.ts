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
  /** Read/merge/write config and secrets in one IDB transaction across all windows. */
  private async changeConnections(change:(view:TransferConnections)=>Record<string,unknown>){
    const db=await this.open(),tx=db.transaction('meta','readwrite',{durability:'strict'});
    const completion=new Promise<void>((ok,no)=>{tx.oncomplete=()=>ok();tx.onabort=()=>no(tx.error??new Error('连接配置保存失败'));});void completion.catch(()=>{});
    try{
      const view:TransferConnections=(await request(tx.objectStore('meta').get('transfer-connections')))?.value??{};
      const entries=change(view);
      for(const [key,value] of Object.entries({...entries,'transfer-connections':view}))tx.objectStore('meta').put({key,value});
      await completion;
      const channel=new BroadcastChannel('paperpane-transfer');channel.postMessage({key:'transfer-connections'});channel.close();
    }catch(error){try{tx.abort();}catch{}await completion.catch(()=>{});throw error;}
  }
  async saveDav(connection:DavConnection,conditional:boolean,automatic=false){
    await this.changeConnections(view=>{
      const same=view.dav?.url===connection.url&&view.dav?.username===connection.username;
      view.dav={url:connection.url,username:connection.username,hasPassword:!!connection.password,automatic:automatic&&conditional,conditional};
      return {'transfer-secret-dav':connection,...(!same?{'transfer-sync-state':{phase:'idle'}}:{})};
    });
  }
  async saveZotero(key:string,userId:string,writable:boolean){
    await this.changeConnections(view=>{view.zotero={userId,hasKey:!!key,writable};return {'transfer-secret-zotero':key};});
  }
  async disconnect(service:'dav'|'zotero'){
    await this.changeConnections(view=>{delete view[service];return {[service==='dav'?'transfer-secret-dav':'transfer-secret-zotero']:undefined,...(service==='dav'?{'transfer-sync-state':{phase:'idle'}}:{})};});
  }
  async status():Promise<SyncState>{return await this.raw<SyncState>('transfer-sync-state')??{phase:'idle'};}
}
