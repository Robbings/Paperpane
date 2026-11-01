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
test('合并恢复不覆盖冲突，双方内容保留，处理冲突采用 CAS',async()=>{
 const db=fresh();await seed(db,{libraryFolders:[{id:'folder',name:'本机目录',parentId:null}]});
 const snapshot={format:'paperpane-backup',version:1,id:'backup',createdAt:new Date().toISOString(),complete:true,databases:[{name:'paperpane',version:3,stores:{libraryFolders:[{id:'folder',name:'远程目录',parentId:null}]}}],assets:[],preferences:{}};
 const result=await db.restore(snapshot);assert.equal(result.conflicts,1);const conflicts=await db.conflicts();assert.equal(conflicts[0].local.name,'本机目录');assert.equal(conflicts[0].remote.name,'远程目录');await db.resolveConflict(conflicts[0].id,'remote');assert.equal((await db.conflicts()).length,0);
 const native=await db.open();assert.equal((await request(native.transaction('libraryFolders').objectStore('libraryFolders').get('folder'))).name,'远程目录');await db.close();
});
test('未知表恢复失败且原库完整',async()=>{const db=fresh();await seed(db,{libraryFolders:[{id:'original',name:'保留'}]});await assert.rejects(()=>db.restore({databases:[{name:'paperpane',version:3,stores:{unknown:[]}}]}));const native=await db.open();assert.equal((await request(native.transaction('libraryFolders').objectStore('libraryFolders').getAll())).length,1);await db.close();});

test('冲突发生后再次编辑须重新读取，历史保留，恢复操作可继续',async()=>{
 const db=fresh();await seed(db,{libraryFolders:[{id:'folder',name:'初稿'}]});
 const snapshot={format:'paperpane-backup',version:1,id:'cas',createdAt:new Date().toISOString(),complete:true,databases:[{name:'paperpane',version:3,stores:{libraryFolders:[{id:'folder',name:'远程'}]}}],assets:[],preferences:{}};
 await db.restore(snapshot);const [conflict]=await db.conflicts();await seed(db,{libraryFolders:[{id:'folder',name:'继续编辑'}]});
 await assert.rejects(()=>db.resolveConflict(conflict.id,'remote'),/本机内容已变化/);await db.refreshConflict(conflict.id);assert.equal((await db.conflicts())[0].local.name,'继续编辑');await db.resolveConflict(conflict.id,'remote');
 const native=await db.open();assert.equal((await request(native.transaction('libraryFolders').objectStore('libraryFolders').get('folder'))).name,'远程');const history=await request(native.transaction('meta').objectStore('meta').getAll());assert.ok(history.some(r=>r.key.startsWith('transfer-history:')&&r.value.local.name==='继续编辑'));await db.close();
});
