import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {mkdir} from 'node:fs/promises';
const require=createRequire(import.meta.url),viteRequire=createRequire(require.resolve('vite'));
const {build}=await import('esbuild');
await mkdir('backups/tests',{recursive:true});
const output=resolve('backups/tests/transfer-store.mjs');
await build({entryPoints:['src/data/transfer-store.ts'],outfile:output,bundle:true,platform:'node',format:'esm',alias:{'@':resolve('src')}});
const {TransferStore}=await import(pathToFileURL(output));
globalThis.IDBKeyRange=IDBKeyRange;
const request=r=>new Promise((ok,no)=>{r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});
const finish=tx=>new Promise((ok,no)=>{tx.oncomplete=ok;tx.onabort=()=>no(tx.error)});
async function seed(store,rows){const db=await store.open();const tx=db.transaction(Object.keys(rows),'readwrite');for(const [name,values]of Object.entries(rows))for(const value of values)tx.objectStore(name).put(value);await finish(tx);}
function fresh(){globalThis.indexedDB=new IDBFactory();return new TransferStore();}
test('一致快照保留研究内容，排除设备身份、密钥和缓存',async()=>{
 const db=fresh();await seed(db,{meta:[{key:'deviceId',value:'private-device'},{key:'ai-v1:doc:version',value:{text:'研究结果'}},{key:'formula-plan:x',value:{count:3}},{key:'modelSettings-v1',value:{keys:{secret:'never-export'},view:{endpoints:[{id:'api',hasKey:true}],sync:{hasPassword:true,password:'secret'}}}}],cache:[{key:'cache',value:'discard'}]});
 const snapshot=await db.snapshot();const meta=snapshot.databases[0].stores.meta;assert.ok(meta.find(r=>r.key==='ai-v1:doc:version'));assert.ok(meta.find(r=>r.key==='formula-plan:x'));assert.equal(meta.find(r=>r.key==='deviceId'),undefined);assert.doesNotMatch(JSON.stringify(snapshot),/never-export/);assert.equal(snapshot.databases[0].stores.cache,undefined);await db.close();
});
test('合并恢复自动保存双方版本，可只切换有差异的字段',async()=>{
 const db=fresh();await seed(db,{libraryFolders:[{id:'folder',name:'本机目录',parentId:null}]});
 const snapshot={format:'paperpane-backup',version:1,id:'backup',createdAt:new Date().toISOString(),complete:true,databases:[{name:'paperpane',version:3,stores:{libraryFolders:[{id:'folder',name:'远程目录',parentId:null}]}}],assets:[],preferences:{}};
 const result=await db.restore(snapshot);assert.equal(result.conflicts,0);const versions=await db.versions();assert.ok(versions.some(v=>v.value==='本机目录'));const remote=versions.find(v=>v.value==='远程目录');await db.useVersion(remote.id,remote.current);
 const native=await db.open();assert.equal((await request(native.transaction('libraryFolders').objectStore('libraryFolders').get('folder'))).name,'远程目录');await db.close();
});
test('未知表恢复失败且原库完整',async()=>{const db=fresh();await seed(db,{libraryFolders:[{id:'original',name:'保留'}]});await assert.rejects(()=>db.restore({databases:[{name:'paperpane',version:3,stores:{unknown:[]}}]}));const native=await db.open();assert.equal((await request(native.transaction('libraryFolders').objectStore('libraryFolders').getAll())).length,1);await db.close();});

test('查看版本后继续编辑，刷新当前差异即可重试，不要求重新同步',async()=>{
 const db=fresh();await seed(db,{libraryFolders:[{id:'folder',name:'初稿'}]});
 const snapshot={format:'paperpane-backup',version:3,id:'cas',createdAt:new Date().toISOString(),complete:true,databases:[{name:'paperpane',version:3,stores:{libraryFolders:[{id:'folder',name:'远程'}]}}],assets:[],preferences:{}};
 await db.restore(snapshot);const remote=(await db.versions()).find(v=>v.value==='远程');
 await seed(db,{libraryFolders:[{id:'folder',name:'继续编辑'}]});
 assert.equal(await db.useVersion(remote.id,remote.current),'changed');
 const latest=(await db.versions()).find(v=>v.id===remote.id);assert.equal(latest.current,'继续编辑');
 assert.equal(await db.useVersion(latest.id,latest.current),'applied');
 const native=await db.open();assert.equal((await request(native.transaction('libraryFolders').objectStore('libraryFolders').get('folder'))).name,'远程');
 assert.ok((await db.versions()).some(v=>v.value==='继续编辑'));await db.close();
});
