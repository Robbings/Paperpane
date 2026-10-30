import { createDocumentService } from '@/document/service';
import { LibraryDatabase } from '@/data/library-database';
import type { StoredDocument } from '@/data/database';
/** Reuses PDF validation, password handling, hashing and durable import ownership. */
export async function importPdfBlob(db:LibraryDatabase,blob:Blob,filename:string,folderId:string|null,signal:AbortSignal,askPassword?:(incorrect:boolean)=>Promise<string|null>):Promise<StoredDocument>{
  const owner=createDocumentService(db);let jobId:string|undefined;
  try{
    const accepted=await owner.service.importDocument({kind:'local',file:new File([blob],filename,{type:'application/pdf'})});if(!accepted.ok)throw new Error(accepted.error.message);jobId=accepted.value;
    return await new Promise<StoredDocument>((resolve,reject)=>{
      let ended=false,passwordRequest='';let unsubscribe=()=>{};
      const finish=(error?:unknown,document?:StoredDocument)=>{if(ended)return;ended=true;unsubscribe();signal.removeEventListener('abort',abort);if(error)reject(error);else resolve(document!);};
      const abort=()=>{void owner.service.cancel(jobId!);finish(new Error('导入已取消'));};signal.addEventListener('abort',abort,{once:true});
      const update=()=>{const job=owner.service.getSnapshot().data.jobs.find(j=>j.id===jobId);if(!job||ended)return;
        if(job.phase==='failed'||job.phase==='cancelled')finish(new Error(job.error?.message??'导入已取消'));
        else if(job.phase==='readable'&&job.document){void (async()=>{try{unsubscribe();const receipt=owner.getImportReceipt(jobId!)!;await db.retainDocument(job.document!,folderId,!receipt.duplicate);finish(undefined,await db.getDocument(job.document!.documentId));}catch(e){finish(e);}})();}
        else if(job.passwordRequest&&job.passwordRequest.requestId!==passwordRequest){passwordRequest=job.passwordRequest.requestId;const request=passwordRequest;if(!askPassword){abort();return;}
          void askPassword(job.passwordRequest.incorrect).then(value=>{if(ended)return;if(value===null)abort();else void owner.service.submitPassword(jobId!,request,value).then(result=>{if(!result.ok)finish(new Error(result.error.message));});}).catch(finish);
        }
      };unsubscribe=owner.service.subscribe(update);if(signal.aborted)abort();else update();
    });
  }finally{owner.dispose();}
}
