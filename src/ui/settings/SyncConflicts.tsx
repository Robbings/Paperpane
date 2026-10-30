import { useEffect, useState } from 'react';
import { Button, Dialog } from '@/ui/components';
import { TransferStore, type TransferConflict } from '@/data/transfer-store';
export function SyncConflicts(){
  const [items,setItems]=useState<TransferConflict[]>([]),[selected,setSelected]=useState<TransferConflict>(),[error,setError]=useState('');
  const load=async()=>{const db=new TransferStore();try{setItems(await db.conflicts());}finally{await db.close();}};
  useEffect(()=>{void load();const c=new BroadcastChannel('paperpane-transfer');c.onmessage=()=>void load();return()=>c.close();},[]);
  const resolve=async(choice:'local'|'remote')=>{if(!selected)return;const db=new TransferStore();try{await db.resolveConflict(selected.id,choice);setSelected(undefined);setError('');await load();}catch(e){setError(e instanceof Error?e.message:'处理失败');}finally{await db.close();}};
  if(!items.length)return null;
  return <><Button onClick={()=>setSelected(items[0])}>处理冲突 · {items.length}</Button><Dialog open={!!selected} onClose={()=>setSelected(undefined)} title="选择保留版本" description={selected?.store} footer={<><Button onClick={()=>{if(!selected)return;const db=new TransferStore();void db.refreshConflict(selected.id).then(async()=>{const next=await db.conflicts();setItems(next);setSelected(next.find(c=>c.id===selected.id));setError('');}).catch(e=>setError(e.message)).finally(()=>db.close());}}>重新读取</Button><Button onClick={()=>void resolve('local')}>保留本机</Button><Button onClick={()=>void resolve('remote')}>使用远程</Button></>}>
    {error&&<p role="alert">{error}</p>}<div className="pp-transfer-compare"><section><h3>本机</h3><pre>{JSON.stringify(selected?.local,null,2)}</pre></section><section><h3>远程</h3><pre>{JSON.stringify(selected?.remote,null,2)}</pre></section></div>
  </Dialog></>;
}
