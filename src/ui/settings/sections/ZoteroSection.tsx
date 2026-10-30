import { useState } from 'react';
import { Button, TextField, Tooltip } from '@/ui/components';
import { SettingGroup, SettingRow } from '../SettingRow';
import { ConnectionStore } from '@/sync/settings';
import { ZoteroClient } from '@/zotero/client';
import { useSync } from '@/runtime/use-sync';
import { requestImportOrigin } from '@/document/permissions';
export function ZoteroSection(){
  const {connections}=useSync(),[key,setKey]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  async function connect(){const access=requestImportOrigin('https://api.zotero.org');setBusy(true);setMessage('');const db=new ConnectionStore();try{if(!await access)throw new Error('没有获得 Zotero 访问权限');const secret=key||await db.zotero();if(!secret)throw new Error('请输入 Zotero API Key');const result=await new ZoteroClient(secret).connection();await db.saveZotero(secret,String(result.userID),!!result.access.user?.write);setKey('');setMessage(result.access.user?.files?'已连接':'已连接，但 API Key 没有附件读取权限');}catch(e){setMessage(e instanceof Error?e.message:'连接失败');}finally{setBusy(false);await db.close();}}
  return <SettingGroup title="Zotero"><SettingRow label="API Key" stacked><TextField label="Zotero API Key" hideLabel type="password" value={key} onChange={setKey} placeholder={connections.zotero?.hasKey?'已保存，留空保留':''}/><Tooltip label="验证个人文献库的读取及写入权限，密钥仅保存在本机"><Button disabled={busy} onClick={()=>void connect()}>{busy?'连接中…':'连接'}</Button></Tooltip>{connections.zotero&&<Tooltip label="清除本机密钥，保留已导入论文"><Button variant="quiet" disabled={busy} onClick={()=>{const db=new ConnectionStore();void db.disconnect('zotero').then(()=>{setKey('');setMessage('');}).finally(()=>db.close());}}>断开</Button></Tooltip>}</SettingRow>{connections.zotero&&<p role="status">{connections.zotero.writable?'已连接 · 可导入和导出':'已连接 · 只读'}</p>}{message&&<p role="status">{message}</p>}</SettingGroup>;
}
