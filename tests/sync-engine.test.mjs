import test from 'node:test';import assert from 'node:assert/strict';
import {build} from 'esbuild';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';import {mkdir} from 'node:fs/promises';
import {IDBFactory,IDBKeyRange} from 'fake-indexeddb';
await mkdir('backups/tests',{recursive:true});
await build({stdin:{contents:"export {synchronize} from './src/sync/engine';export {TransferStore} from './src/data/transfer-store';export {ConnectionStore} from './src/sync/settings';export {WebDavClient} from './src/sync/webdav-client';",resolveDir:process.cwd(),loader:'ts'},outfile:resolve('backups/tests/sync-engine.mjs'),bundle:true,platform:'node',format:'esm',alias:{'@':resolve('src')}});
const {synchronize,TransferStore,ConnectionStore,WebDavClient}=await import(pathToFileURL(resolve('backups/tests/sync-engine.mjs')));
globalThis.IDBKeyRange=IDBKeyRange;
const request=r=>new Promise((ok,no)=>{r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});
async function folder(store,row){const db=await store.open();const tx=db.transaction('libraryFolders','readwrite');tx.objectStore('libraryFolders').put({createdAt:'2026-10-31T00:00:00Z',...row});await new Promise((ok,no)=>{tx.oncomplete=ok;tx.onabort=no;});}
test('同步首次发布、不同字段合并、同字段冲突与选择远程后重试',async()=>{
 globalThis.indexedDB=new IDBFactory();const store=new TransferStore(),connections=new ConnectionStore();await connections.saveDav({url:'https://dav.test/',username:'u',password:'p'},true);
 const files=new Map();let version=0;
 const fetcher=async(url,options)=>{const path=new URL(url).pathname;if(options.method==='MKCOL')return new Response('',{status:201});
 if(options.method==='GET'){if(!files.has(path))return new Response('',{status:404});return new Response(files.get(path),{headers:{ETag:`"${version}"`}});}
 if(options.method==='PUT'){const match=options.headers.get('If-Match'),none=options.headers.get('If-None-Match');if(match&&match!==`"${version}"`||none==='*'&&files.has(path))return new Response('',{status:412});files.set(path,String(options.body));version++;return new Response('',{status:201,headers:{ETag:`"${version}"`}});}throw new Error('Unexpected request');};
 const client=new WebDavClient({url:'https://dav.test/',username:'u',password:'p'},fetcher),options={store,connections,client},signal=new AbortController().signal;
 await folder(store,{id:'folder',name:'old',parentId:null});await folder(store,{id:'independent',name:'original',parentId:null});await synchronize(signal,options);assert.equal((await connections.status()).phase,'success');
 let manifest=JSON.parse(files.get('/paperpane/manifest.json'));const key=Object.keys(manifest.records).find(k=>k.endsWith('/folder'));const independent=Object.keys(manifest.records).find(k=>k.endsWith('/independent'));manifest.records[key].note='remote';files.set('/paperpane/manifest.json',JSON.stringify(manifest));version++;
 await folder(store,{id:'folder',name:'local',parentId:null});await synchronize(signal,options);const db=await store.open();const merged=await request(db.transaction('libraryFolders').objectStore('libraryFolders').get('folder'));assert.equal(merged.name,'local');assert.equal(merged.note,'remote');
 manifest=JSON.parse(files.get('/paperpane/manifest.json'));manifest.records[key].name='remote conflict';manifest.records[independent].name='independent remote update';files.set('/paperpane/manifest.json',JSON.stringify(manifest));version++;
 await folder(store,{...merged,name:'local conflict'});await synchronize(signal,options);assert.equal((await connections.status()).phase,'success');const versions=await store.versions();const remoteVersion=versions.find(v=>v.value==='remote conflict');assert.ok(remoteVersion);assert.ok(versions.some(v=>v.value==='local conflict'));await store.useVersion(remoteVersion.id,remoteVersion.current);await synchronize(signal,options);assert.equal((await connections.status()).phase,'success');assert.equal(JSON.parse(files.get('/paperpane/manifest.json')).records[key].name,'remote conflict');assert.equal(JSON.parse(files.get('/paperpane/manifest.json')).records[independent].name,'independent remote update');await store.close();await connections.close();
});
