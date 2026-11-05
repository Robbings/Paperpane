import { zipSync } from 'fflate';
import { WebDavClient, DavError, type DavConnection } from '@/sync/webdav-client';
import { davPaths } from '@/sync/cloud-backup';
import { responseBytes } from '@/sync/engine';
import { extractZoteroPdf } from '@/transfer/worker-client';
export async function discoverZotero(client:WebDavClient,signal?:AbortSignal){
  const keys=new Set<string>();
  for(const directory of ['zotero','']){
    try{const paths=davPaths(await client.list(directory,signal),client.base);const props=new Set(paths.filter(p=>/^(?:zotero\/)?[A-Z0-9]{8}\.prop$/.test(p)).map(p=>p.split('/').at(-1)!.slice(0,-5)));for(const path of paths){const match=path.match(/^(?:zotero\/)?([A-Z0-9]{8})\.zip$/);if(match&&props.has(match[1]!))keys.add(match[1]!);}}
    catch(e){if(!(e instanceof DavError)||![404,403].includes(e.status))throw e;}
  }return [...keys].sort();
}
export async function zoteroArchive(client:WebDavClient,key:string,filename?:string,signal?:AbortSignal){
  if(!/^[A-Z0-9]{8}$/.test(key))throw new Error('Zotero 附件标识无效');
  const r=await client.get(`zotero/${key}.zip`,signal).catch(e=>{if(e instanceof DavError&&e.status===404)return client.get(`${key}.zip`,signal);throw e;});return extractZoteroPdf(await responseBytes(r.response,512*1024*1024,signal),filename,signal);
}

/** Request only ZIP directory bytes where the server supports byte ranges. */
export async function zoteroArchiveNames(client:WebDavClient,key:string,signal?:AbortSignal):Promise<string[]>{
  if(!/^[A-Z0-9]{8}$/.test(key))throw new Error('Zotero 附件标识无效');
  const {zipDirectory,zipPdfNames}=await import('./archive-names');
  let path=`zotero/${key}.zip`;
  const first=await client.get(path,signal,'bytes=-65557').catch(e=>{if(e instanceof DavError&&e.status===404){path=`${key}.zip`;return client.get(path,signal,'bytes=-65557');}throw e;});
  const partial=first.response.status===206;
  const range=first.response.headers.get('Content-Range')?.match(/^bytes (\d+)-(\d+)\/(\d+)$/);
  if(partial&&(!range||Number(range[3])>512*1024*1024||Number(range[2])+1!==Number(range[3])))throw new Error('附件目录响应无效');
  const bytes=await responseBytes(first.response,partial?65557:512*1024*1024,signal),offset=partial?Number(range![1]):0;
  if(partial&&bytes.length!==Number(range![2])-offset+1)throw new Error('附件目录响应不完整');
  const dir=zipDirectory(bytes,offset);
  if(dir.start>=offset)return zipPdfNames(bytes.subarray(dir.start-offset,dir.start-offset+dir.size),dir.count);
  const next=await client.get(path,signal,`bytes=${dir.start}-${dir.start+dir.size-1}`);
  if(next.response.status===206){
    const expected=`bytes ${dir.start}-${dir.start+dir.size-1}/${range![3]}`;
    if(next.response.headers.get('Content-Range')!==expected)throw new Error('附件目录响应无效');
    return zipPdfNames(await responseBytes(next.response,dir.size,signal),dir.count);
  }
  const full=await responseBytes(next.response,512*1024*1024,signal),current=zipDirectory(full);
  return zipPdfNames(full.subarray(current.start,current.start+current.size),current.count);
}

/** Zotero keeps files in `<its WebDAV URL>/zotero/`. Paperpane's address may be that URL, the folder itself or a subfolder of it. */
export async function zoteroFolder(connection:DavConnection,signal?:AbortSignal):Promise<WebDavClient>{
  const base=new WebDavClient(connection).base,segments=base.pathname.split('/').filter(Boolean),candidates:string[]=[];
  for(let n=segments.length;n>=0;n--){
    candidates.push('/'+[...segments.slice(0,n),'zotero'].join('/')+'/');
    if(n===segments.length&&segments.at(-1)?.toLowerCase()==='zotero')candidates.push(base.pathname);
  }
  for(const path of candidates){
    const folder=new WebDavClient({...connection,url:new URL(path,base.origin).href});
    try{if(await folder.exists('',signal))return folder;}
    catch(e){signal?.throwIfAborted();if(e instanceof DavError&&e.status===401)throw e;}
  }
  throw new Error('WebDAV 上没有找到 Zotero 的 zotero 文件夹，请确认 Zotero 用的是同一个 WebDAV，并在 Zotero 设置里完成「验证服务器」');
}

/** Write a file the way Zotero desktop does: drop the stale .prop, then the archive, then its mtime and MD5. */
export async function putZoteroFile(folder:WebDavClient,key:string,bytes:Uint8Array,filename:string,hash:string,mtime:number,signal?:AbortSignal){
  if(!/^[A-Z0-9]{8}$/.test(key))throw new Error('Zotero 附件标识无效');
  // Zotero renames a lone file to the attachment's filename, so non-ASCII names need no %ZB64 form.
  const entry=/^[\x20-\x7e]+$/.test(filename)&&!/[\\/:]/.test(filename)?filename:key+(filename.match(/\.[A-Za-z0-9]{1,8}$/)?.[0]??'');
  const archive=zipSync({[entry]:[bytes,{level:0,mtime:new Date(mtime)}]});
  await folder.remove(`${key}.prop`,signal);
  await folder.put(`${key}.zip`,new Blob([new Uint8Array(archive)],{type:'application/zip'}),undefined,signal);
  await folder.put(`${key}.prop`,new Blob([`<properties version="1"><mtime>${mtime}</mtime><hash>${hash}</hash></properties>`],{type:'text/xml'}),undefined,signal);
}
