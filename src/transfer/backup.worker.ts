import { decodeZoteroArchive } from '@/zotero/archive';
import { createBackup, inspectBackup } from './backup';
export function installBackupWorker(){
self.onmessage=async(event:MessageEvent)=>{
  try{const result=event.data.type==='zotero-pdf'?decodeZoteroArchive(event.data.payload.bytes,event.data.payload.filename):event.data.type==='create'?await createBackup(event.data.payload):await inspectBackup(event.data.payload);self.postMessage({ok:true,result});}
  catch(error){self.postMessage({ok:false,error:error instanceof Error?error.message:'备份操作失败'});}
};
}
