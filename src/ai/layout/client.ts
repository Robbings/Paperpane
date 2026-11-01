import { DEFAULT_LAYOUT_ENGINE } from './engines';
import { browser } from 'wxt/browser';
import type { LayoutRegion } from './types';
let worker:SharedWorker|undefined;
const pending=new Map<string,{resolve:(r:LayoutRegion[])=>void;reject:(e:Error)=>void;cleanup:()=>void}>();
function connection(){if(worker)return worker;
 // A Vite module URL points at localhost during development. Chrome terminates
 // an extension renderer for that cross-origin SharedWorker before onerror runs.
 const url=browser.runtime.getURL('/layout-inference.js');
 worker=new SharedWorker(url,{type:'module',name:'paperpane-layout-v1'});const port=worker.port;
 port.onmessage=({data})=>{if(data.idle){port.close();worker=undefined;return;}const task=pending.get(data.id);if(task){pending.delete(data.id);task.cleanup();data.error?task.reject(new Error(data.error)):task.resolve(data.regions);}};
 worker.onerror=()=>{for(const task of pending.values()){task.cleanup();task.reject(new Error('版面识别暂不可用，请重新打开论文重试'));}pending.clear();port.close();worker=undefined;};port.start();return worker;
}
export function detectLayout(blob:Blob,width:number,height:number,signal:AbortSignal):Promise<LayoutRegion[]>{signal.throwIfAborted();return new Promise((resolve,reject)=>{
 const id=crypto.randomUUID(),port=connection().port;const timer=setTimeout(()=>{port.postMessage({id,cancel:true});finish(new Error('版面识别超时，请重新打开论文重试'));},90000);
 const abort=()=>{port.postMessage({id,cancel:true});finish(new DOMException('已停止识别','AbortError'));};
 const cleanup=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);};
 const finish=(error:Error)=>{pending.delete(id);cleanup();reject(error);};
 pending.set(id,{resolve,reject,cleanup});signal.addEventListener('abort',abort,{once:true});port.postMessage({id,blob,width,height,engine:DEFAULT_LAYOUT_ENGINE});
});}
