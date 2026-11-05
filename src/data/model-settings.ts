import { credentials } from '@/translation/machine';
import { resolveEngine } from '@/translation/resolve';
import { cleanPasted, endpointUrl, isModelProtocol, resolveConfiguredModel } from '@/ai/model-configuration';
export { endpointUrl } from '@/ai/model-configuration';
import { modelProblems } from '@/ai/model-capabilities';
import type { EndpointDraft } from '@/ui/settings/types';
import { PaperDatabase } from './database';
import type { SettingsView, SettingsDraft, SaveSettingsResult } from '@/ui/settings/types';
import { runtimeProblems } from '@/ui/settings/sections/AdvancedSection';
const KEY='modelSettings-v1';
const TRANSLATION_KEY='translation-api:';
export const emptySettings:SettingsView={revision:'empty',endpoints:[],models:[],defaultModelId:null,features:[],prompts:[],runtime:{timeoutSec:120,concurrency:3,maxOutputTokens:null},sync:{enabled:false,webdavUrl:'',username:'',hasPassword:false,uploadPdfs:true}};
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
    for(const m of draft.models){for(const message of modelProblems(m))problems.push({path:'models',message});if(m.protocolOverride&&!isModelProtocol(m.protocolOverride))problems.push({path:'models',message:'模型协议无效。'});}
    const identities=draft.models.map(m=>[m.endpointId,m.modelId.trim(),m.protocolOverride??draft.endpoints.find(e=>e.id===m.endpointId)?.protocol].join('\u0000'));
    if(new Set(identities).size!==identities.length)problems.push({path:'models',message:'同一端点和协议下的模型 ID 重复。'});
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
          keys[e.id]=e.key.kind==='replace'?cleanPasted(e.key.value):e.key.kind==='clear'?'':old.keys[e.id]??'';
        }
        // Machine translation credentials sit beside the endpoint keys, under their own prefix.
        for(const api of draft.translationApis??[]){const id=TRANSLATION_KEY+api.id;keys[id]=api.secret.kind==='replace'?api.secret.value:api.secret.kind==='clear'?'':old.keys[id]??'';}
        const {endpoints,sync,translationApis,...rest}=draft;
        const view:SettingsView={...structuredClone(rest),revision:crypto.randomUUID(),endpoints:endpoints.map(({key:_key,hadKey:_had,...e})=>({...e,baseUrl:endpointUrl(e.baseUrl),hasKey:!!keys[e.id]})),translationApis:(translationApis??[]).map(({secret:_secret,hadSecret:_had,...api})=>({...structuredClone(api),hasSecret:!!keys[TRANSLATION_KEY+api.id]})),sync:{...old.view.sync,...sync,hasPassword:old.view.sync.hasPassword}};
        // This slice does not implement or persist WebDAV secret edits.
        delete (view.sync as unknown as {[key:string]:unknown}).password;delete (view.sync as unknown as {[key:string]:unknown}).hadPassword;
        store.put({key:KEY,value:{view,keys}});result={ok:true,value:view};
      };
      tx.oncomplete=()=>resolve(result);tx.onabort=()=>resolve({ok:false,reason:'save-failed',message:'模型设置没有保存，请检查本机存储空间。'});
    });
  }
  /** Used only by discovery/test services; never include credentials in a view. */
  async resolveDraftEndpoint(endpoint:EndpointDraft){
    const baseUrl=endpointUrl(endpoint.baseUrl), record=await this.record(),previous=record.view.endpoints.find(e=>e.id===endpoint.id);
    if(endpoint.key.kind==='keep'&&previous&&endpointUrl(previous.baseUrl)!==baseUrl&&record.keys[endpoint.id])throw new Error('接口地址已改变，请重新填写密钥。');
    const key=endpoint.key.kind==='replace'?cleanPasted(endpoint.key.value):endpoint.key.kind==='clear'?'':record.keys[endpoint.id]??'';
    return {endpoint:{...endpoint,baseUrl},key};
  }
  /** Credentials of a machine translation API, for request logic only (JSON of its secret fields). */
  async translationApiSecret(apiId:string):Promise<{[field:string]:string}>{const {keys}=await this.record();return credentials(keys[TRANSLATION_KEY+apiId]);}
  async resolveTranslationEngine(purpose: 'paper' | 'selection', override?: string) {
    const {view, keys} = await this.record();
    return resolveEngine(view, keys, purpose, override);
  }
  /** For request logic only; never expose this return value through a UI snapshot. */
  async resolveConnection(modelId?:string, feature: import('@/ui/settings/types').FeatureId = 'translate'){
    const {view,keys}=await this.record();
    const {model,endpoint}=resolveConfiguredModel(view,modelId,feature);
    return {view,model,endpoint,key:keys[endpoint.id]??''};
  }
}
