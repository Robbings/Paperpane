import { useEffect, useRef, useState } from 'react';
import { Button, Checkbox, Dialog, ProgressBar, Tooltip } from '@/ui/components';
import { SettingRow } from '../SettingRow';
import { useSync } from '@/runtime/use-sync';
import { ConnectionStore } from '@/sync/settings';
import { WebDavClient } from '@/sync/webdav-client';
import { discoverZotero, zoteroArchive } from '@/zotero/webdav-discovery';
import { ZoteroClient } from '@/zotero/client';
import { ZoteroMappings } from '@/data/zotero-mappings';
import { importZotero } from '@/zotero/import';
import { importPdfBlob } from '@/zotero/pdf-import';
export function ZoteroDiscovery(){
  const {connections}=useSync(),[keys,setKeys]=useState<string[]>([]),[selected,setSelected]=useState<Set<string>>(new Set()),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const operation=useRef<AbortController|undefined>(undefined);
  useEffect(()=>()=>operation.current?.abort(),[]);
  useEffect(()=>{setKeys([]);setSelected(new Set());if(!connections.dav)return;const db=new ConnectionStore(),abort=new AbortController();void(async()=>{try{const connection=await db.dav();if(!connection)return;const found=await discoverZotero(new WebDavClient(connection),abort.signal);const ignored=await db.raw<string[]>('transfer-zotero-ignored:'+connection.url);if(!abort.signal.aborted)setKeys(found.filter(k=>!ignored?.includes(k)));}catch{/* Detection is advisory; connection and explicit imports report their own errors. */}finally{await db.close();}})();return()=>abort.abort();},[connections.dav?.url]);
  const ignore=async()=>{const db=new ConnectionStore();try{await db.write('transfer-zotero-ignored:'+connections.dav?.url,keys);setKeys([]);}finally{await db.close();}};
  const run=async()=>{setBusy(true);setMessage('');const settings=new ConnectionStore(),db=new ZoteroMappings();const abort=new AbortController();operation.current=abort;const signal=abort.signal;let count=0;const errors:string[]=[];
    try{const connection=await settings.dav();if(!connection)throw new Error('请先连接 WebDAV');const dav=new WebDavClient(connection),key=await settings.zotero(),client=key&&connections.zotero?new ZoteroClient(key,connections.zotero.userId):undefined;
      for(const attachmentKey of selected){signal.throwIfAborted();try{if(client){const attachment=await client.item(attachmentKey,signal),paper=attachment.data.parentItem?await client.item(attachment.data.parentItem,signal):attachment;await importZotero(client,[paper],null,signal,result=>{if(result.ok)count++;else errors.push(`${attachmentKey}：${result.message}`);},undefined,new Set([attachmentKey]));}
        else{const blob=await zoteroArchive(dav,attachmentKey,undefined,signal);await importPdfBlob(db,blob,`${attachmentKey}.pdf`,null,signal);count++;}}
        catch(e){errors.push(`${attachmentKey}：${e instanceof Error?e.message:'导入失败'}`);}
      }setMessage(`已导入 ${count} 项${errors.length?'；'+errors.join('；'):''}`);
    }catch(e){setMessage(e instanceof Error?e.message:'导入失败');}finally{await settings.close();await db.close();operation.current=undefined;setBusy(false);}
  };
  if(!keys.length)return null;
  return <><SettingRow label={`发现 Zotero 附件 · ${keys.length}`}><Tooltip label="WebDAV 仅包含附件；连接 Zotero API 后可关联书目与批注"><Button onClick={()=>setOpen(true)}>查看</Button></Tooltip><Button variant="quiet" onClick={()=>void ignore()}>忽略</Button></SettingRow><Dialog open={open} onClose={()=>{if(!busy)setOpen(false);}} title="Zotero 附件" description={connections.zotero?'按附件标识关联 Zotero 内容':'尚未连接 Zotero，将仅导入 PDF'} footer={<><Button onClick={()=>{operation.current?.abort();if(!busy)setOpen(false);}}>{busy?'取消':'关闭'}</Button><Button disabled={busy||!selected.size} onClick={()=>void run()}>导入</Button></>}>
    {keys.map(key=><Checkbox key={key} label={key} checked={selected.has(key)} disabled={busy} onChange={on=>setSelected(old=>{const value=new Set(old);on?value.add(key):value.delete(key);return value;})}/>)}{busy&&<ProgressBar label="正在导入"/>}{message&&<p role="status">{message}</p>}
  </Dialog></>;
}
