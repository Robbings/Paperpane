import type { TransferSnapshot, TransferRecord } from '@/contracts/transfer';
import { recordPayload } from '@/transfer/records';
import type { EntityMap } from './merge';
export interface SyncManifest {format:'paperpane-sync';version:1|2;generation:string;createdAt:string;records:EntityMap;assets:Omit<TransferSnapshot['assets'][number],'blob'>[]}
/** Canonical document identities converge independently imported copies of the same PDF. */
export function canonical(snapshot:TransferSnapshot):TransferSnapshot{
  const ids=new Map<string,string>();
  for(const db of snapshot.databases){
    for(const row of db.stores.documents??[]){const hash=(row.file as any)?.sha256;if(hash)ids.set(String(row.id),'d-'+hash);}
    for(const row of db.stores.libraryItems??[]){const doc=ids.get(String(row.documentId));if(doc)ids.set(String(row.id),'i-'+doc.slice(2));}
    for(const row of db.stores.libraryTags??[])ids.set(String(row.id),'t-'+encodeURIComponent(String(row.normalized)));
  }
  function map(v:unknown):any{
    if(typeof v==='string')return ids.get(v)??v.split(':').map(p=>ids.get(p)??p).join(':');
    if(Array.isArray(v))return v.map(map);
    if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,val])=>[k,map(val)]));return v;
  }
  return {...snapshot,databases:snapshot.databases.map(db=>({...db,stores:map(db.stores)}))};
}
export function flatten(snapshot:TransferSnapshot):EntityMap{
  const records:EntityMap={};for(const db of snapshot.databases)for(const [store,rows] of Object.entries(db.stores))for(const row of rows){
    const key=String(store==='meta'||store==='libraryPreferences'?row.key:row.id);
    // Interface/model configuration stays device-local during automatic sync. Backups retain its redacted copy.
    if(store==='meta'&&['modelSettings-v1','readerPreferences'].includes(key))continue;
    records[[db.name,store,key].map(encodeURIComponent).join('/')]=recordPayload(row);
  }return records;
}
export function inflate(manifest:SyncManifest,template:TransferSnapshot):TransferSnapshot{
  const stores:Record<string,TransferRecord[]>={};
  for(const [id,row] of Object.entries(manifest.records)){
    const [database,store,key]=id.split('/').map(decodeURIComponent);if(database!==template.databases[0]?.name||!store||!key)throw new Error('远程记录标识无效');
    (stores[store]??=[]).push(row);
  }
  return {...template,version:manifest.version,id:manifest.generation,createdAt:manifest.createdAt,databases:[{...template.databases[0]!,stores}],assets:[]};
}

/** Full backups retain local PDFs; WebDAV only transports explicitly eligible files. */
export function syncSnapshot(snapshot:TransferSnapshot):TransferSnapshot{
  const wanted=new Set<string>();
  for(const db of snapshot.databases)for(const doc of db.stores.documents??[]){
    if(doc.syncScope==='record-and-file')wanted.add(`${db.name}:${(doc.file as any)?.assetId}`);
  }
  return {...snapshot,complete:false,assets:snapshot.assets.filter(a=>a.id.startsWith('note-image:')||wanted.has(`${a.database}:${a.id}`))};
}
