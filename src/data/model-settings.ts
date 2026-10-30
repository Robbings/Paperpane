import { endpointUrl, isModelProtocol, resolveConfiguredModel } from '@/ai/model-configuration';
export { endpointUrl } from '@/ai/model-configuration';
import { PaperDatabase } from './database';
import type { SettingsView, SettingsDraft, SaveSettingsResult } from '@/ui/settings/types';
import { runtimeProblems } from '@/ui/settings/sections/AdvancedSection';
const KEY='modelSettings-v1';
export const emptySettings:SettingsView={revision:'empty',endpoints:[],models:[],defaultModelId:null,features:[],prompts:[],runtime:{timeoutSec:120,concurrency:1,maxOutputTokens:null},sync:{enabled:false,webdavUrl:'',username:'',hasPassword:false,uploadPdfs:true}};
interface Record {view:SettingsView;keys: {[endpointId:string]:string}}
const request=<T>(r:IDBRequest<T>)=>new Promise<T>((ok,no)=>{r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});
export class ModelSettingsStore extends PaperDatabase {
  private async record():Promise<Record>{const db=await this.open();const tx=db.transaction('meta','readonly');return (await request(tx.objectStore('meta').get(KEY)))?.value??{view:emptySettings,keys:{}};}
  async view(){return structuredClone((await this.record()).view);}
  async save(draft:SettingsDraft,expected:string):Promise<SaveSettingsResult>{
    const problems=runtimeProblems(draft.runtime);
    for(const [i,e] of draft.endpoints.entries()){try{endpointUrl(e.baseUrl);}catch(error){problems.push({path:`endpoints.${i}.baseUrl`,message:(error as Error).message});}if(!isModelProtocol(e.protocol))problems.push({path:`endpoints.${i}.protocol`,message:'请选择支持的接口协议。'});}
    if(new Set(draft.endpoints.map(e=>e.id)).size!==draft.endpoints.length||new Set(draft.models.map(m=>m.id)).size!==draft.models.length)problems.push({path:'models',message:'模型或接口标识重复。'});
    for(const m of draft.models)if(!m.modelId.trim()||!draft.endpoints.some(e=>e.id===m.endpointId))problems.push({path:'models',message:'请填写模型 ID 并选择对应接口。'});
    for(const m of draft.models)if(m.contextWindow!==undefined&&(!Number.isInteger(m.contextWindow)||m.contextWindow<8192||m.contextWindow>10000000))problems.push({path:'models',message:'模型上下文容量须为 8192–10000000 tokens。'});
    for(const id of [draft.defaultModelId,...draft.features.map(f=>f.modelId)])if(id&&!draft.models.some(m=>m.id===id))problems.push({path:'models',message:'默认或翻译模型不存在。'});
    if(problems.length)return {ok:false,reason:'invalid',problems};
    const db=await this.open();const tx=db.transaction('meta','readwrite',{durability:'strict'});
    return new Promise(resolve=>{let result:SaveSettingsResult={ok:false,reason:'save-failed',message:'模型设置保存失败。'};
      const store=tx.objectStore('meta');const req=store.get(KEY);
      req.onsuccess=()=>{
        const old:Record=req.result?.value??{view:emptySettings,keys:{}};
        if(old.view.revision!==expected){result={ok:false,reason:'conflict',latest:old.view};return;}
        const keys:Record['keys']={};
        for(const e of draft.endpoints){const prev=old.view.endpoints.find(x=>x.id===e.id);
          if(e.key.kind==='keep'&&prev&&endpointUrl(prev.baseUrl)!==endpointUrl(e.baseUrl)&&old.keys[e.id]){result={ok:false,reason:'invalid',problems:[{path:'endpoints',message:'接口地址已改变，请重新填写密钥，避免把旧密钥发送到另一个服务。'}]};return;}
          keys[e.id]=e.key.kind==='replace'?e.key.value.trim():e.key.kind==='clear'?'':old.keys[e.id]??'';
        }
        const {endpoints,sync,...rest}=draft;
        const view:SettingsView={...structuredClone(rest),revision:crypto.randomUUID(),endpoints:endpoints.map(({key:_key,hadKey:_had,...e})=>({...e,baseUrl:endpointUrl(e.baseUrl),hasKey:!!keys[e.id]})),sync:{...old.view.sync,...sync,hasPassword:old.view.sync.hasPassword}};
        // This slice does not implement or persist WebDAV secret edits.
        delete (view.sync as unknown as {[key:string]:unknown}).password;delete (view.sync as unknown as {[key:string]:unknown}).hadPassword;
        store.put({key:KEY,value:{view,keys}});result={ok:true,value:view};
      };
      tx.oncomplete=()=>resolve(result);tx.onabort=()=>resolve({ok:false,reason:'save-failed',message:'模型设置没有保存，请检查本机存储空间。'});
    });
  }
  /** For request logic only; never expose this return value through a UI snapshot. */
  async resolveConnection(modelId?:string, feature: import('@/ui/settings/types').FeatureId = 'translate'){
    const {view,keys}=await this.record();
    const {model,endpoint}=resolveConfiguredModel(view,modelId,feature);
    return {view,model,endpoint,key:keys[endpoint.id]??''};
  }
}
