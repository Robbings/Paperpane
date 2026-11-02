import { WebDavClient } from './webdav-client';
import { responseBytes } from './engine';
import { sha256 } from '@/transfer/backup';
/** Decode DAV hrefs without interpreting them as HTML or accepting foreign origins. */
export function davPaths(xml:string,base:URL):string[]{
  if(xml.length>4*1024*1024||/<!DOCTYPE|<!ENTITY/i.test(xml))throw new Error('WebDAV 目录响应无效');
  const values=[...xml.matchAll(/<(?:[\w.-]+:)?href\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?href\s*>/gi)];
  if(values.length>5000)throw new Error('这个目录文件太多，请换一个');
  return values.flatMap(m=>{try{
    const href=m[1]!.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'");
    const url=new URL(href,base);if(url.origin!==base.origin||!url.pathname.startsWith(base.pathname))return [];
    const path=url.pathname.slice(base.pathname.length).split('/').map(decodeURIComponent).join('/').replace(/\/$/,'');
    if(!path||path.split('/').some(p=>!p||p==='.'||p==='..'||p.includes('\\')))return [];return [path];
  }catch{return [];}});
}
export async function uploadCloudBackup(client:WebDavClient,blob:Blob,signal?:AbortSignal){
  await client.mkdir('paperpane',signal);await client.mkdir('paperpane/backups',signal);
  const path=`paperpane/backups/${new Date().toISOString().replace(/[:.]/g,'-')}-${crypto.randomUUID()}.zip`;
  await client.put(path,blob,null,signal);const read=await client.get(path,signal);
  const bytes=await responseBytes(read.response,1024*1024*1024,signal);
  if(await sha256(bytes)!==await sha256(new Uint8Array(await blob.arrayBuffer())))throw new Error('云备份上传校验失败');
  return path;
}
export async function cloudBackups(client:WebDavClient,signal?:AbortSignal){return davPaths(await client.list('paperpane/backups',signal),client.base).filter(p=>/^paperpane\/backups\/[^/]+\.zip$/.test(p)).sort().reverse();}
export async function downloadCloudBackup(client:WebDavClient,path:string,signal?:AbortSignal){if(!/^paperpane\/backups\/[^/]+\.zip$/.test(path))throw new Error('备份路径无效');const result=await client.get(path,signal);return new Blob([new Uint8Array(await responseBytes(result.response,1024*1024*1024,signal))],{type:'application/zip'});}
