import { TransferStore } from '@/data/transfer-store';
import { ConnectionStore } from './settings';
import { WebDavClient, DavError } from './webdav-client';
import { canonical, flatten, inflate, type SyncManifest } from './manifest';
import { mergeEntities } from './merge';
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
  if(m.format!=='paperpane-sync'||m.version!==1||typeof m.generation!=='string'||!m.records||typeof m.records!=='object'||Array.isArray(m.records)||!Array.isArray(m.assets)||m.assets.length>50000)throw new Error('远程同步清单不兼容');
  for(const a of m.assets)if(!/^[a-f0-9]{64}$/.test(a.sha256)||typeof a.id!=='string'||a.database!=='paperpane')throw new Error('远程 PDF 清单无效');
}
export async function synchronize(signal:AbortSignal,options:{store?:TransferStore;connections?:ConnectionStore;client?:WebDavClient}={}){
  const store=options.store??new TransferStore(),connections=options.connections??new ConnectionStore();
  const previous=await connections.status();
  const run=async()=>{
    try{
      if((await store.conflicts()).length)throw new Error('请先处理已有同步或恢复冲突');
      const config=await connections.view(),connection=await connections.dav();
      if(!connection||!config.dav?.conditional)throw new Error('请先连接支持条件写入的 WebDAV');
      const client=options.client??new WebDavClient(connection);
      await connections.write('transfer-sync-state',{...previous,phase:'running',message:'正在同步…'});
      const local=canonical(await store.snapshot(true));
      const baseline=await connections.raw<{url:string;manifest:SyncManifest}>('transfer-sync-baseline');
      const base=baseline?.url===client.base.href+'|'+connection.username?baseline.manifest:undefined;
      let remote:SyncManifest|undefined,etag:string|null=null;
      try{const result=await client.get('paperpane/manifest.json',signal);etag=result.etag;if(!etag||etag.startsWith('W/'))throw new Error('服务器未提供可靠的同步版本标识');remote=JSON.parse(new TextDecoder().decode(await responseBytes(result.response,64*1024*1024,signal)));validate(remote!);}
      catch(e){if(!(e instanceof DavError)||e.status!==404)throw e;}
      const merged=mergeEntities(base?.records??{},flatten(local),remote?.records??{});
      const assets=new Map<string,TransferAsset>();for(const a of local.assets)assets.set(a.sha256,a);
      if(remote)for(const a of remote.assets){
        if(assets.has(a.sha256))continue;
        const result=await client.get(`paperpane/assets/${a.sha256}.pdf`,signal),bytes=await responseBytes(result.response,1024*1024*1024,signal);
        if(await sha256(bytes)!==a.sha256)throw new Error('远程 PDF 文件校验失败');
        assets.set(a.sha256,{...a,blob:new Blob([new Uint8Array(bytes)],{type:'application/pdf'})});
      }
      if(merged.conflicts.length&&remote){
        const prepared=inflate({...remote,records:merged.records},local);prepared.assets=[...assets.values()];await store.restore(prepared,local);
        const roots=new Set(merged.conflicts.map(p=>p.split('/').slice(0,3).join('/')));
        const conflicts={...remote,records:Object.fromEntries(Object.entries(remote.records).filter(([key])=>roots.has(key)))};
        const incoming=inflate(conflicts,local);incoming.complete=false;incoming.assets=[...assets.values()];
        await store.restore(incoming);
        await connections.write('transfer-sync-baseline',{url:client.base.href+'|'+connection.username,manifest:remote});
        await connections.write('transfer-sync-state',{...previous,phase:'conflicts',message:`${roots.size} 项内容需要选择保留版本`});return;
      }
      const manifest:SyncManifest={format:'paperpane-sync',version:1,generation:crypto.randomUUID(),createdAt:new Date().toISOString(),records:merged.records,assets:[...assets.values()].map(({blob,...a})=>a)};
      const incoming=inflate(manifest,local);incoming.assets=[...assets.values()];
      const applied=await store.restore(incoming,local);
      if(applied.conflicts){await connections.write('transfer-sync-state',{...previous,phase:'conflicts',message:'同步期间本机内容发生变化，请处理冲突后重试'});return;}
      await client.mkdir('paperpane/assets',signal);
      const existing=new Set(remote?.assets.map(a=>a.sha256)??[]);
      for(const a of assets.values()){
        signal.throwIfAborted();if(existing.has(a.sha256))continue;
        try{await client.put(`paperpane/assets/${a.sha256}.pdf`,a.blob,null,signal);}catch(e){if(!(e instanceof DavError)||e.status!==412)throw e;}
        const verify=await client.get(`paperpane/assets/${a.sha256}.pdf`,signal);if(await sha256(await responseBytes(verify.response,1024*1024*1024,signal))!==a.sha256)throw new Error('上传的 PDF 校验失败');
      }
      // Publish last. Interrupted uploads leave unreferenced immutable objects, never a half-valid library.
      const latest=await connections.dav();if(!latest||latest.url!==connection.url||latest.username!==connection.username)throw new Error('同步连接已更改，已停止发布');
      await client.put('paperpane/manifest.json',JSON.stringify(manifest),etag,signal);
      await connections.write('transfer-sync-baseline',{url:client.base.href+'|'+connection.username,manifest});
      await connections.write('transfer-sync-state',{phase:'success',lastSuccess:new Date().toISOString(),message:'已同步'});
    }catch(error){await connections.write('transfer-sync-state',{...previous,phase:'failed',message:error instanceof Error?error.message:'同步失败'});throw error;}
  };
  try{if(globalThis.navigator?.locks)await navigator.locks.request('paperpane-sync',{signal},run);else await run();}
  finally{if(!options.store)await store.close();if(!options.connections)await connections.close();}
}
