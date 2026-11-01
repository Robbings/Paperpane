import { useEffect, useState } from 'react';
import { ConnectionStore, type TransferConnections, type SyncState } from '@/sync/settings';
import type { StatusSummary } from '@/ui/settings/types';
export function useSync(){
  const [connections,setConnections]=useState<TransferConnections>({}),[state,setState]=useState<SyncState>({phase:'idle'}),[error,setError]=useState('');
  useEffect(()=>{let live=true,ticket=0;const db=new ConnectionStore();let pending:Promise<unknown>=Promise.resolve();
    const load=()=>{const epoch=++ticket;pending=pending.catch(()=>{}).then(async()=>{try{const [config,status]=await Promise.all([db.view(),db.status()]);if(live&&epoch===ticket){setConnections(config);setState(status);setError('');}}catch{if(live&&epoch===ticket)setError('同步状态读取失败');}});};
    const channel=new BroadcastChannel('paperpane-transfer');channel.onmessage=load;window.addEventListener('focus',load);load();
    return()=>{live=false;channel.close();window.removeEventListener('focus',load);void pending.finally(()=>db.close());};
  },[]);
  const status:Partial<StatusSummary>={syncImplemented:true,syncConfigured:!!connections.dav,lastSyncedAt:state.lastSuccess??null,
    sync:error?'failed':!connections.dav?'unconfigured':state.phase==='success'?'synced':state.phase==='running'?'syncing':state.phase==='failed'?'failed':'pending',
    syncMessage:error||(!connections.dav?'数据仅保存在本机':state.phase==='idle'?(state.message??'已连接，尚未同步'):undefined)};
  return {connections,state,status,error};
}
