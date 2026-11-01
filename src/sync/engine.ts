import { TransferStore } from '@/data/transfer-store';
import { ConnectionStore } from './settings';
import { WebDavClient, DavError } from './webdav-client';
import { canonical, flatten, inflate, syncSnapshot, type SyncManifest } from './manifest';
import { mergeEntities, stable } from './merge';
import { assetPath, assetMime, imageReferences } from '@/transfer/assets';
import { versionRows } from './versions';
import { recordPayload } from '@/transfer/records';
import { sha256 } from '@/transfer/backup';
import type { TransferAsset } from '@/contracts/transfer';
export async function responseBytes(response:Response,max:number,signal?:AbortSignal){
  if(Number(response.headers.get('Content-Length'))>max)throw new Error('远程文件超过容量限制');
  const reader=response.body?.getReader();if(!reader)return new Uint8Array();const chunks:Uint8Array[]=[];let size=0;
  try{while(true){signal?.throwIfAborted();const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max)throw new Error('远程文件超过容量限制');chunks.push(value);}}
  catch(e){await reader.cancel().catch(()=>{});throw e;}finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
function validate(m:SyncManifest){
  if(m.format!=='paperpane-sync'||![1,2,3].includes(m.version)||typeof m.generation!=='string'||!m.records||typeof m.records!=='object'||Array.isArray(m.records)||!Array.isArray(m.assets)||m.assets.length>50000)throw new Error('远程同步清单不兼容');
  for(const a of m.assets)if(!/^[a-f0-9]{64}$/.test(a.sha256)||typeof a.id!=='string'||a.database!=='paperpane'||!['application/pdf','image/png'].includes(assetMime(a))||(assetMime(a)==='image/png'&&a.id!=='note-image:'+a.sha256))throw new Error('远程附件清单无效');
  // Version 1 published local availability/index fields. They are derived again
  // on this device, and must not keep an upgraded client permanently pending.
  m.records=Object.fromEntries(Object.entries(m.records).map(([key,row])=>[key,recordPayload(row)]));
}
export async function synchronize(signal:AbortSignal,options:{store?:TransferStore;connections?:ConnectionStore;client?:WebDavClient}={}){
  const store=options.store??new TransferStore(),connections=options.connections??new ConnectionStore();
  const run=async(attempt=0):Promise<void>=>{
    const previous=await connections.status();
    try{
      await store.migrateConflicts();
      const config=await connections.view(),connection=await connections.dav();
      if(!connection||!config.dav?.conditional)throw new Error('这个 WebDAV 服务不支持同步');
      const client=options.client??new WebDavClient(connection);
      await connections.write('transfer-sync-state',{...previous,phase:'running',message:'正在同步…'});
      const local=canonical(syncSnapshot(await store.snapshot(true)));
      const baseline=await connections.raw<{url:string;manifest:SyncManifest}>('transfer-sync-baseline');
      const base=baseline?.url===client.base.href+'|'+connection.username?baseline.manifest:undefined;
      let remote:SyncManifest|undefined,etag:string|null=null;
      try{const result=await client.get('paperpane/manifest.json',signal);etag=result.etag;if(!etag||etag.startsWith('W/'))throw new Error('这个 WebDAV 服务不支持同步');remote=JSON.parse(new TextDecoder().decode(await responseBytes(result.response,64*1024*1024,signal)));validate(remote!);}
      catch(e){if(!(e instanceof DavError)||e.status!==404)throw e;}
      const merged=mergeEntities(base?.records??{},flatten(local),remote?.records??{});
      const assets=new Map<string,TransferAsset>();for(const a of local.assets)assets.set(a.database+':'+a.id,a);
      if(remote)for(const a of remote.assets){
        if(assets.has(a.database+':'+a.id))continue;
        const result=await client.get(`paperpane/${assetPath(a)}`,signal),bytes=await responseBytes(result.response,1024*1024*1024,signal);
        if(await sha256(bytes)!==a.sha256)throw new Error('远程附件文件校验失败');
        assets.set(a.database+':'+a.id,{...a,blob:new Blob([new Uint8Array(bytes)],{type:assetMime(a)})});
      }
      for(const row of versionRows(merged.versions,new Date().toISOString())){
        const id=['paperpane','meta',row.key].map(encodeURIComponent).join('/');
        merged.records[id]??=row;
      }
      // Never publish a dangling image reference, including images retained in note history.
      for(const hash of imageReferences(merged.records))if(![...assets.values()].some(a=>a.id==='note-image:'+hash))throw new Error('笔记里有图片缺失，没能同步');
      const manifest:SyncManifest={format:'paperpane-sync',version:3,generation:crypto.randomUUID(),createdAt:new Date().toISOString(),records:merged.records,assets:[...assets.values()].map(({blob,...a})=>a)};
      const incoming=inflate(manifest,local);incoming.assets=[...assets.values()];
      await store.restore(incoming,local);
      await client.mkdir('paperpane/assets',signal);
      const existing=new Set(remote?.assets.map(assetPath)??[]);
      for(const a of assets.values()){
        signal.throwIfAborted();if(existing.has(assetPath(a)))continue;
        try{await client.put(`paperpane/${assetPath(a)}`,a.blob,null,signal);}catch(e){if(!(e instanceof DavError)||e.status!==412)throw e;}
        const verify=await client.get(`paperpane/${assetPath(a)}`,signal);if(await sha256(await responseBytes(verify.response,1024*1024*1024,signal))!==a.sha256)throw new Error('上传的附件校验失败');
      }
      // Publish last. Interrupted uploads leave unreferenced immutable objects, never a half-valid library.
      const latest=await connections.dav();if(!latest||latest.url!==connection.url||latest.username!==connection.username)throw new Error('同步设置已更改，已停止');
      await client.put('paperpane/manifest.json',JSON.stringify(manifest),etag,signal);
      await store.updateTransferState((snapshot,meta)=>{
        const latest=meta.find(r=>r.key==='transfer-secret-dav')?.value as typeof connection|undefined;
        if(!latest||latest.url!==connection.url||latest.username!==connection.username)throw new Error('同步设置已更改，请重新同步');
        const pending=stable(flatten(canonical(snapshot)))!==stable(manifest.records);
        return {
          'transfer-sync-baseline':{url:client.base.href+'|'+connection.username,manifest},
          'transfer-sync-state':pending?{...previous,phase:'idle',message:'还有改动待同步'}:{phase:'success',lastSuccess:new Date().toISOString(),message:'已同步'},
        };
      });
    }catch(error){if(error instanceof DavError&&error.status===412&&attempt<2){signal.throwIfAborted();return run(attempt+1);}await connections.write('transfer-sync-state',{...previous,phase:'failed',message:error instanceof Error?error.message:'同步失败'});throw error;}
  };
  try{if(globalThis.navigator?.locks)await navigator.locks.request('paperpane-sync',{signal},()=>run());else await run();}
  finally{if(!options.store)await store.close();if(!options.connections)await connections.close();}
}
