import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readFile} from 'node:fs/promises';
import {PDFDocument,StandardFonts,PDFName,PDFArray} from 'pdf-lib';
const {chromium}=await import(pathToFileURL(process.env.PAPERPANE_PLAYWRIGHT_MODULE).href);
const extension=resolve('.output/chrome-mv3');
await build({stdin:{contents:`
import React from 'react';import {createRoot} from 'react-dom/client';
import {ElementOverlay} from './src/ai/layout/ElementOverlay';
import {ReaderSidebar} from './src/ui/reader/ReaderSidebar';
import {DEFAULT_PREFERENCES} from './src/ui/settings/types';
import './src/ui/reader/reader.css';
export {WebDavClient} from './src/sync/webdav-client';
export {ResearchService} from './src/ai/service';
export {ResearchStore} from './src/ai/store';
export {emptySettings} from './src/data/model-settings';
export {DEFAULT_PREFERENCES} from './src/ui/settings/types';
export {newModel} from './src/ai/model-catalog';
export {AnnotationSession} from './src/domain/annotations/session';
export {AnnotationDatabase} from './src/data/annotation-database';
export function mount(){
 document.body.innerHTML='<div id="test-host"></div><div id="paper" style="position:fixed;left:330px;top:80px;width:650px;height:600px;overflow:auto;background:#eee"><div id="figure" style="position:absolute;left:100px;top:200px;width:350px;height:200px;background:#ccc"></div></div>';
 const container=document.querySelector('#paper'),figure=document.querySelector('#figure');
 window.followupElements=[{id:'figure',kind:'picture',anchor:{},region:{box:[0,0,350,200]},page:{pageIndex:0}}];window.followupActions=[];
 const reader={translationScrollElement:()=>container,project:()=>({state:'ready',rects:[{rect:figure.getBoundingClientRect()}]}),subscribeProjection:()=>()=>{},elementAnchor:async()=>({}),captureAnchor:async()=>({blob:new Blob(['image'])})};
 createRoot(document.querySelector('#test-host')).render(<><div style={{height:500,width:280,position:'relative','--pp-gap':'12px'}}><ReaderSidebar open outline={Array.from({length:60},(_,i)=>({id:String(i),label:'Chapter '+i,level:0,pageIndex:i}))} pageCount={60} pageIndex={0} overlay={false} onNavigate={()=>{}}/></div><ElementOverlay reader={reader} document={{documentId:'figure',fileVersion:'v1'}} preferences={DEFAULT_PREFERENCES} onAction={async(value,action)=>{window.followupActions.push(action);}}/></>);
}
`,resolveDir:process.cwd(),loader:'tsx'},plugins:[{name:'fixtures',setup(b){b.onLoad({filter:/\/use-detection\.ts$/},()=>({contents:'export const useDetection=()=>window.followupElements;'}));b.onLoad({filter:/\/preprocess\.ts$/},()=>({contents:'export const useFormulaPreprocessing=()=>{};'}));b.onResolve({filter:/\?url$/},()=>({path:'worker',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export default "/pdf.worker.js";'}));}}],alias:{'@':resolve('src')},bundle:true,jsx:'automatic',platform:'browser',format:'esm',outfile:extension+'/followup-test.js'});
const ctx=await chromium.launchPersistentContext(resolve('browser-profiles/followup-'+Date.now()),{executablePath:process.env.PAPERPANE_CHROMIUM,headless:true,viewport:{width:1300,height:900},ignoreDefaultArgs:['--disable-extensions'],args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
try{
 const worker=ctx.serviceWorkers()[0]??await ctx.waitForEvent('serviceworker');const root='chrome-extension://'+new URL(worker.url()).host;
 await worker.evaluate(()=>chrome.storage.local.set({onboarding:{welcomed:true,guided:true}}));
 const page=await ctx.newPage();await page.goto(root+'/options.html');
 await page.addStyleTag({url:root+'/followup-test.css'});await page.evaluate(async()=>{const m=await import('/followup-test.js');m.mount();});
 const sidebar=page.getByRole('navigation',{name:'目录'});await sidebar.waitFor();assert.equal(await sidebar.evaluate(e=>getComputedStyle(e).scrollbarWidth),'none');
 const bar=page.locator('.pp-sidebar__scrollarea .pp-scrollarea__bar');assert.equal(await bar.getAttribute('data-visible'),'false');await sidebar.hover();await page.mouse.wheel(0,150);await page.waitForFunction(()=>document.querySelector('.pp-sidebar__scrollarea .pp-scrollarea__bar').dataset.visible==='true');await page.mouse.move(1200,850);await page.waitForFunction(()=>document.querySelector('.pp-sidebar__scrollarea .pp-scrollarea__bar').dataset.visible==='false');
 console.log('PASS outline native scrollbar hidden; overlay appears and auto-hides');
 await page.locator('#figure').hover();const ask=page.getByRole('toolbar',{name:'论文元素操作'}).getByRole('button',{name:'提问',exact:true});await ask.waitFor();const box=await ask.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+2,box.y+box.height/2+1);assert(await ask.isVisible());await page.mouse.up();await page.waitForFunction(()=>window.followupActions.includes('ask'));console.log('PASS picture toolbar click survives pointer movement with mouse held');
 // Use the actual reader and Markdown editor, with durable annotation fixtures.
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);pdf.addPage([400,500]).drawText('Followup annotation paper',{x:30,y:400,size:16,font});
 await ctx.route('https://papers.test/followup.pdf',r=>r.fulfill({contentType:'application/pdf',body:Buffer.from(pdf.saveBytes)}));
 pdf.saveBytes=await pdf.save();
 const reader=await ctx.newPage();await reader.goto(root+'/reader.html?import='+encodeURIComponent('https://papers.test/followup.pdf'));await reader.locator('.textLayer span').first().waitFor();
 async function seedComment(kind='selection-comment'){
  return reader.evaluate(async kind=>{const t=await import('/followup-test.js'),db=new t.AnnotationDatabase(),native=await db.open();const docs=await new Promise(ok=>{const r=native.transaction('documents').objectStore('documents').getAll();r.onsuccess=()=>ok(r.result);});const d=docs.find(x=>x.originalFilename?.includes('followup'))??docs[0],ref={documentId:d.id,fileVersion:d.fileVersion};const session=new t.AnnotationSession(db,ref);await session.refresh();const result=await session.create({kind,color:'yellow',selection:{text:'Followup',anchor:{...ref,pages:[{pageIndex:0,rects:[{x:30,y:398,width:100,height:20}]}]}}});if(!result.ok)throw Error(JSON.stringify(result));session.setLayouts([{id:result.value.id,open:true,collapsed:false,dx:0,dy:0,width:300,height:200,z:1}]);await session.flush();await session.dispose();await db.close();return result.value.id;},kind);
 }
 async function annotation(id){return reader.evaluate(async id=>{const t=await import('/followup-test.js'),db=new t.AnnotationDatabase(),native=await db.open();try{return await new Promise(ok=>{const r=native.transaction('annotations').objectStore('annotations').get(id);r.onsuccess=()=>ok(r.result);});}finally{await db.close();}},id);}
 for(const mode of ['empty','whitespace','text','image','highlight']){
  const id=await seedComment(mode==='highlight'?'highlight':'selection-comment');await reader.reload();await reader.locator('.pp-note [contenteditable=true]:visible').waitFor();
  const editor=reader.locator('.pp-note [contenteditable=true]:visible');if(mode==='text'){await editor.fill('Last words survive immediate close');}else if(mode==='whitespace'){await editor.fill(' ');}else if(mode==='image'){await reader.locator('.pp-note input[type=file]').setInputFiles({name:'pixel.png',mimeType:'image/png',buffer:Buffer.from(await reader.evaluate(async()=>{const c=new OffscreenCanvas(10,10);c.getContext('2d').fillRect(0,0,10,10);return [...new Uint8Array(await (await c.convertToBlob()).arrayBuffer())];}))});}
  await reader.getByRole('button',{name:'关闭旁注',exact:true}).click();await reader.locator('.pp-note').waitFor({state:'hidden'});
  await reader.waitForFunction(()=>!document.body.innerText.includes('正在保存'));await reader.waitForTimeout(300);
  const row=await annotation(id);if(await reader.getByText('批注未能保存',{exact:true}).filter({visible:true}).count())console.log('ANNOTATION FAILURE',mode,JSON.stringify(row),await reader.locator('body').innerText());assert.equal(await reader.getByText('批注未能保存',{exact:true}).filter({visible:true}).count(),0,mode);
  if(mode==='empty'||mode==='whitespace')assert(row.deletedAt,mode+' should be removed');else{assert(!row.deletedAt,mode+' should remain');if(mode==='text')assert.match(row.comment,/Last words survive immediate close/);if(mode==='image')assert.match(row.comment,/paperpane-asset:/);}
  await reader.reload();await reader.locator('.textLayer span').first().waitFor();assert.equal(await reader.getByText('批注未能保存',{exact:true}).filter({visible:true}).count(),0);
 }
 console.log('PASS actual reader blank/whitespace close, final text persistence, accepted image, highlight preservation, reload');
 const library=await ctx.newPage();await library.goto(root+'/library.html');await library.locator('input[type=file][accept*=pdf]').setInputFiles({name:'followup.pdf',mimeType:'application/pdf',buffer:Buffer.from(pdf.saveBytes)});await library.getByRole('checkbox',{name:/选择「/}).first().waitFor();await library.getByRole('checkbox',{name:'选择本页全部论文'}).check();await library.getByRole('toolbar',{name:'批量操作'}).getByRole('button',{name:'导出',exact:true}).click();const downloaded=library.waitForEvent('download');await library.getByRole('menuitem',{name:'下载 PDF',exact:true}).click();const download=await downloaded;assert.match(download.suggestedFilename(),/\.pdf$/);const downloadedPdf=await PDFDocument.load(await readFile(await download.path()));assert.equal(downloadedPdf.getPageCount(),1);assert(downloadedPdf.getPage(0).node.lookup(PDFName.of('Annots'),PDFArray).size()>0);console.log('PASS actual library PDF export menu and downloaded saved annotations');await library.close();await reader.close();
 // Exercise native-search request, citation persistence and global card settings through ResearchService.
 const requests=[];await ctx.route('https://model.test/v1/responses',async route=>{requests.push(route.request().postDataJSON());await route.fulfill({contentType:'application/json',body:JSON.stringify({status:'completed',output:[{type:'web_search_call',status:'completed'},{type:'message',content:[{type:'output_text',text:'Verified web answer.',annotations:[{type:'url_citation',title:'Example source',url:'https://example.org/evidence',end_index:19}]}]}]})});});
 const integration=await page.evaluate(async()=>{
  const t=await import('/followup-test.js'),store=new t.ResearchStore(),native=await store.open();
  const model={...t.newModel('endpoint',{modelId:'search-fixture',label:'Fixture',reasoning:{kind:'none'},contextWindow:32768,maxOutputTokens:4096},'now'),id:'model'};
  const tx=native.transaction('meta','readwrite');tx.objectStore('meta').put({key:'modelSettings-v1',value:{view:{...t.emptySettings,revision:'test',features:[{feature:'overview',enabled:false}],endpoints:[{id:'endpoint',name:'Fixture',baseUrl:'https://model.test/v1',protocol:'openai-responses',hasKey:false}],models:[model,{...model,id:'ordinary',label:'Ordinary',modelId:'ordinary',protocolOverride:'openai-chat'}],defaultModelId:model.id},keys:{}}});await new Promise(ok=>tx.oncomplete=ok);
  const ref={documentId:'search-paper',fileVersion:'v1'},paper={...ref,version:'fixture',sentences:[{id:'s1',source:'Paper evidence.',kind:'text',anchor:{...ref,pages:[{pageIndex:0,rects:[{x:0,y:0,width:10,height:10}]}]}}],warnings:[]};
  const a=new t.ResearchService(ref,async()=>paper,t.DEFAULT_PREFERENCES,true);await a.load();const sid=await a.ensureDiscussion();await a.setWebSearch(sid,true);await a.send(sid,{text:'Search current evidence',attachments:[]},null);
  while(a.record.sessions.find(x=>x.id===sid).messages.some(m=>['running','queued'].includes(m.generation?.state)))await new Promise(ok=>setTimeout(ok,20));
  await a.flush();const answer=a.record.sessions.find(x=>x.id===sid).messages.at(-1);await a.dispose();
  const b=new t.ResearchService(ref,async()=>paper,t.DEFAULT_PREFERENCES,true);await b.load();const enabled=b.record.sessions.find(x=>x.id===sid).webSearch;await b.changeModel(sid,'ordinary');const reset=b.record.sessions.find(x=>x.id===sid).webSearch;let rejected=false;try{await b.setWebSearch(sid,true);}catch{rejected=true;}
  // Invisible custom card avoids an extra generation request while testing durable template edits.
  const cards=[...b.record.cards,{id:'custom-followup',name:'Custom followup',prompt:'Brief answer',output:'markdown',visible:false}];await b.saveCards(cards);await b.dispose();
  const c=new t.ResearchService({documentId:'next-paper',fileVersion:'v1'},async()=>paper,t.DEFAULT_PREFERENCES,true);await c.load();const next=c.record.cards;const runs=c.record.overviews.length;await c.dispose();await store.close();return{answer,enabled,reset,rejected,next,runs};
 });
 assert.equal(integration.answer.generation.state,'completed',JSON.stringify(integration.answer.generation));assert.match(integration.answer.markdown,/https:\/\/example.org\/evidence/);assert(integration.enabled);assert.equal(integration.reset,false);assert(integration.rejected);assert(integration.next.some(c=>c.id==='custom-followup'));assert.equal(integration.runs,0);assert.equal(requests.filter(r=>r.tools?.[0]?.type==='web_search').length,1);console.log('PASS native web request, durable citations and switch, unsupported-model reset, custom overview across papers');
 const chat=await ctx.newPage();await chat.goto(root+'/reader.html?import='+encodeURIComponent('https://papers.test/followup.pdf'));await chat.getByRole('button',{name:'讨论',exact:true}).click();await chat.getByPlaceholder('就这篇论文提问').waitFor();assert.equal(await chat.getByRole('button',{name:'联网搜索',exact:true}).count(),0);console.log('PASS reader keeps web search entry hidden');await chat.close();
 if(process.env.PAPERPANE_DAV_PASSWORD){
  const result=await page.evaluate(async config=>{const {WebDavClient}=await import('/followup-test.js');return new WebDavClient(config).probe();},{url:process.env.PAPERPANE_DAV_URL,username:process.env.PAPERPANE_DAV_USERNAME,password:process.env.PAPERPANE_DAV_PASSWORD});
  assert.deepEqual(result,{readable:true,writable:true,conditional:false});console.log('PASS real browser OpenList write, redirected read, cleanup; unsafe sync remains disabled');
 }
}finally{await ctx.close();}
