import { WebDavClient, DavError } from '@/sync/webdav-client';
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
