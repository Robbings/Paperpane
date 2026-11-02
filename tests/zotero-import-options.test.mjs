import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {IDBFactory,IDBKeyRange} from 'fake-indexeddb';
import {zipSync} from 'fflate';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
await mkdir('backups/tests',{recursive:true});
const out=resolve('backups/tests/zotero-import-options.mjs');
await build({stdin:{contents:`export {ZoteroMappings} from './src/data/zotero-mappings'; export {ZoteroClient} from './src/zotero/client'; export {collectionPlan,collectionLabels} from './src/zotero/catalog'; export {zoteroArchiveNames} from './src/zotero/webdav-discovery'; export {WebDavClient} from './src/sync/webdav-client'; export {decodeZoteroArchive} from './src/zotero/archive'; export {zipDirectory,zipPdfNames} from './src/zotero/archive-names'; export {discoveryCatalog} from './src/zotero/discovery-catalog'; export {TransferStore} from './src/data/transfer-store'; export {createBackup,inspectBackup} from './src/transfer/backup';`,resolveDir:process.cwd(),loader:'ts'},outfile:out,bundle:true,platform:'node',format:'esm',alias:{'@':resolve('src')},plugins:[{name:'browser',setup(b){b.onResolve({filter:/^wxt\/browser$/},()=>({path:'browser',namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:'export const browser={runtime:{getURL:p=>p}}'}));}}]});
const {ZoteroMappings,ZoteroClient,collectionPlan,collectionLabels,zoteroArchiveNames,WebDavClient,decodeZoteroArchive,zipDirectory,zipPdfNames,discoveryCatalog,TransferStore,createBackup,inspectBackup}=await import(pathToFileURL(out));
globalThis.IDBKeyRange=IDBKeyRange;
const collections=[{key:'ROOT0001',data:{name:'机器学习',parentCollection:false}},{key:'CHILD001',data:{name:'注意力',parentCollection:'ROOT0001'}},{key:'OTHER001',data:{name:'精读',parentCollection:false}}];
const query={collection:{kind:'all'},text:'',fields:['title'],tagIds:[],sort:{column:'title',direction:'asc'}};
const makeItems=n=>Array.from({length:n},(_,i)=>({key:'P'+String(i).padStart(7,'0'),version:1,data:{itemType:'journalArticle',title:'论文 '+i,collections:['CHILD001','OTHER001']}}));
const request=r=>new Promise((ok,no)=>{r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});
async function seed(db,name,row){const tx=(await db.open()).transaction(name,'readwrite');tx.objectStore(name).put(row);await new Promise((ok,no)=>{tx.oncomplete=ok;tx.onabort=()=>no(tx.error)});}
async function libraryItem(db){await db.importBibliography([{title:'论文',authors:[],source:'web',bibliographyKey:'fixture'}],null);return db.imported('fixture');}

test('全选跨越 50 条分页，携带当前搜索和分类，筛掉笔记',async()=>{
 const rows=makeItems(121);rows[50].data.itemType='note';const calls=[];
 const client=new ZoteroClient('selection','123',async url=>{const u=new URL(url);calls.push(u);const start=Number(u.searchParams.get('start'));return Response.json(rows.slice(start,start+50),{headers:{'Total-Results':'121'}})});
 const selected=await client.allItems({collection:'CHILD001',text:'attention'});
 assert.equal(selected.length,120);assert.equal(new Set(selected.map(r=>r.key)).size,120);assert.deepEqual(calls.map(u=>u.searchParams.get('start')),['0','50','100']);assert.ok(calls.every(u=>u.pathname.includes('/collections/CHILD001/')&&u.searchParams.get('q')==='attention'));
});
test('全选取消不再请求下一页，分页失败不返回半份选择',async()=>{
 let calls=0;const abort=new AbortController(),client=new ZoteroClient('cancel-selection','123',async()=>{calls++;return Response.json(makeItems(50),{headers:{'Total-Results':'100'}})});
 await assert.rejects(()=>client.allItems({},abort.signal,()=>abort.abort()),e=>e.name==='AbortError');assert.equal(calls,1);
 let n=0;const failed=new ZoteroClient('failed-selection','123',async()=>++n===1?Response.json(makeItems(50),{headers:{'Total-Results':'100'}}):new Response('',{status:500}));await assert.rejects(()=>failed.allItems(),/500/);
});
test('附件和父论文元数据每批最多 50 个 key，不逐个请求',async()=>{
 const calls=[],client=new ZoteroClient('batch','123',async url=>{calls.push(new URL(url).searchParams.get('itemKey').split(','));return Response.json([])});await client.itemsByKeys(makeItems(105).map(r=>r.key));assert.deepEqual(calls.map(c=>c.length),[50,50,5]);
});
test('分类计划保留祖先、多个归属，稳定标识防止重试重复建目录',()=>{
 const plan=collectionPlan('123',collections,['CHILD001','OTHER001','CHILD001']);assert.equal(plan.folders.length,4);assert.equal(plan.memberships.length,2);assert.equal(plan.folders.find(f=>f.name==='注意力').parentId,'zotero-folder:123:ROOT0001');assert.deepEqual(plan,collectionPlan('123',collections,['CHILD001','OTHER001','CHILD001']));
 assert.deepEqual(collectionLabels(makeItems(1)[0],collections),['机器学习 / 注意力','精读']);
 assert.throws(()=>collectionPlan('123',[{key:'A',data:{name:'a',parentCollection:'B'}},{key:'B',data:{name:'b',parentCollection:'A'}}],['A']),/循环/);assert.throws(()=>collectionPlan('123',collections,['MISSING1']),/重新读取/);
});
test('真实数据库保留目录和多分类；重新打开、重试、备份恢复后可查到同一篇论文',async()=>{
 globalThis.indexedDB=new IDBFactory();const db=new ZoteroMappings(),item=await libraryItem(db),destination={kind:'collections',collections};
 await Promise.all([db.fileImported(item.id,'123',['CHILD001','OTHER001'],destination),db.fileImported(item.id,'123',['CHILD001','OTHER001'],destination)]);
 assert.equal((await db.folders()).length,4);
 for(const folderId of ['zotero-folder:123:CHILD001','zotero-folder:123:ROOT0001','zotero-folder:123:OTHER001']){const result=await db.query({...query,collection:{kind:'folder',folderId}},100);assert.equal(result.total,1);assert.equal(result.items[0].id,item.id);assert.equal(result.counts.all,1);}
 assert.equal((await db.query(query,100)).counts.folders['zotero-folder:123:root'],1);
 await db.close();const reopened=new ZoteroMappings();assert.equal((await reopened.getItem(item.id)).folderIds.length,1);
 const transfer=new TransferStore(),backup=await inspectBackup(await createBackup(await transfer.snapshot(true)));await transfer.close();await reopened.close();
 globalThis.indexedDB=new IDBFactory();const restored=new TransferStore();await restored.restore(backup);await restored.close();const fresh=new ZoteroMappings();assert.equal((await fresh.query({...query,collection:{kind:'folder',folderId:'zotero-folder:123:OTHER001'}},100)).total,1);await fresh.close();
});
test('指定目录对重复导入也生效；移动到未分类会清除额外分类，非空分类不可误删',async()=>{
 globalThis.indexedDB=new IDBFactory();const db=new ZoteroMappings(),item=await libraryItem(db);
 await db.fileImported(item.id,'123',['CHILD001','OTHER001'],{kind:'collections',collections});await assert.rejects(()=>db.folder('delete','zotero-folder:123:OTHER001'),/移出/);
 await db.folder('create','destination');await db.fileImported(item.id,'123',[],{kind:'folder',folderId:'destination'});assert.deepEqual((await db.getItem(item.id)).folderIds,[]);assert.equal((await db.getItem(item.id)).folderId,'destination');
 await db.move([item.id],null);assert.equal((await db.query({...query,collection:{kind:'unfiled'}},100)).total,1);
 await assert.rejects(()=>db.fileImported(item.id,'123',[],{kind:'folder',folderId:'missing'}));assert.equal((await db.getItem(item.id)).folderId,null);await db.close();
});
test('删除非收藏记录所在的额外分类，不留下悬空引用',async()=>{
 globalThis.indexedDB=new IDBFactory();const db=new ZoteroMappings(),item=await libraryItem(db);
 await db.fileImported(item.id,'123',['CHILD001','OTHER001'],{kind:'collections',collections});await db.membership([item.id],false);await db.folder('delete','zotero-folder:123:OTHER001');assert.deepEqual((await db.getItem(item.id)).folderIds,[]);await db.close();
});
const pdf=new TextEncoder().encode('%PDF-1.7 test fixture');
test('WebDAV 从 ZIP 原始文件名显示中文标题，也兼容 Zotero 旧版编码',async()=>{
 for(const name of ['作者 - 注意力论文.pdf',Buffer.from('作者 - 注意力论文.pdf').toString('base64')+'%ZB64']){
  const bytes=zipSync({[name]:pdf}),d=zipDirectory(bytes);assert.deepEqual(zipPdfNames(bytes.subarray(d.start,d.start+d.size),d.count),['作者 - 注意力论文.pdf']);assert.equal(await (await decodeZoteroArchive(bytes,'作者 - 注意力论文.pdf')).text(),new TextDecoder().decode(pdf));
 }
 const bad=zipSync({'../outside.pdf':pdf});assert.throws(()=>decodeZoteroArchive(bad),/路径无效/);
});
test('WebDAV 名称读取使用范围请求，兼容忽略 Range 的服务器和根目录附件',async()=>{
 const bytes=zipSync({'真实论文.pdf':new Uint8Array(120000).map((_,i)=>i%251)},{level:0});
 for(const partial of [true,false]){
  const calls=[],dav=new WebDavClient({url:'https://dav.test/',username:'u',password:'p'},async(url,options)=>{calls.push({url,range:options.headers.get('Range')});if(new URL(url).pathname.startsWith('/zotero/'))return new Response('',{status:404});if(!partial)return new Response(bytes);const start=bytes.length-65557;return new Response(bytes.slice(start),{status:206,headers:{'Content-Range':`bytes ${start}-${bytes.length-1}/${bytes.length}`}})});
  assert.deepEqual(await zoteroArchiveNames(dav,'ATTACH01'),['真实论文.pdf']);assert.ok(calls.every(c=>c.range==='bytes=-65557'));assert.equal(calls.length,2);
 }
});
test('目录无法完整读取时报告错误，不展示伪造文件名',async()=>{
 const dav=new WebDavClient({url:'https://dav.test/',username:'u',password:'p'},async()=>new Response('bad',{status:206,headers:{'Content-Range':'bytes 10-50/100'}}));await assert.rejects(()=>zoteroArchiveNames(dav,'ATTACH01'),/响应无效/);
});
test('WebDAV 列表关联父论文名称和完整分类，不用附件字母编号充当标题',async()=>{
 const paper=makeItems(1)[0],attachment={key:'ATTACH01',data:{itemType:'attachment',parentItem:paper.key,filename:'paper.pdf',contentType:'application/pdf'}},seen=[];let davCalls=0;
 const client={collections:async()=>collections,itemsByKeys:async keys=>keys.includes('ATTACH01')?[attachment]:[paper]};
 await discoveryCatalog(['ATTACH01'],{get:async()=>{davCalls++;throw new Error('unexpected')}},client,new AbortController().signal,row=>seen.push(row),()=>{},()=>{});
 assert.equal(davCalls,0);assert.equal(seen[0].title,'论文 0');assert.deepEqual(seen[0].paths,['机器学习 / 注意力','精读']);assert.equal(seen[0].paper.key,paper.key);
});
test('未连接 API 时用 PDF 文件名；读取失败单独报告，不阻止其他附件',async()=>{
 const bytes=zipSync({'可识别论文.pdf':pdf}),seen=[];
 const dav={get:async path=>{if(path.includes('FAILED01'))throw new Error('下载失败');return {response:new Response(bytes)}}};
 await discoveryCatalog(['ATTACH01','FAILED01'],dav,undefined,new AbortController().signal,row=>seen.push(row),()=>{},()=>{});
 assert.equal(seen[0].title,'可识别论文');assert.equal(seen[0].status,'ready');assert.equal(seen[1].status,'unavailable');assert.match(seen[1].detail,/下载失败/);
});
