import { ZoteroDiscovery } from './ZoteroDiscovery';
import { useEffect, useRef, useState } from 'react';
import { Button, TextField, Switch, Tooltip, ProgressBar } from '@/ui/components';
import { SettingGroup, SettingRow } from '../SettingRow';
import { ConnectionStore } from '@/sync/settings';
import { WebDavClient } from '@/sync/webdav-client';
import { synchronize } from '@/sync/engine';
import { useSync } from '@/runtime/use-sync';
import { requestImportOrigin } from '@/document/permissions';
import { SyncConflicts } from '../SyncConflicts';
export function SyncSection(){
  const {connections,state}=useSync();const [url,setUrl]=useState(''),[username,setUsername]=useState(''),[password,setPassword]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const controller=useRef<AbortController|undefined>(undefined);
  useEffect(()=>{if(connections.dav){setUrl(connections.dav.url);setUsername(connections.dav.username);}},[connections.dav?.url,connections.dav?.username]);
  useEffect(()=>()=>controller.current?.abort(),[]);
  async function connect(){
    const access=requestImportOrigin(url);setBusy(true);setMessage('');const db=new ConnectionStore();const abort=new AbortController();controller.current=abort;
    try{if(!await access)throw new Error('没有获得 WebDAV 访问权限');const old=await db.dav();const secret=password||(old?.url===url&&old.username===username?old.password:'');if(!secret)throw new Error('请输入 WebDAV 密码');
      const connection={url,username,password:secret},capability=await new WebDavClient(connection).probe(abort.signal);await db.saveDav(connection,capability.conditional,connections.dav?.automatic??false);setPassword('');setMessage(capability.conditional?'已连接':'已连接，仅支持云备份；服务器不支持可靠的并发同步');
    }catch(e){setMessage(e instanceof Error?e.message:'连接失败');}finally{await db.close();controller.current=undefined;setBusy(false);}
  }
  async function sync(){setBusy(true);setMessage('');const abort=new AbortController();controller.current=abort;try{await synchronize(abort.signal);}catch(e){setMessage(e instanceof Error?e.message:'同步失败');}finally{controller.current=undefined;setBusy(false);}}
  async function automatic(value:boolean){const db=new ConnectionStore();try{const connection=await db.dav();if(connection)await db.saveDav(connection,!!connections.dav?.conditional,value);}finally{await db.close();}}
  async function disconnect(){const db=new ConnectionStore();try{await db.disconnect('dav');setUrl('');setUsername('');setPassword('');setMessage('');}finally{await db.close();}}
  return <SettingGroup title="WebDAV">
    <TextField label="地址" placeholder="https://…" value={url} onChange={setUrl}/><div className="pp-transfer-fields"><TextField label="用户名" value={username} onChange={setUsername}/><TextField label="密码" type="password" value={password} onChange={setPassword} placeholder={connections.dav?.hasPassword?'已保存，留空保留':''}/></div>
    <div className="pp-transfer-actions"><Button onClick={()=>void connect()} disabled={busy}>连接</Button><Tooltip label="合并两端已保存的内容，冲突由你选择"><Button onClick={()=>void sync()} disabled={busy||!connections.dav?.conditional}>立即同步</Button></Tooltip>{connections.dav&&<Tooltip label="清除本机凭据，保留本机和云端论文"><Button variant="quiet" disabled={busy||state.phase==='running'} onClick={()=>void disconnect()}>断开</Button></Tooltip>}</div>
    <SettingRow label="自动同步"><Tooltip label="浏览器运行时每五分钟检查；关闭浏览器后暂停"><Switch label="自动同步" hideLabel checked={!!connections.dav?.automatic} disabled={busy||!connections.dav?.conditional} onChange={value=>void automatic(value)}/></Tooltip></SettingRow>
    {busy&&<><ProgressBar label={state.phase==='running'?'正在同步':'正在连接'}/><Button variant="quiet" onClick={()=>controller.current?.abort()}>取消</Button></>}
    {(message||state.message)&&<p role="status">{message||state.message}</p>}<SyncConflicts/><ZoteroDiscovery/>
  </SettingGroup>;
}
