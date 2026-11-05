import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {PDFDocument,StandardFonts} from 'pdf-lib';
const {chromium}=await import(pathToFileURL(process.env.PAPERPANE_PLAYWRIGHT_MODULE).href);
const extension=resolve('.output/chrome-mv3'),out=resolve('backups/library-bugfixes');await mkdir(out,{recursive:true});
await build({stdin:{contents:`
export {ResearchService} from './src/ai/service';
export {LibraryDatabase} from './src/data/library-database';
export {NoteDatabase} from './src/data/note-database';
export {ModelSettingsStore,emptySettings} from './src/data/model-settings';
export {DEFAULT_PREFERENCES} from './src/ui/settings/types';
export {newModel} from './src/ai/model-catalog';
export {exportNotes} from './src/domain/notes/export';
export {exportZotero} from './src/zotero/export';
export {md5} from './src/zotero/md5';
export {ZoteroError} from './src/zotero/client';
export {unzipSync,strFromU8} from 'fflate';
import {createRoot} from 'react-dom/client';import {createElement} from 'react';
import {Toaster,toast} from './src/ui/components/Toast';
export function showTestError(){const host=document.createElement('div');document.body.append(host);createRoot(host).render(createElement(Toaster));toast.show({tone:'error',message:'自动消失测试'});}
`,resolveDir:process.cwd()},plugins:[{name:'worker-url',setup(b){b.onResolve({filter:/\?url$/},()=>({path:'worker',namespace:'test-worker'}));b.onLoad({filter:/.*/,namespace:'test-worker'},()=>({contents:'export default "/pdf.worker.js"'}));}}],jsx:'automatic',alias:{'@':resolve('src')},bundle:true,format:'esm',platform:'browser',outfile:extension+'/bugfix-test.js',loader:{'.css':'empty'}});
const extra=process.env.PAPERPANE_SCHOLAR_EXTENSION;
const paths=[extension,...(extra?[extra]:[])].join(',');
const context=await chromium.launchPersistentContext(resolve('browser-profiles/bugfixes-'+Date.now()),{executablePath:process.env.PAPERPANE_CHROMIUM,headless:true,viewport:{width:1500,height:1050},ignoreDefaultArgs:['--disable-extensions'],args:[`--disable-extensions-except=${paths}`,`--load-extension=${paths}`]});
context.setDefaultTimeout(15000);const errors=[];context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
let calls=0;
try{
 const worker=context.serviceWorkers().find(w=>w.url().endsWith('/background.js'))??await context.waitForEvent('serviceworker',w=>w.url().endsWith('/background.js'));
 const root=`chrome-extension://${new URL(worker.url()).host}`;
 await worker.evaluate(()=>chrome.storage.local.set({onboarding:{welcomed:true,guided:true}}));
 const page=await context.newPage();await page.goto(root+'/options.html?guide=1#models');
 for(let i=0;i<6;i++)await page.getByRole('button',{name:'下一步',exact:true}).click();
 await page.getByRole('button',{name:'去添加模型服务',exact:true}).click();
 const picker=page.getByRole('dialog').filter({has:page.getByRole('button',{name:/自定义兼容服务/})});await picker.waitFor();
 await page.keyboard.press('Escape');await picker.waitFor({state:'hidden'});
 await page.getByRole('button',{name:'通用',exact:true}).click();await page.getByRole('button',{name:'模型',exact:true}).click();
 assert.equal(await page.getByRole('dialog').count(),0,'returning to Models must not replay add-provider request');
 await page.evaluate(async()=>{const t=await import('/bugfix-test.js');t.showTestError();});
 await page.getByText('自动消失测试',{exact:true}).waitFor();await page.getByText('自动消失测试',{exact:true}).waitFor({state:'hidden',timeout:8000});
 console.log('PASS model navigation after setup; error toast auto-dismiss');
 await context.route('http://model.test/v1/chat/completions',async route=>{
  calls++;const body=route.request().postDataJSON();assert.match(JSON.stringify(body),/禁止引用编号/);
  const content=[{id:'gist',content:'一句简短摘要。[^s1]'},{id:'keywords',content:['图学习[^s1]','**图学习**','LLM agents','上下文学习[s1]']},{id:'summary',content:{question:'问题',method:'方法',data:'未报告',results:'结果',limits:'局限'}},{id:'points',content:['要点[^s1]']}].map(JSON.stringify).join('\n');
  await route.fulfill({contentType:'text/event-stream',body:`data: ${JSON.stringify({choices:[{delta:{content},finish_reason:'stop'}],usage:{prompt_tokens:100,completion_tokens:100}})}\n\ndata: [DONE]\n\n`});
 });
 const result=await page.evaluate(async()=>{
  const t=await import('/bugfix-test.js');const db=new t.LibraryDatabase();const native=await db.open();
  const ref={documentId:'shared-paper',fileVersion:'v1'};
  const item={id:'shared-item',documentId:ref.documentId,document:ref,inLibrary:true,title:'Shared paper',authors:['Author'],tagIds:[],revision:'r0'};
  const tx=native.transaction(['documents','libraryItems','meta'],'readwrite');
  tx.objectStore('documents').put({id:ref.documentId,documentId:ref.documentId,fileVersion:'v1',file:{availability:'local'}});tx.objectStore('libraryItems').put(item);
  const model={...t.newModel('endpoint',{modelId:'fixture',label:'Fixture',reasoning:{kind:'none'},contextWindow:32768,maxOutputTokens:4096},'now'),id:'model'};
  tx.objectStore('meta').put({key:'modelSettings-v1',value:{view:{...t.emptySettings,revision:'test',endpoints:[{id:'endpoint',name:'HTTP fixture',baseUrl:'http://model.test/v1',protocol:'openai-chat',hasKey:false}],models:[model],defaultModelId:model.id},keys:{}}});
  await new Promise((ok,no)=>{tx.oncomplete=ok;tx.onabort=()=>no(tx.error);});
  const paper={...ref,version:'fixture',sentences:[{id:'s1',source:'Graph learning solves the prediction task.',kind:'text',anchor:{pages:[{pageIndex:0,rects:[{x:0,y:0,width:10,height:10}]}]}}],warnings:[]};
  const a=new t.ResearchService(ref,async()=>paper,t.DEFAULT_PREFERENCES,true),b=new t.ResearchService(ref,async()=>paper,t.DEFAULT_PREFERENCES,true);
  await Promise.all([a.load(),b.load()]);await Promise.all([a.overview(),b.overview()]);
  const stored=await a.store.read(a.key),first=await db.getItem(item.id);
  await Promise.all([a.dispose(),b.dispose()]);
  const c=new t.ResearchService(ref,async()=>paper,t.DEFAULT_PREFERENCES,true);await c.load();await c.overview();await c.dispose();
  const tags=await new Promise(ok=>{const r=native.transaction('libraryTags').objectStore('libraryTags').getAll();r.onsuccess=()=>ok(r.result.map(t=>t.label));});
  // Reading notes include formula Markdown and an immutable local image reference.
  const notes=new t.NoteDatabase(),hash='a'.repeat(64),image=new Uint8Array([137,80,78,71]);
  await notes.files.put({id:'note-image:'+hash,blob:new Blob([image],{type:'image/png'}),sha256:hash,createdAt:'now'});
  await notes.writeNote(ref,'',{format:'paperpane-markdown',schemaVersion:1,markdown:'# 阅读笔记\n\n公式 $x^2$\n\n![图](paperpane-asset:'+hash+')'});
  const blob=await t.exportNotes([first]),again=await t.exportNotes([first]);
  const files=t.unzipSync(new Uint8Array(await blob.arrayBuffer()));
  const md=t.strFromU8(files[Object.keys(files).find(k=>k.endsWith('/notes.md'))]);
  const stable=Array.from(new Uint8Array(await blob.arrayBuffer())).join(',')===Array.from(new Uint8Array(await again.arrayBuffer())).join(',');
  // Exercise actual Zotero export, failure recovery and conditional update through a fixture client.
  const remote=new Map();let uploads=0,fail=true;const reports=[];
  const client={userId:'fixture',async item(key){const item=remote.get(key);if(!item)throw new t.ZoteroError(404,'missing');return structuredClone(item);},async save(data){const item={key:data.key,version:(remote.get(data.key)?.version??0)+1,data:structuredClone(data)};remote.set(data.key,item);return structuredClone(item);},async upload(key,blob){uploads++;const attachment=remote.get(key);attachment.data.md5=t.md5(new Uint8Array(await blob.arrayBuffer()));attachment.version++;if(fail){fail=false;throw new Error('lost registration response');}}};
  // Keep the PDF attachment unchanged; the interrupted upload belongs to the notes ZIP.
  const docTx=native.transaction('documents','readwrite');docTx.objectStore('documents').put({id:ref.documentId,documentId:ref.documentId,fileVersion:'v1',file:{availability:'local',assetId:'pdf-fixture',sha256:'fixture'},originalFilename:'paper.pdf'});await new Promise(ok=>docTx.oncomplete=ok);
  await notes.files.put({id:'pdf-fixture',blob:new Blob(['%PDF-1.7 fixture']),sha256:'fixture',createdAt:'now'});
  // Existing PDF attachment skips an upload so the interrupted request is the notes ZIP.
  const mapTx=native.transaction('meta','readwrite');mapTx.objectStore('meta').put({key:'zotero-map:fixture:'+item.id,value:{itemKey:'PARENT01',version:1,attachmentKey:'PDF00001',attachmentVersion:1,fileHash:'fixture',uploaded:true,collections:[]}});await new Promise(ok=>mapTx.oncomplete=ok);
  remote.set('PARENT01',{key:'PARENT01',version:1,data:{itemType:'journalArticle',tags:[],collections:[]}});remote.set('PDF00001',{key:'PDF00001',version:1,data:{itemType:'attachment',parentItem:'PARENT01'}});
  for(let i=0;i<3;i++)await t.exportZotero(client,[item.id],null,new AbortController().signal,r=>reports.push(r));
  await notes.close();await db.close();
  return {runs:stored.overviews.length,abstract:first.abstract,tags,md,files:Object.keys(files),stable,reports,uploads,attachments:[...remote.values()].filter(i=>i.data.filename==='Paperpane-notes.zip').length};
 });
 assert.equal(calls,1,'two concurrent owners and reopening must share one model call');assert.equal(result.runs,1);assert.equal(result.abstract,'一句简短摘要。');assert.deepEqual(result.tags.sort(),['图学习','LLM agents','上下文学习'].sort());
 assert.match(result.md,/公式 \$x\^2\$/);assert.match(result.md,/assets\/a+\.png/);assert.doesNotMatch(result.md,/paperpane-asset:/);assert.equal(result.files.length,2);assert(result.stable);
 assert.deepEqual(result.reports.map(r=>r.ok),[false,true,true],JSON.stringify(result.reports));assert.equal(result.uploads,1);assert.equal(result.attachments,1);
 console.log('PASS one HTTP overview request across concurrent owners/reopen; persisted summary and normalized tags; portable Markdown/images; Zotero note attachment retry without duplicate upload');
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);const sheet=pdf.addPage([400,500]);sheet.drawText('Automatic library overview fixture',{x:30,y:400,size:14,font});sheet.drawText('We study graph learning and report improved prediction.',{x:30,y:350,size:10,font});
 const library=await context.newPage();await library.goto(root+'/library.html');
 await library.locator('input[type=file][accept*=pdf]').setInputFiles({name:'automatic.pdf',mimeType:'application/pdf',buffer:Buffer.from(await pdf.save())});
 for(let attempt=0;attempt<100;attempt++){
  const ready=await library.evaluate(async()=>{const t=await import('/bugfix-test.js'),db=new t.LibraryDatabase();try{const native=await db.open();return await new Promise(ok=>{const r=native.transaction('libraryItems').objectStore('libraryItems').getAll();r.onsuccess=()=>ok(r.result.some(item=>item.id!=='shared-item'&&item.abstract==='一句简短摘要。'&&item.tagIds.length===3));});}finally{await db.close();}});
  if(ready)break;
  await new Promise(ok=>setTimeout(ok,200));
 }


 const imported=await library.evaluate(async()=>{const t=await import('/bugfix-test.js'),db=new t.LibraryDatabase();try{const native=await db.open();return await new Promise(ok=>{const r=native.transaction('libraryItems').objectStore('libraryItems').getAll();r.onsuccess=()=>ok(r.result.find(item=>item.id!=='shared-item'));});}finally{await db.close();}});
 assert.equal(imported.abstract,'一句简短摘要。');assert.equal(imported.tagIds.length,3);
 assert.equal(calls,2,'newly imported PDF generates its overview without opening the reader');
 const reader=await context.newPage();await reader.goto(root+'/reader.html?item='+imported.id);await reader.locator('.textLayer span').first().waitFor();await reader.getByText('一句简短摘要。',{exact:false}).first().waitFor();assert.equal(calls,2,'reader reuses the automatically generated overview');
 console.log('PASS real PDF import automatically generates metadata, and reader reuses it');

 await page.screenshot({path:out+'/settings.png'});
 assert.deepEqual(errors,[]);await writeFile(out+'/results.json',JSON.stringify({calls,...result},null,2));
}finally{await context.close();}
