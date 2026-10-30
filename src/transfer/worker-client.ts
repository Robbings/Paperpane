import type { TransferSnapshot } from '@/contracts/transfer';
import { browser } from 'wxt/browser';
function run<T>(type:string,payload:unknown,signal?:AbortSignal):Promise<T>{
  return new Promise((resolve,reject)=>{
    signal?.throwIfAborted();
    const worker=new Worker(browser.runtime.getURL('/backup-transfer.js'),{type:'module'});
    const cleanup=()=>{worker.terminate();signal?.removeEventListener('abort',abort);};
    const abort=()=>{cleanup();reject(new DOMException('操作已取消','AbortError'));};
    worker.onmessage=e=>{cleanup();e.data.ok?resolve(e.data.result):reject(new Error(e.data.error));};
    worker.onerror=()=>{cleanup();reject(new Error('备份工作线程启动失败'));};
    signal?.addEventListener('abort',abort,{once:true});worker.postMessage({type,payload});
  });
}
export const packBackup=(snapshot:TransferSnapshot,signal?:AbortSignal)=>run<Blob>('create',snapshot,signal);
export const openBackup=(blob:Blob,signal?:AbortSignal)=>run<TransferSnapshot>('inspect',blob,signal);

export const extractZoteroPdf=(bytes:Uint8Array,filename?:string,signal?:AbortSignal)=>run<Blob>('zotero-pdf',{bytes,filename},signal);
