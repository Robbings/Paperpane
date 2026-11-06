import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {resolve} from 'node:path';
import 'fake-indexeddb/auto';
import {PDFDocument, PDFName, PDFArray} from 'pdf-lib';
import {unzipSync} from 'fflate';
const {outputFiles}=await build({stdin:{contents:`export {AnnotationSession} from './src/domain/annotations/session';export {AnnotationDatabase} from './src/data/annotation-database';export {ResearchStore} from './src/ai/store';export {exportLibraryPdfs} from './src/domain/library/export-pdfs';`,resolveDir:process.cwd()},alias:{'@':resolve('src')},bundle:true,platform:'node',format:'esm',write:false});
const {AnnotationSession,AnnotationDatabase,ResearchStore,exportLibraryPdfs}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].contents).toString('base64'));
globalThis.window=new EventTarget();
const ref={documentId:'annotation-followup',fileVersion:'v1'};
const anchor={...ref,pages:[{pageIndex:0,rects:[{x:10,y:10,width:40,height:12}]}]};
const input={kind:'selection-comment',selection:{text:'quote',anchor},color:'yellow'};
const layout=id=>({id,open:false,collapsed:false,dx:0,dy:0,width:260,height:168,z:1});
async function setup(){const db=new AnnotationDatabase();const native=await db.open();const tx=native.transaction('documents','readwrite');tx.objectStore('documents').put({id:ref.documentId,...ref,pageCount:1,syncScope:'record-and-file',save:{sync:'unconfigured'}});await new Promise(ok=>tx.oncomplete=ok);const s=new AnnotationSession(db,ref);await s.refresh();return{db,s};}
test('closing an empty comment while the editor flushes does not use a stale revision',async()=>{
 const {db,s}=await setup();try{const created=await s.create(input);const id=created.value.id;
 const deletion=s.deleteCurrent(id,true);s.edit(id,{comment:'\n'});await deletion;await s.flush();
 if(!s.getSnapshot().data.items.find(x=>x.id===id).deletedAt)await s.deleteCurrent(id,true);
 s.setLayouts([layout(id)]);await s.flush();assert.equal(s.getSnapshot().data.error,undefined);assert.equal(s.getSnapshot().data.hasDrafts,false);assert(s.getSnapshot().data.items.find(x=>x.id===id).deletedAt);
 }finally{await s.dispose();await db.close();}
});
test('close preserves final text; repeated delete and close-layout do not fail',async()=>{
 const {db,s}=await setup();try{const id=(await s.create(input)).value.id;const closing=s.deleteCurrent(id,true);s.edit(id,{comment:'last keystroke'});await closing;await s.flush();let row=s.getSnapshot().data.items.find(x=>x.id===id);assert.equal(row.comment,'last keystroke');assert(!row.deletedAt);
 await Promise.all([s.deleteCurrent(id),s.deleteCurrent(id)]);s.setLayouts([layout(id)]);await s.flush();assert.equal(s.getSnapshot().data.error,undefined);await s.restoreDeleted(id);assert(!s.getSnapshot().data.items.find(x=>x.id===id).deletedAt);
 }finally{await s.dispose();await db.close();}
});
test('an actual concurrent edit still blocks deletion and preserves the remote comment',async()=>{
 const {db,s}=await setup();try{const row=(await s.create(input)).value;await db.mutate(ref,row.id,row.revision,{comment:'other window'});assert.equal(await s.deleteCurrent(row.id,true),false);assert.equal(s.getSnapshot().data.error.code,'CONFLICT');assert.equal((await db.load(ref)).items.find(x=>x.id===row.id).comment,'other window');}finally{await s.dispose();await db.close();}
});
test('overview card template survives another paper and a new store instance without copying results',async()=>{
 const a=new ResearchStore(),b=new ResearchStore();try{const cards=[{id:'custom-test',name:'我的选项',visible:true,prompt:'brief',output:'markdown'}];await a.saveOverviewTemplate(cards);const next=await b.read('ai-v1:another:v1');assert.deepEqual(next.cards,cards);assert.deepEqual(next.overviews,[]);next.cards[0].name='not saved';assert.equal((await a.read('ai-v1:third:v1')).cards[0].name,'我的选项');}finally{await a.close();await b.close();}
});
test('library PDF exports retain saved annotations and batch duplicate titles safely',async()=>{
 const {db,s}=await setup();try{const pdf=await PDFDocument.create();pdf.addPage([200,300]);const bytes=await pdf.save();await db.files.put({id:'followup-pdf',blob:new Blob([bytes],{type:'application/pdf'}),sha256:'fixture',createdAt:'now'});const native=await db.open();const tx=native.transaction('documents','readwrite');tx.objectStore('documents').put({id:ref.documentId,...ref,pageCount:1,file:{assetId:'followup-pdf'},originalFilename:'paper.pdf',syncScope:'record-and-file',save:{sync:'unconfigured'}});await new Promise(ok=>tx.oncomplete=ok);
 await s.create({...input,kind:'highlight',comment:'Saved note'});const item={id:'first',title:'Same title',document:ref};const single=await exportLibraryPdfs([item]);assert.equal(single.blob.type,'application/pdf');const parsed=await PDFDocument.load(await single.blob.arrayBuffer());assert(parsed.getPage(0).node.lookup(PDFName.of('Annots'),PDFArray).size()>0);
 const many=await exportLibraryPdfs([item,{...item,id:'second'},{id:'bib',title:'No PDF'}]);assert.equal(many.blob.type,'application/zip');assert.equal(Object.keys(unzipSync(new Uint8Array(await many.blob.arrayBuffer()))).length,2);assert.deepEqual(many.missing,['No PDF']);await assert.rejects(()=>exportLibraryPdfs([{id:'bib',title:'No PDF'}]),/没有可导出/);
 }finally{await s.dispose();await db.close();}
});
