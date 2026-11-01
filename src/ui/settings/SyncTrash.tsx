import { useState } from 'react';
import { Button, Dialog } from '@/ui/components';
import { SettingRow } from './SettingRow';
import { TransferStore } from '@/data/transfer-store';
export function SyncTrash(){
  const [items,setItems]=useState<Awaited<ReturnType<TransferStore['trash']>>>([]),[open,setOpen]=useState(false),[error,setError]=useState('');
  async function load(){const db=new TransferStore();try{setItems(await db.trash());setOpen(true);}catch(e){setError(e instanceof Error?e.message:'读取失败');}finally{await db.close();}}
  return <><SettingRow label="回收站"><Button onClick={()=>void load()}>查看</Button></SettingRow><Dialog open={open} onClose={()=>setOpen(false)} title="回收站">{error&&<p role="alert">{error}</p>}{!items.length&&<p>回收站为空。</p>}{items.map(item=><SettingRow key={item.store+item.key} label={String(item.record.title??item.record.name??item.record.label??item.record.quote??item.key)}><Button size="sm" onClick={()=>{const db=new TransferStore();void db.restoreTrash(item).then(load).catch(e=>setError(e.message)).finally(()=>db.close());}}>恢复</Button></SettingRow>)}</Dialog></>;
}
