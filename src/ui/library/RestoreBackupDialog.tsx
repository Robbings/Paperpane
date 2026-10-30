import { useRef } from 'react';
import { Button, Dialog, ProgressBar } from '@/ui/components';
import { useTransfer } from '@/runtime/use-transfer';
export function RestoreBackupDialog({open,onClose,onDone}:{open:boolean;onClose:()=>void;onDone:()=>void}){
  const transfer=useTransfer(),input=useRef<HTMLInputElement>(null);
  return <Dialog open={open} onClose={onClose} title="恢复备份" description={transfer.preview?`${transfer.preview.assets.length} 个 PDF · ${transfer.preview.complete?'完整备份':'数据备份'}`:undefined} footer={<><Button onClick={onClose} disabled={transfer.busy}>关闭</Button>{transfer.preview?<Button variant="primary" disabled={transfer.busy} onClick={()=>void transfer.restore().then(result=>{if(result)onDone();})}>合并恢复</Button>:<Button disabled={transfer.busy} onClick={()=>input.current?.click()}>选择备份</Button>}</>}>
    {transfer.busy&&<ProgressBar label="正在处理备份"/>}{transfer.message&&<p role="status">{transfer.message}</p>}
    <input ref={input} hidden type="file" accept=".zip,application/zip" onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void transfer.inspect(file);}}/>
  </Dialog>;
}
