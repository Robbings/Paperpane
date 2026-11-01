import { useEffect, useRef, useState } from 'react';
import { Button, Checkbox, Dialog, Tree, TextField, Select, ProgressBar, Tooltip } from '@/ui/components';
import { ConnectionStore } from '@/sync/settings';
import { ZoteroClient } from '@/zotero/client';
import type { ZoteroItem, ZoteroCollection } from '@/zotero/types';
import type { ZoteroTransferItemResult } from '@/zotero/import';
import { importZotero } from '@/zotero/import';
import { exportZotero } from '@/zotero/export';
interface Props {open:boolean;mode:'import'|'export';ids:readonly string[];folderId:string|null;folders:readonly {id:string;name:string;parentId:string|null}[];onClose:()=>void;onDone:()=>void}
export function ZoteroImportDialog(props:Props){
  const [client,setClient]=useState<ZoteroClient>(),[collections,setCollections]=useState<ZoteroCollection[]>([]),[collection,setCollection]=useState<string|null>(null),[expanded,setExpanded]=useState<Set<string>>(new Set());
  const [items,setItems]=useState<ZoteroItem[]>([]),[selected,setSelected]=useState<Map<string,ZoteroItem>>(new Map()),[text,setText]=useState(''),[start,setStart]=useState(0),[total,setTotal]=useState(0),[folder,setFolder]=useState(props.folderId??'root');
  const [loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[results,setResults]=useState<ZoteroTransferItemResult[]>([]),[writable,setWritable]=useState(false);
  const [password,setPassword]=useState(''),[passwordPrompt,setPasswordPrompt]=useState<{incorrect:boolean;resolve:(value:string|null)=>void}>();
  const operation=useRef<AbortController|undefined>(undefined),passwordRef=useRef<typeof passwordPrompt>(undefined),live=useRef(true);passwordRef.current=passwordPrompt;
  useEffect(()=>{live.current=true;return()=>{live.current=false;operation.current?.abort();passwordRef.current?.resolve(null);};},[]);
  useEffect(()=>{
    if(!props.open)return;const abort=new AbortController(),db=new ConnectionStore();setClient(undefined);setItems([]);setCollections([]);setCollection(null);setText('');setStart(0);setWritable(false);setError('');setResults([]);setSelected(new Map());setFolder(props.folderId??'root');
    void (async()=>{try{const [settings,key]=await Promise.all([db.view(),db.zotero()]);if(!settings.zotero||!key)throw new Error('请先在设置中连接 Zotero');const connection=new ZoteroClient(key,settings.zotero.userId);const tree=await connection.collections(abort.signal);if(!abort.signal.aborted){setClient(connection);setWritable(settings.zotero.writable);setCollections(tree);}}catch(e){if(!abort.signal.aborted)setError(e instanceof Error?e.message:'读取失败');}finally{await db.close();}})();
    return()=>{abort.abort();operation.current?.abort();passwordRef.current?.resolve(null);};
  },[props.open]);
  useEffect(()=>{if(!props.open||!client||props.mode!=='import')return;const abort=new AbortController();const timeout=setTimeout(()=>{setLoading(true);void client.items({collection:collection??undefined,text,start},abort.signal).then(result=>{if(!abort.signal.aborted){setItems(result.items.filter(i=>!['note','annotation'].includes(i.data.itemType)));setTotal(result.total);}}).catch(e=>{if(!abort.signal.aborted)setError(e instanceof Error?e.message:'读取失败');}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});},250);return()=>{clearTimeout(timeout);abort.abort();};},[props.open,client,collection,text,start,props.mode]);
  const run=async(retry=false)=>{
    if(!client||operation.current)return;const abort=new AbortController();operation.current=abort;setBusy(true);setError('');
    const failed=new Set(results.filter(r=>!r.ok).map(r=>r.key));if(!retry)setResults([]);else setResults(old=>old.filter(r=>r.ok));
    const done=(result:ZoteroTransferItemResult)=>{if(live.current)setResults(old=>[...old.filter(r=>r.key!==result.key),result]);};
    try{if(props.mode==='import')await importZotero(client,[...selected.values()].filter(i=>!retry||failed.has(i.key)),folder==='root'?null:folder,abort.signal,done,incorrect=>new Promise(resolve=>{setPassword('');setPasswordPrompt({incorrect,resolve});}));else await exportZotero(client,props.ids.filter(id=>!retry||failed.has(id)),collection,abort.signal,done);props.onDone();}
    catch(e){if(live.current)setError(e instanceof Error?e.message:'操作失败');}finally{operation.current=undefined;if(live.current)setBusy(false);}
  };
  const close=()=>{if(busy){operation.current?.abort();passwordRef.current?.resolve(null);}props.onClose();};
  const nodes=collections.map(c=>({id:c.key,parentId:c.data.parentCollection||null,label:c.data.name,icon:'folder' as const}));
  return <><Dialog size="lg" open={props.open} onClose={close} title={props.mode==='import'?'从 Zotero 导入':'导出到 Zotero'} description={props.mode==='export'?`已选 ${props.ids.length} 篇论文`:undefined} footer={<>
    {results.some(r=>!r.ok)&&<Button disabled={busy} onClick={()=>void run(true)}>重试失败项</Button>}
    <Button onClick={close}>{busy?'取消':'关闭'}</Button><Button variant="primary" disabled={busy||!client||(props.mode==='import'?!selected.size:!writable)} onClick={()=>void run()}>{props.mode==='import'?`导入${selected.size?' · '+selected.size:''}`:'导出'}</Button>
  </>}>
    {error&&<p role="alert">{error}<Button variant="quiet" onClick={()=>window.open('options.html#sync','_blank','noopener')}>设置</Button></p>}
    <div className="pp-zotero-picker"><aside><Button variant="quiet" disabled={busy} onClick={()=>{setCollection(null);setStart(0);}}>全部文献</Button><Tree label="Zotero 分类" nodes={nodes} selectedId={collection} onSelect={id=>{if(!busy){setCollection(id);setStart(0);}}} expandedIds={expanded} onToggle={(id,on)=>setExpanded(old=>{const next=new Set(old);on?next.add(id):next.delete(id);return next;})}/></aside><section>
      {props.mode==='import'?<><TextField label="搜索 Zotero" hideLabel placeholder="搜索论文" value={text} onChange={value=>{setText(value);setStart(0);}} disabled={busy}/>
        <Select label="纸窗目标目录" value={folder} onChange={setFolder} disabled={busy} options={[{value:'root',label:'未分类'},...props.folders.map(f=>({value:f.id,label:f.name}))]}/>
        {loading?<ProgressBar label="正在读取文献"/>:items.map(item=><div className="pp-zotero-item" key={item.key}><Checkbox label={item.data.title??item.data.filename??item.key} checked={selected.has(item.key)} disabled={busy} onChange={on=>setSelected(old=>{const next=new Map(old);on?next.set(item.key,item):next.delete(item.key);return next;})}/><Tooltip label="PDF 和可转换的原生高亮、评论、文本笔记会一同导入；缺失内容会单独报告"><span>{item.data.itemType==='attachment'?'PDF':item.meta?.numChildren?'含附件':'书目'}</span></Tooltip></div>)}
        <div className="pp-zotero-pagination"><Button size="sm" disabled={busy||loading||!start} onClick={()=>setStart(Math.max(0,start-50))}>上一页</Button><span>{total?`${start+1}–${Math.min(start+50,total)} / ${total}`:'没有文献'}</span><Button size="sm" disabled={busy||loading||start+50>=total} onClick={()=>setStart(start+50)}>下一页</Button></div>
      </>:<p>选择左侧 Zotero 分类作为导出位置。</p>}
    </section></div>
    {busy&&<ProgressBar label="正在传输"/>}<ul className="pp-zotero-results">{results.map(r=><li key={r.key} data-failed={!r.ok}><strong>{r.title}</strong> · {r.message}{r.warnings.length>0&&<p>{[...new Set(r.warnings)].join('；')}</p>}</li>)}</ul>
  </Dialog><Dialog open={!!passwordPrompt} onClose={()=>{passwordPrompt?.resolve(null);setPasswordPrompt(undefined);}} title="PDF 密码" description={passwordPrompt?.incorrect?'密码不正确，请重试':undefined} footer={<Button onClick={()=>{passwordPrompt?.resolve(password);setPasswordPrompt(undefined);}}>打开</Button>}><TextField label="密码" type="password" value={password} onChange={setPassword}/></Dialog></>;
}
