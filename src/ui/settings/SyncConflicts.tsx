import { useEffect, useState } from 'react';
import { Button, Dialog } from '@/ui/components';
import { TransferStore } from '@/data/transfer-store';
import { stable } from '@/sync/merge';
type Version = Awaited<ReturnType<TransferStore['versions']>>[number];
const time = (value:string) => { const date=new Date(value);return Number.isNaN(date.valueOf())?'时间未记录':date.toLocaleString('zh-CN',{hour12:false}); };
const labels:Record<string,string>={markdown:'正文',comment:'批注内容',text:'文字',shortNote:'笔记',title:'标题',name:'名称',color:'颜色',deletedAt:'移除状态',inLibrary:'文献库状态'};
function text(value:unknown):string {
  if(value===undefined||value===null)return '（没有内容）';
  if(typeof value==='string')return value.replace(/paperpane-asset:[a-f0-9]{64}/g,'图片附件（已保留）')||'（空白）';
  if(typeof value==='boolean')return value?'是':'否';
  if(typeof value==='number')return String(value);
  if(Array.isArray(value))return value.map(text).join('\n\n');
  const record=value as Record<string,unknown>;
  for(const key of ['markdown','comment','text','shortNote','content','messages','sessions','title','name'])if(record[key]!==undefined)return text(record[key]);
  return '此版本包含结构化资料，应用后可在论文中查看。';
}
function Difference({value,other}:{value:unknown;other:unknown}){
  const a=text(value),b=text(other);let start=0,end=a.length,otherEnd=b.length;
  while(start<end&&start<otherEnd&&a[start]===b[start])start++;
  while(end>start&&otherEnd>start&&a[end-1]===b[otherEnd-1]){end--;otherEnd--;}
  return <div className="pp-saved-version-content">{a.slice(0,start)}<mark>{a.slice(start,end)}</mark>{a.slice(end)}</div>;
}
export function SyncConflicts(){
  const [items,setItems]=useState<Version[]>([]),[selected,setSelected]=useState<Version>(),[open,setOpen]=useState(false),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const load=async()=>{const db=new TransferStore();try{const values=await db.versions();setItems(values);setSelected(old=>old?values.find(v=>v.id===old.id):undefined);}catch{setMessage('版本暂时读取失败，重新打开即可重试。已保存的内容不会改变。');}finally{await db.close();}};
  useEffect(()=>{let alive=true;const refresh=()=>{if(alive)void load().catch(()=>{if(alive)setMessage('版本读取失败，可重新打开查看');});};refresh();const channel=new BroadcastChannel('paperpane-transfer');channel.onmessage=refresh;return()=>{alive=false;channel.close();};},[]);
  const apply=async()=>{
    if(!selected||busy)return;setBusy(true);const db=new TransferStore();
    try{const result=await db.useVersion(selected.id,selected.current);await load();setMessage(result==='changed'?'当前内容有新编辑，差异已刷新。两个版本仍保留，可继续选择。':'已应用选中的内容，原内容仍保存在版本记录中。');}
    catch(e){setMessage(e instanceof Error?e.message:'应用失败，版本仍保留，可重试');await load();}
    finally{await db.close();setBusy(false);}
  };
  const alternatives=items.filter(v=>stable(v.current)!==stable(v.value));
  return <>
    <Button variant="quiet" onClick={()=>{setOpen(true);setMessage('');void load();}}>已保留版本{alternatives.length?` · ${alternatives.length}`:''}</Button>
    <Dialog open={open} onClose={()=>setOpen(false)} title="已保留版本" size="lg" description="不同改动已自动保存，不影响同步。只有想切换内容时才需要操作。" footer={<Button variant="primary" onClick={()=>setOpen(false)}>保留所有版本，完成</Button>}>
      {message&&<p role="status">{message}</p>}
      {!items.length?<p>还没有需要另存的版本。</p>:<div className="pp-saved-versions">
        <nav aria-label="内容版本">{items.map(v=><button type="button" className="pp-saved-version-item" aria-pressed={v.id===selected?.id} key={v.id} onClick={()=>{setSelected(v);setMessage('');}}>
          <strong>{v.paper}</strong><span>{v.context} · {labels[v.path.at(-1)??'']??'内容版本'}</span><time dateTime={v.savedAt}>保留于 {time(v.savedAt)}</time><span>{text(v.value).slice(0,100)}</span>
        </button>)}</nav>
        <section>{selected?<>
          <h3>{selected.paper} · {selected.context}</h3><p>标色部分为差异。只替换这一项内容，其他消息和笔记保持原样。</p>
          <div className="pp-transfer-compare"><section><h4>当前内容</h4><Difference value={selected.current} other={selected.value}/></section><section><h4>已保留内容</h4><p>保留于 {time(selected.savedAt)}</p><Difference value={selected.value} other={selected.current}/></section></div>
          <Button disabled={busy||stable(selected.current)===stable(selected.value)||selected.value===undefined} onClick={()=>void apply()}>{busy?'正在应用…':stable(selected.current)===stable(selected.value)?'正在使用此内容':'使用这份内容'}</Button>
        </>:<p>选择一项查看具体差异。所有版本已自动保留，无需逐个确认。</p>}</section>
      </div>}
    </Dialog>
  </>;
}
