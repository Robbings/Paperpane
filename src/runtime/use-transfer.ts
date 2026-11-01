import { useEffect, useRef, useState } from 'react';
import { TransferStore } from '@/data/transfer-store';
import type { TransferSnapshot, TransferResult } from '@/contracts/transfer';
import { openBackup, packBackup } from '@/transfer/worker-client';
export function useTransfer(){
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[preview,setPreview]=useState<TransferSnapshot>(),[result,setResult]=useState<TransferResult>();
  const controller=useRef<AbortController|undefined>(undefined);const live=useRef(true);
  useEffect(()=>{live.current=true;return()=>{live.current=false;controller.current?.abort();};},[]);
  async function work<T>(action:(signal:AbortSignal)=>Promise<T>):Promise<T|undefined>{
    if(controller.current)return;const abort=new AbortController();controller.current=abort;setBusy(true);setMessage('');setResult(undefined);
    try{return await action(abort.signal);}catch(e){if(live.current)setMessage(e instanceof Error?e.message:'操作失败');}
    finally{controller.current=undefined;if(live.current)setBusy(false);}
  }
  return {busy,message,preview,result,cancel:()=>controller.current?.abort(),dismiss:()=>setPreview(undefined),
    backup:(complete=true)=>work(async signal=>{const db=new TransferStore();try{return await packBackup(await db.snapshot(complete),signal);}finally{await db.close();}}),
    inspect:(file:Blob)=>work(async signal=>{const data=await openBackup(file,signal);if(live.current)setPreview(data);}),
    restore:()=>work(async signal=>{if(!preview)return;signal.throwIfAborted();const db=new TransferStore();try{const value=await db.restore(preview);if(live.current){setResult(value);setPreview(undefined);setMessage(`已恢复 ${value.imported} 条记录${value.conflicts?`，${value.conflicts} 项冲突待处理`:''}${value.warnings.length?'。'+value.warnings.join(' '):''}`);}return value;}finally{await db.close();}})
  };
}
