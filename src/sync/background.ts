import { browser } from 'wxt/browser';
import { TransferStore } from '@/data/transfer-store';
import { canonical, flatten } from './manifest';
import { stable } from './merge';
import { synchronize } from './engine';
import { ConnectionStore } from './settings';
export function installSync(){
  const alarm='paperpane-sync';
  // MV3 can stop a worker mid-transfer. A stale persisted flag is not a live task.
  void navigator.locks.request('paperpane-sync',{ifAvailable:true},async lock=>{if(!lock)return;const db=new ConnectionStore();try{const state=await db.status();if(state.phase==='running')await db.write('transfer-sync-state',{...state,phase:'failed',message:'上次同步被中断，可重新同步'});}finally{await db.close();}}).catch(()=>{});
  async function configure(){const db=new ConnectionStore();try{const config=await db.view();if(config.dav?.automatic&&config.dav.conditional)await browser.alarms.create(alarm,{periodInMinutes:5,delayInMinutes:1});else await browser.alarms.clear(alarm);}finally{await db.close();}}
  const contentChannels=['paperpane-notes','paperpane-documents','paperpane-annotations','paperpane-ai'].map(name=>{
    const channel=new BroadcastChannel(name);
    channel.onmessage=()=>{
      const store=new TransferStore();
      void store.updateTransferState((snapshot,meta)=>{
        const state=meta.find(r=>r.key==='transfer-sync-state')?.value as import('./settings').SyncState|undefined;
        const baseline=meta.find(r=>r.key==='transfer-sync-baseline')?.value as {manifest:import('./manifest').SyncManifest}|undefined;
        if(state?.phase!=='success'||!baseline||stable(flatten(canonical(snapshot)))===stable(baseline.manifest.records))return {};
        return {'transfer-sync-state':{...state,phase:'idle',message:'有改动待同步'}};
      }).catch(()=>{}).finally(()=>store.close());
    };
    return channel;
  });
  void contentChannels;
  let active=false;
  browser.alarms.onAlarm.addListener(event=>{if(event.name!==alarm||active)return;active=true;const controller=new AbortController();void synchronize(controller.signal).catch(()=>{}).finally(()=>{active=false;});});
  const channel=new BroadcastChannel('paperpane-transfer');channel.onmessage=e=>{if(e.data?.key==='transfer-connections')void configure();};
  browser.runtime.onStartup.addListener(()=>void configure());void configure();
}
