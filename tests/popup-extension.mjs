import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const {chromium}=await import(process.env.PAPERPANE_PLAYWRIGHT_MODULE?pathToFileURL(process.env.PAPERPANE_PLAYWRIGHT_MODULE).href:'playwright');
const out=resolve('backups/popup-validation');await mkdir(out,{recursive:true});
const pdf=await readFile(process.env.PAPERPANE_TEST_PDF??resolve('backups/arxiv-validation/1706.03762.pdf'));
let apiRequests=0;
const server=http.createServer((req,res)=>{
  if(req.url.startsWith('/v1'))apiRequests++;
  if(req.url==='/paper.pdf'){res.writeHead(200,{'Content-Type':'application/pdf','Content-Length':pdf.length});res.end(pdf);}
  else{res.writeHead(200,{'Content-Type':'text/html'});res.end('<html><head><title>Paper site</title></head><body><h1>Paper site</h1><a href="/paper.pdf">PDF</a></body></html>');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const extension=resolve('.output/chrome-mv3');
async function chunkContaining(pattern){for(const file of await readdir(resolve(extension,'chunks')))if(file.endsWith('.js')&&pattern.test(await readFile(resolve(extension,'chunks',file),'utf8')))return file;throw new Error('Missing shared module '+pattern);}
const modelChunk=await chunkContaining(/async resolveConnection\(/),libraryChunk=await chunkContaining(/async getItemForDocument\(/);
const context=await chromium.launchPersistentContext(resolve('browser-profiles/popup-validation-'+Date.now()),{executablePath:process.env.PAPERPANE_CHROMIUM,headless:true,viewport:{width:1600,height:1000},ignoreDefaultArgs:['--disable-extensions'],args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
await context.addInitScript(()=>{
  const get=IDBObjectStore.prototype.get;
  IDBObjectStore.prototype.get=function(key){if(this.name==='meta'&&key==='modelSettings-v1'&&globalThis.__failModelReads)throw new Error('simulated model read failure');return get.call(this,key);};
});
const errors=[];context.on('page',page=>page.on('pageerror',e=>errors.push(e.message)));
try{
  const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');
  const root=`chrome-extension://${new URL(worker.url()).host}`;
  const popup=await context.newPage();await popup.goto(root+'/popup.html');
  await popup.getByText('当前在纸间中',{exact:true}).waitFor();
  await popup.getByText('还没有最近阅读记录',{exact:true}).waitFor();
  await popup.getByText('还没有配置模型',{exact:true}).waitFor();
  await popup.getByText('数据仅保存在本机',{exact:true}).waitFor();
  const web=await context.newPage();await web.goto(base+'/links');
  await popup.getByRole('button',{name:'在纸间中打开',exact:true}).waitFor();
  const created=context.waitForEvent('page');
  // A background extension tab stands in for the native popup without changing the active web tab.
  await popup.getByRole('button',{name:'在纸间中打开',exact:true}).evaluate(el=>el.click());
  const reader=await created;
  await reader.waitForURL(url=>url.searchParams.has('documentId'),{timeout:30000});
  await reader.locator('.textLayer span').first().waitFor({timeout:30000});
  await popup.getByText('正在纸间中阅读',{exact:true}).waitFor();
  await reader.close();await web.bringToFront();
  await popup.getByText('已在文献库',{exact:true}).waitFor();
  console.log('PASS: real active tab classification, empty state, popup PDF open and library membership');

  const libraryUrl=`${root}/chunks/${libraryChunk}`;
  await popup.evaluate(async chunk=>{
    const module=await import(chunk),Database=Object.values(module).find(v=>typeof v==='function'&&v.prototype?.getItemForDocument);
    const db=new Database();const[doc]=await db.list();const item=await db.getItemForDocument(doc.id);
    await db.update(item.id,item.revision,{title:'Edited recent paper title'});
    await db.recordReading({documentId:doc.id,fileVersion:doc.fileVersion},{pageIndex:3,offset:0,zoom:1,rotation:0});
    await db.close();const c=new BroadcastChannel('paperpane-documents');c.postMessage('changed');c.close();
  },libraryUrl);
  await popup.getByRole('button',{name:/Edited recent paper title/}).waitFor();
  await popup.getByText(/读到 20%/).waitFor();
  const membership=async value=>popup.evaluate(async({chunk,value})=>{const m=await import(chunk),D=Object.values(m).find(v=>typeof v==='function'&&v.prototype?.getItemForDocument);const db=new D();const[d]=await db.list();const i=await db.getItemForDocument(d.id);await db.membership([i.id],value);await db.close();const c=new BroadcastChannel('paperpane-documents');c.postMessage('changed');c.close();},{chunk:libraryUrl,value});
  await membership(false);await popup.getByText('已在文献库',{exact:true}).waitFor({state:'detached'});
  await membership(true);await popup.getByText('已在文献库',{exact:true}).waitFor();
  console.log('PASS: live recent reading uses edited library title, actual progress and updated membership');

  const modelUrl=`${root}/chunks/${modelChunk}`;
  async function saveModel(kind){return popup.evaluate(async({chunk,base,kind})=>{
    const m=await import(chunk),D=Object.values(m).find(v=>typeof v==='function'&&v.prototype?.resolveConnection);const db=new D();const view=await db.view();
    const draft={...view,endpoints:[{id:'test-api',name:'Test API',baseUrl:base+'/v1',protocol:'openai-chat',hadKey:false,key:{kind:'clear'}}],models:[{id:'test-model',endpointId:'test-api',modelId:'test-id',label:'Popup test model',vision:false,reasoning:{kind:'none'},showInDiscussion:true}],defaultModelId:kind==='no-default'?null:'test-model',sync:{...view.sync,enabled:kind==='sync',webdavUrl:base,hadPassword:false,password:{kind:'keep'}}};
    const result=await db.save(draft,view.revision);await db.close();if(!result.ok)throw new Error(JSON.stringify(result));const c=new BroadcastChannel('paperpane-model-settings');c.postMessage('changed');c.close();
  },{chunk:modelUrl,base,kind});}
  await saveModel('configured');await popup.getByText('模型已配置 · Popup test model',{exact:true}).waitFor();
  await saveModel('no-default');await popup.getByText('模型已配置 · Popup test model',{exact:true}).waitFor();
  await saveModel('sync');await popup.getByText('数据仅保存在本机',{exact:true}).waitFor();
  await popup.getByText('模型已配置 · Popup test model',{exact:true}).waitFor();
  assert.equal(apiRequests,0,'opening the popup must not send an API health-check or paid request');
  console.log('PASS: committed model settings, model fallback and honest sync capability update live');

  await popup.evaluate(()=>{globalThis.__failModelReads=true;const c=new BroadcastChannel('paperpane-model-settings');c.postMessage('changed');c.close();});
  await popup.getByText('模型配置读取失败',{exact:true}).waitFor();await popup.getByText('数据仅保存在本机',{exact:true}).waitFor();
  assert.equal(await popup.getByText('还没有配置模型',{exact:true}).count(),0);
  await popup.evaluate(()=>{globalThis.__failModelReads=false;const c=new BroadcastChannel('paperpane-model-settings');c.postMessage('changed');c.close();});
  await popup.getByText('模型已配置 · Popup test model',{exact:true}).waitFor();
  assert.equal(await popup.getByText('模型设置读取失败。',{exact:true}).count(),0);
  console.log('PASS: read failure is distinct from unconfigured and clears on recovery');
  const syncState=async phase=>popup.evaluate(async phase=>{const db=await new Promise(ok=>{const r=indexedDB.open('paperpane');r.onsuccess=()=>ok(r.result);});await new Promise(ok=>{const tx=db.transaction('meta','readwrite'),s=tx.objectStore('meta');s.put({key:'transfer-connections',value:{dav:{url:'https://dav.test/',username:'fixture',hasPassword:true,automatic:false,conditional:true}}});s.put({key:'transfer-sync-state',value:{phase,lastSuccess:phase==='success'?new Date().toISOString():undefined}});tx.oncomplete=ok;});db.close();const c=new BroadcastChannel('paperpane-transfer');c.postMessage('changed');c.close();},phase);
  await syncState('running');await popup.getByText('同步中…',{exact:true}).waitFor();
  await syncState('success');await popup.getByText(/^已同步 · /).waitFor();
  await syncState('failed');await popup.getByText('同步失败',{exact:true}).waitFor();
  await popup.getByText('模型已配置 · Popup test model',{exact:true}).waitFor();
  console.log('PASS: actual persisted sync running/success/failure update independently of model status');


  await popup.evaluate(()=>{
    const send=chrome.runtime.sendMessage.bind(chrome.runtime);
    globalThis.__heldReplies=[];globalThis.__holdTabReads=true;
    chrome.runtime.sendMessage=async(...args)=>{
      const result=await send(...args);
      if(args[0]?.type==='GET_PDF_STATE'&&globalThis.__holdTabReads){await new Promise(resolve=>globalThis.__heldReplies.push(resolve));}
      return result;
    };
    globalThis.__restoreMessages=()=>{chrome.runtime.sendMessage=send;};
  });
  const racing=await context.newPage();await racing.goto(base+'/race');
  await popup.waitForFunction(()=>globalThis.__heldReplies.length>0);
  await popup.evaluate(()=>{globalThis.__holdTabReads=false;});
  await racing.evaluate(()=>{document.title='New tab title during pending read';});
  await popup.locator('.pp-popup__tab-title').filter({hasText:'New tab title during pending read'}).waitFor({timeout:10000});
  await popup.evaluate(async()=>{for(const release of globalThis.__heldReplies)release();await new Promise(resolve=>setTimeout(resolve,100));globalThis.__restoreMessages();});
  assert.equal(await popup.locator('.pp-popup__tab-title').textContent(),'New tab title during pending read');
  console.log('PASS: tab updates invalidate pending reads; delayed old replies cannot overwrite new state');
  await popup.locator('.pp-popup').screenshot({path:resolve(out,'popup-live.png')});
  const recentOpened=context.waitForEvent('page');
  await popup.getByRole('button',{name:/Edited recent paper title/}).evaluate(el=>el.click());
  const recentReader=await recentOpened;await recentReader.locator('.textLayer span').first().waitFor({timeout:30000});
  assert.ok(new URL(recentReader.url()).searchParams.get('documentId'));
  console.log('PASS: recent-paper action opens its actual saved document');
  assert.deepEqual(errors,[]);
}finally{await context.close();await new Promise(resolve=>server.close(resolve));}
