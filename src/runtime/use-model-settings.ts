import { useEffect, useState } from 'react';
import { ModelSettingsStore, emptySettings } from '@/data/model-settings';
import { requestImportOrigin } from '@/document/permissions';
import type { SettingsDraft, SaveSettingsResult, StatusSummary } from '@/ui/settings/types';
export function useModelSettings(){
  const [settings,setSettings]=useState(emptySettings);const [error,setError]=useState<string>();
  useEffect(()=>{const db=new ModelSettingsStore();let alive=true;const load=()=>void db.view().then(v=>{if(alive)setSettings(v);}).catch(()=>{if(alive)setError('模型设置读取失败。');});const channel=new BroadcastChannel('paperpane-model-settings');channel.onmessage=load;load();return()=>{alive=false;channel.close();void db.close();};},[]);
  const save=async(draft:SettingsDraft,revision:string):Promise<SaveSettingsResult>=>{
    // The permission request originates in the Save click, before disk reads.
    try{for(const e of draft.endpoints)if(!await requestImportOrigin(e.baseUrl))return {ok:false,reason:'permission-denied',message:'未获得模型接口访问权限，设置没有保存。'};}
    catch{return {ok:false,reason:'invalid',problems:[{path:'endpoints',message:'请检查模型接口地址。'}]};}
    const db=new ModelSettingsStore();try{const result=await db.save(draft,revision);if(result.ok){setSettings(result.value);setError(undefined);const c=new BroadcastChannel('paperpane-model-settings');c.postMessage('saved');c.close();}return result;}catch{return {ok:false,reason:'save-failed',message:'配置保存失败。'};}finally{await db.close();}
  };
  const status:StatusSummary={local:error?'failed':'saved',sync:'unconfigured',lastSyncedAt:null,modelAvailability:settings.models.length?'configured':'unconfigured'};
  return {settings,save,status,error};
}
