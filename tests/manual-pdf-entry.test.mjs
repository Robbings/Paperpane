import test from 'node:test';
import assert from 'node:assert/strict';
import { completedPdfUrl } from '../src/browser-entry/pdf.ts';
test('only a completed matching top-level PDF observation enables import',()=>{
 const tab={url:'https://papers.test/paper.pdf',status:'complete'};
 const known={pageUrl:tab.url,pdfUrl:tab.url,direct:true,completed:true};
 assert.equal(completedPdfUrl(tab,known),tab.url);
 for(const value of [undefined,{...known,completed:false},{...known,direct:false},{...known,pageUrl:'https://other.test/p.pdf'}])assert.equal(completedPdfUrl(tab,value),undefined);
 assert.equal(completedPdfUrl({...tab,status:'loading'},known),undefined);
 assert.equal(completedPdfUrl({...tab,pendingUrl:'https://papers.test/verify'},known),undefined);
 assert.equal(completedPdfUrl(tab,undefined),undefined);
});
import { build } from 'esbuild';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
test('background enables only observed completed PDFs and rejects old page entrypoints',async()=>{
 const handlers={},store={},tab={id:7,url:'https://papers.test/p.pdf',status:'complete'};const created=[];
 const event=name=>({addListener:fn=>{handlers[name]=fn}});
 globalThis.__manualBrowser={runtime:{id:'test',getURL:path=>'chrome-extension://test'+path,onMessage:event('message')},
 storage:{session:{get:async key=>({[key]:store[key]}),set:async values=>Object.assign(store,values),remove:async key=>{delete store[key]}},local:{get:async()=>({})}},
 action:{setBadgeText:async()=>{}},tabs:{get:async()=>({...tab}),create:async value=>created.push(value),update:async()=>{throw Error('Unexpected auto redirect')},onUpdated:event('updated'),onRemoved:event('removed')},
 scripting:{executeScript:async()=>[]},
 webRequest:Object.fromEntries(['onBeforeRequest','onHeadersReceived','onCompleted','onErrorOccurred'].map(name=>[name,event(name)]))};
 const output=resolve('backups/tests/manual-background.mjs');
 await build({entryPoints:['src/browser-entry/background.ts'],outfile:output,bundle:true,platform:'node',format:'esm',plugins:[{name:'browser-mock',setup(b){b.onResolve({filter:/^wxt\/browser$/},()=>({path:'browser',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const browser=globalThis.__manualBrowser'}));}}]});
 const {installBrowserEntry}=await import(pathToFileURL(output));installBrowserEntry();
 const sender={id:'test',url:'chrome-extension://test/popup.html'};
 const message=(type,extra={},from=sender)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Message not handled: '+type)),200);handlers.message({type,tabId:7,...extra},from,value=>{clearTimeout(timer);resolve(value)});});
 const details={tabId:7,requestId:'one',url:tab.url,type:'main_frame',statusCode:200,responseHeaders:[{name:'Content-Type',value:'application/pdf'}]};
 assert.equal((await message('GET_PDF_STATE')).value.pdfUrl,undefined);
 handlers.onBeforeRequest(details);handlers.onHeadersReceived({...details,url:details.url+'#gsr=0'});
 assert.equal((await message('GET_PDF_STATE')).value.pdfUrl,undefined);
 handlers.onCompleted(details);assert.equal((await message('GET_PDF_STATE')).value.pdfUrl,tab.url);
 await message('OPEN_TAB_PDF');assert.equal(created.length,1);
 assert.equal((await message('OPEN_CURRENT_PDF',{}, {id:'test',url:tab.url,frameId:0,tab:{id:7}})).ok,true);assert.equal(created.length,2);
 assert.equal((await message('OPEN_CURRENT_PDF',{}, {id:'test',url:'https://evil.test/',frameId:0,tab:{id:7}})).ok,false);
 // Another reader's iframe may stay loading after the top-level PDF completed.
 globalThis.__manualBrowser.scripting.executeScript=async()=>[{result:true}];tab.status='loading';
 assert.equal((await message('GET_PDF_STATE')).value.pdfUrl,tab.url);
 tab.pendingUrl='https://papers.test/other';assert.equal((await message('GET_PDF_STATE')).value.pdfUrl,undefined);
 delete tab.pendingUrl;tab.status='complete';globalThis.__manualBrowser.scripting.executeScript=async()=>[];
 handlers.onBeforeRequest({...details,requestId:'two'});handlers.onHeadersReceived({...details,requestId:'two',statusCode:429});handlers.onCompleted({...details,requestId:'two'});
 assert.equal((await message('GET_PDF_STATE')).value.pdfUrl,undefined);
 assert.equal((await message('OPEN_TAB_PDF')).ok,false);
 assert.equal((await message('OPEN_PDF',{pdfUrl:tab.url},{id:'test',url:tab.url,tab:{id:7}})).ok,false);
 delete globalThis.__manualBrowser;
});
