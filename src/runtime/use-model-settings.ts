import { useEffect, useRef, useState } from 'react';
import { ModelSettingsStore, emptySettings } from '@/data/model-settings';
import { requestImportOrigin } from '@/document/permissions';
import type { SettingsDraft, SaveSettingsResult } from '@/ui/settings/types';
import { deriveSettingsStatus } from './settings-status';
export function useModelSettings(){
  const [settings,setSettings]=useState(emptySettings);const [error,setError]=useState<string>();
  const [phase,setPhase]=useState<'loading'|'ready'|'failed'>('loading');
  const owner=useRef<{active:boolean;epoch:number}|null>(null);
  useEffect(()=>{
    const db=new ModelSettingsStore(),session={active:true,epoch:0};owner.current=session;
    let tail:Promise<unknown>=Promise.resolve();
    const load=()=>{
      const ticket=++session.epoch;
      tail=tail.catch(()=>{}).then(async()=>{
        if(!session.active)return;
        try{const value=await db.view();if(session.active&&ticket===session.epoch){setSettings(value);setError(undefined);setPhase('ready');}}
        catch{if(session.active&&ticket===session.epoch){setError('模型设置读取失败。');setPhase('failed');}}
      });
    };
    const channel=new BroadcastChannel('paperpane-model-settings');channel.onmessage=load;
    const visible=()=>{if(document.visibilityState==='visible')load();};
    document.addEventListener('visibilitychange',visible);window.addEventListener('focus',load);load();
    return()=>{session.active=false;channel.close();document.removeEventListener('visibilitychange',visible);window.removeEventListener('focus',load);void tail.finally(()=>db.close()).catch(()=>{});};
  },[]);
  const save=async(draft:SettingsDraft,revision:string):Promise<SaveSettingsResult>=>{
    // The permission request originates in the Save click, before disk reads.
    try{for(const e of draft.endpoints)if(!await requestImportOrigin(e.baseUrl))return {ok:false,reason:'permission-denied',message:'未获得模型接口访问权限，设置没有保存。'};}
    catch{return {ok:false,reason:'invalid',problems:[{path:'endpoints',message:'请检查模型接口地址。'}]};}
    const session=owner.current,db=new ModelSettingsStore();try{const result=await db.save(draft,revision);if(result.ok){if(session?.active){++session.epoch;setSettings(result.value);setError(undefined);setPhase('ready');}const c=new BroadcastChannel('paperpane-model-settings');c.postMessage('saved');c.close();}return result;}catch{return {ok:false,reason:'save-failed',message:'配置保存失败。'};}finally{await db.close();}
  };
  const status=deriveSettingsStatus(settings,phase);
  return {settings,save,status,error,loading:phase==='loading'};
}
