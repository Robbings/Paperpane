import { useEffect, useRef, useState } from 'react';
import { Button, Checkbox, Dialog, ProgressBar, TextField, Select } from '@/ui/components';
import { SettingRow } from '../SettingRow';
import { useSync } from '@/runtime/use-sync';
import { ConnectionStore } from '@/sync/settings';
import { WebDavClient } from '@/sync/webdav-client';
import { discoverZotero, zoteroArchive } from '@/zotero/webdav-discovery';
import { discoveryCatalog, type DiscoveredPaper } from '@/zotero/discovery-catalog';
import { ZoteroClient } from '@/zotero/client';
import { ZoteroMappings } from '@/data/zotero-mappings';
import { importZotero } from '@/zotero/import';
import { importPdfBlob } from '@/zotero/pdf-import';
import { ZoteroDestination } from '@/ui/library/ZoteroDestination';
import type { ZoteroCollection } from '@/zotero/types';
import type { FolderOption, ImportDestination } from '@/zotero/catalog';

export function ZoteroDiscovery(){
  const {connections}=useSync();
  const [keys,setKeys]=useState<string[]>([]),[selected,setSelected]=useState<Set<string>>(new Set()),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [rows,setRows]=useState<DiscoveredPaper[]>([]),[collections,setCollections]=useState<ZoteroCollection[]>([]),[folders,setFolders]=useState<FolderOption[]>([]);
  const [loading,setLoading]=useState(false),[reload,setReload]=useState(0),[text,setText]=useState(''),[category,setCategory]=useState('all');
  const [mode,setMode]=useState<'collections'|'folder'>('folder'),[folder,setFolder]=useState('root');
  const [password,setPassword]=useState(''),[prompt,setPrompt]=useState<{incorrect:boolean;resolve:(value:string|null)=>void}>();
  const operation=useRef<AbortController|undefined>(undefined),promptRef=useRef(prompt);promptRef.current=prompt;
  useEffect(()=>()=>{operation.current?.abort();promptRef.current?.resolve(null);},[]);
  useEffect(()=>{
    setKeys([]);setSelected(new Set());operation.current?.abort();if(!connections.dav)return;
    const db=new ConnectionStore(),abort=new AbortController();
    void(async()=>{try{const connection=await db.dav();if(!connection)return;const found=await discoverZotero(new WebDavClient(connection),abort.signal);const ignored=await db.raw<string[]>('transfer-zotero-ignored:'+connection.url);if(!abort.signal.aborted)setKeys(found.filter(k=>!ignored?.includes(k)));}catch{/* Explicit reading reports its own errors. */}finally{await db.close();}})();
    return()=>abort.abort();
  },[connections.dav?.url,connections.dav?.username]);
  useEffect(()=>{
    if(!open||!keys.length)return;
    const abort=new AbortController(),settings=new ConnectionStore(),db=new ZoteroMappings();setLoading(true);setMessage('');setCollections([]);setSelected(new Set());setCategory('all');
    setRows(keys.map((key,i)=>({key,title:`附件 ${i+1}`,paths:[],status:'loading'})));
    void(async()=>{try{
      const connection=await settings.dav();if(!connection)throw new Error('请先连接 WebDAV');
      const key=await settings.zotero(),client=key&&connections.zotero?new ZoteroClient(key,connections.zotero.userId):undefined;
      const localFolders=await db.folders();if(abort.signal.aborted)return;setFolders(localFolders);setMode(client?'collections':'folder');
      await discoveryCatalog(keys,new WebDavClient(connection),client,abort.signal,row=>{if(!abort.signal.aborted)setRows(old=>old.map(r=>r.key===row.key?row:r));},value=>{if(!abort.signal.aborted)setCollections(value);},value=>{if(!abort.signal.aborted)setMessage(value);});
    }catch(e){if(!abort.signal.aborted)setMessage(e instanceof Error?e.message:'读取失败');}
    finally{await settings.close();await db.close();if(!abort.signal.aborted)setLoading(false);}})();
    return()=>abort.abort();
  },[open,keys,reload,connections.zotero?.userId,connections.zotero?.hasKey]);
  const ignore=async()=>{const db=new ConnectionStore();try{await db.write('transfer-zotero-ignored:'+connections.dav?.url,keys);setKeys([]);}finally{await db.close();}};
  const selectedRows=rows.filter(r=>selected.has(r.key)&&r.status==='ready');
  const canPreserve=!!connections.zotero&&selectedRows.every(row=>!!row.paper);
  const run=async()=>{
    if(operation.current||!selectedRows.length)return;
    setBusy(true);setMessage('');const settings=new ConnectionStore(),db=new ZoteroMappings(),abort=new AbortController();operation.current=abort;const signal=abort.signal;
    let count=0;const errors:string[]=[],succeeded=new Set<string>();
    const askPassword=(incorrect:boolean)=>new Promise<string|null>(resolve=>{setPassword('');setPrompt({incorrect,resolve});});
    try{
      const connection=await settings.dav();if(!connection)throw new Error('请先连接 WebDAV');const dav=new WebDavClient(connection),key=await settings.zotero();
      const client=key&&connections.zotero?new ZoteroClient(key,connections.zotero.userId):undefined;
      if(mode==='collections'&&(!client||!canPreserve))throw new Error('部分附件没有分类信息，请选择导入目录');
      const destination:ImportDestination=mode==='collections'?{kind:'collections',collections}:{kind:'folder',folderId:folder==='root'?null:folder};
      const grouped=new Map<string,DiscoveredPaper[]>();
      for(const row of selectedRows){const id=row.paper?.key??row.key;grouped.set(id,[...(grouped.get(id)??[]),row]);}
      for(const group of grouped.values()){
        signal.throwIfAborted();const first=group[0]!;
        try{
          if(client&&first.paper){
            await importZotero(client,[first.paper],destination.kind==='folder'?destination.folderId:null,signal,result=>{if(result.ok){count+=group.length;for(const row of group)succeeded.add(row.key);}else errors.push(`${first.title}：${result.message}`);},askPassword,new Set(group.map(r=>r.key)),destination);
          }else{
            const blob=await zoteroArchive(dav,first.key,first.filename,signal);
            const doc=await importPdfBlob(db,blob,first.filename??`${first.title}.pdf`,folder==='root'?null:folder,signal,askPassword);
            const item=await db.getItemForDocument(doc.id);if(item)await db.move([item.id],folder==='root'?null:folder);
            count++;succeeded.add(first.key);
          }
        }catch(e){signal.throwIfAborted();errors.push(`${first.title}：${e instanceof Error?e.message:'导入失败'}`);}
      }
    }catch(e){errors.push(signal.aborted?'导入已取消':e instanceof Error?e.message:'导入失败');}
    finally{
      setSelected(old=>new Set([...old].filter(key=>!succeeded.has(key))));setMessage(`已导入 ${count} 个附件${errors.length?'；'+errors.join('；'):''}`);
      await settings.close();await db.close();operation.current=undefined;setBusy(false);
      const channel=new BroadcastChannel('paperpane-documents');channel.postMessage('imported');channel.close();
    }
  };
  if(!keys.length)return null;
  const groupName=(row:DiscoveredPaper)=>row.paths[0]??(row.paper?'未分类':'未关联分类');
  const categories=[...new Set(rows.filter(r=>r.status==='ready').flatMap(r=>r.paths.length?r.paths:[groupName(r)]))].sort((a,b)=>a.localeCompare(b,'zh-CN'));
  const visible=rows.filter(row=>(category==='all'||row.paths.includes(category)||groupName(row)===category)&&`${row.title} ${row.filename??''} ${row.paths.join(' ')}`.toLocaleLowerCase().includes(text.toLocaleLowerCase()));
  const groups=[...new Set(visible.map(groupName))].sort((a,b)=>a.localeCompare(b,'zh-CN'));
  return <><SettingRow label={`发现 Zotero 附件 · ${keys.length}`}><Button onClick={()=>setOpen(true)}>查看</Button><Button variant="quiet" onClick={()=>void ignore()}>忽略</Button></SettingRow>
    <Dialog size="lg" open={open} onClose={()=>{if(!busy)setOpen(false);}} title="从 WebDAV 导入 Zotero 论文" description="按论文名称和分类选择附件" footer={<>
      <Button onClick={()=>{operation.current?.abort();promptRef.current?.resolve(null);if(!busy)setOpen(false);}}>{busy?'取消导入':'关闭'}</Button>
      <Button variant="primary" disabled={busy||loading||!selectedRows.length||(mode==='collections'&&!canPreserve)} onClick={()=>void run()}>导入 · {selectedRows.length}</Button>
    </>}>
      <ZoteroDestination mode={mode} onMode={setMode} folder={folder} onFolder={setFolder} folders={folders} canPreserve={canPreserve} disabled={busy}/>
      <div className="pp-zotero-selection"><TextField label="搜索附件" value={text} onChange={setText} placeholder="论文名或文件名" disabled={busy}/><Select label="来源分类" value={category} onChange={setCategory} disabled={busy} options={[{value:'all',label:'全部分类'},...categories.map(value=>({value,label:value}))]}/></div>
      <div className="pp-zotero-selection"><Button size="sm" disabled={busy||loading||!visible.some(r=>r.status==='ready')} onClick={()=>setSelected(new Set(visible.filter(r=>r.status==='ready').map(r=>r.key)))}>全选当前结果</Button><Button size="sm" variant="quiet" disabled={busy||!selected.size} onClick={()=>setSelected(new Set())}>取消全选</Button><span>已选 {selectedRows.length} 个附件</span><Button size="sm" disabled={busy||loading} onClick={()=>setReload(v=>v+1)}>重新读取</Button></div>
      {loading&&<ProgressBar label={`正在读取论文信息 · ${rows.filter(r=>r.status!=='loading').length} / ${rows.length}`}/>}
      <div className="pp-zotero-discovery-list">{groups.map(group=><section key={group}><h4>{group}</h4>{visible.filter(r=>groupName(r)===group).sort((a,b)=>a.title.localeCompare(b.title,'zh-CN')).map(row=><div className="pp-zotero-discovery-item" key={row.key}>
        <Checkbox label={row.title} checked={selected.has(row.key)} disabled={busy||row.status!=='ready'} onChange={on=>setSelected(old=>{const value=new Set(old);on?value.add(row.key):value.delete(row.key);return value;})}/>
        <small>{[row.filename,row.paths.join('；'),row.status==='loading'?'正在读取名称':row.detail].filter(Boolean).join(' · ')}</small>
      </div>)}</section>)}</div>
      {busy&&<ProgressBar label="正在导入"/>}{message&&<p role="status">{message}</p>}
    </Dialog>
    <Dialog open={!!prompt} onClose={()=>{prompt?.resolve(null);setPrompt(undefined);}} title="PDF 密码" description={prompt?.incorrect?'密码不正确，请重试':undefined} footer={<Button onClick={()=>{prompt?.resolve(password);setPrompt(undefined);}}>打开</Button>}><TextField label="密码" type="password" value={password} onChange={setPassword}/></Dialog>
  </>;
}
