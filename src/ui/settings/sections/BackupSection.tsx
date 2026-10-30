import { SyncTrash } from '../SyncTrash';
import { useSync } from '@/runtime/use-sync';
import { ConnectionStore } from '@/sync/settings';
import { WebDavClient } from '@/sync/webdav-client';
import { uploadCloudBackup, cloudBackups, downloadCloudBackup } from '@/sync/cloud-backup';
import { useRef, useState } from 'react';
import { Button, Dialog, Tooltip, ProgressBar } from '@/ui/components';
import { SettingGroup, SettingRow } from '../SettingRow';
import { useTransfer } from '@/runtime/use-transfer';
export function BackupSection(){
  const {connections}=useSync();const [cloud,setCloud]=useState<string[]|undefined>(),[cloudBusy,setCloudBusy]=useState(false),[cloudMessage,setCloudMessage]=useState('');
  const transfer=useTransfer(),input=useRef<HTMLInputElement>(null);
  const download=async()=>{const blob=await transfer.backup();if(!blob)return;const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`Paperpane-${new Date().toISOString().slice(0,10)}.zip`;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);};
  async function remote(action:'upload'|'list'|string){setCloudBusy(true);setCloudMessage('');const db=new ConnectionStore();try{const connection=await db.dav();if(!connection)throw new Error('请先连接 WebDAV');const client=new WebDavClient(connection);
    if(action==='upload'){const blob=await transfer.backup();if(blob){await uploadCloudBackup(client,blob);setCloudMessage('云备份已保存并校验');}}
    else if(action==='list'){const paths=await cloudBackups(client);setCloud(paths);if(!paths.length)setCloudMessage('没有找到云备份');}
    else{const blob=await downloadCloudBackup(client,action);await transfer.inspect(blob);setCloud(undefined);}
  }catch(e){setCloudMessage(e instanceof Error?e.message:'云备份操作失败');}finally{setCloudBusy(false);await db.close();}}
  return <SettingGroup title="备份与恢复">
    <SettingRow label="本机备份"><Tooltip label="保存 PDF、书目、批注与已保存的研究内容，不包含密钥"><Button onClick={()=>void download()} disabled={transfer.busy}>导出</Button></Tooltip><Tooltip label="校验备份后合并恢复，冲突保留双方版本"><Button onClick={()=>input.current?.click()} disabled={transfer.busy}>恢复</Button></Tooltip></SettingRow>
    <SettingRow label="云备份"><Tooltip label="上传并校验完整备份，与多端同步独立保存"><Button disabled={cloudBusy||transfer.busy||!connections.dav} onClick={()=>void remote('upload')}>备份</Button></Tooltip><Button disabled={cloudBusy||transfer.busy||!connections.dav} onClick={()=>void remote('list')}>恢复</Button></SettingRow>
    <SyncTrash/>
    {cloudMessage&&<p role="status">{cloudMessage}</p>}{cloudBusy&&<ProgressBar label="正在处理云备份"/>}
    <Dialog open={cloud!==undefined} onClose={()=>setCloud(undefined)} title="选择云备份">{cloud?.map(path=><div key={path}><Button variant="quiet" disabled={cloudBusy} onClick={()=>void remote(path)}>{path.split('/').at(-1)}</Button></div>)}</Dialog>
    {transfer.busy&&<ProgressBar label="正在处理备份"/>}{transfer.message&&<p role="status">{transfer.message}</p>}
    <input ref={input} hidden type="file" accept=".zip,application/zip" onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void transfer.inspect(file);}}/>
    <Dialog open={!!transfer.preview} onClose={transfer.dismiss} title="恢复备份" description={transfer.preview?`${transfer.preview.complete?'完整备份':'数据备份'} · ${transfer.preview.assets.length} 个 PDF · ${transfer.preview.databases.reduce((n,d)=>n+Object.values(d.stores).reduce((m,r)=>m+r.length,0),0)} 条记录`:''} footer={<><Button onClick={transfer.dismiss} disabled={transfer.busy}>取消</Button><Button variant="primary" onClick={()=>void transfer.restore()} disabled={transfer.busy}>合并恢复</Button></>}/>
  </SettingGroup>;
}
