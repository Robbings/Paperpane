import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { pdfjsResources } from '@/document/pdfjs-resources';
GlobalWorkerOptions.workerSrc=workerUrl;
export async function pdfViews(blob:Blob,signal:AbortSignal):Promise<number[][]>{
  const task=getDocument({...pdfjsResources(),data:new Uint8Array(await blob.arrayBuffer()),enableXfa:false});
  task.onPassword=()=>{void task.destroy();};const abort=()=>{void task.destroy();};signal.addEventListener('abort',abort,{once:true});
  try{const pdf=await task.promise,views:number[][]=[];for(let i=1;i<=pdf.numPages;i++){signal.throwIfAborted();views.push([...(await pdf.getPage(i)).view]);}return views;}
  finally{signal.removeEventListener('abort',abort);await task.destroy();}
}
