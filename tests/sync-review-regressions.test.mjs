import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

await mkdir('backups/tests', { recursive: true });
const output = resolve('backups/tests/sync-review-regressions.mjs');
await build({
  stdin: { contents: `
    export { TransferStore } from './src/data/transfer-store';
    export { ConnectionStore } from './src/sync/settings';
    export { synchronize } from './src/sync/engine';
    export { WebDavClient } from './src/sync/webdav-client';
    export { AnnotationDatabase } from './src/data/annotation-database';
    export { fromZoteroAnnotation } from './src/zotero/annotations';
    export { createBackup, inspectBackup } from './src/transfer/backup';
    export { NoteDatabase } from './src/data/note-database';
    export { NoteSession } from './src/domain/notes/session';
  `, resolveDir: process.cwd(), loader: 'ts' },
  outfile: output, bundle: true, platform: 'node', format: 'esm', alias: { '@': resolve('src') },
});
const { TransferStore, ConnectionStore, synchronize, WebDavClient, AnnotationDatabase,
  fromZoteroAnnotation, createBackup, inspectBackup, NoteDatabase, NoteSession } = await import(pathToFileURL(output));
globalThis.IDBKeyRange = IDBKeyRange;
const request = r => new Promise((ok, no) => { r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
const read = async (store, name, key) => request((await store.open()).transaction(name).objectStore(name).get(key));
async function seed(store, name, row) {
  const tx = (await store.open()).transaction(name, 'readwrite');
  const done = new Promise((ok, no) => { tx.oncomplete = ok; tx.onabort = () => no(tx.error); });
  tx.objectStore(name).put(row);
  await done;
}
const fresh = () => { globalThis.indexedDB = new IDBFactory(); return new TransferStore(); };
const markdown = text => ({ format: 'paperpane-markdown', schemaVersion: 1, markdown: text });
const hash = async bytes => Buffer.from(await crypto.subtle.digest('SHA-256', bytes)).toString('hex');
async function importDoc(store, scope = 'record-and-file') {
  const bytes = new TextEncoder().encode('%PDF-1.7 regression fixture');
  return (await store.commitImport({ blob: new Blob([bytes], { type: 'application/pdf' }), sha256: await hash(bytes), filename: 'fixture.pdf', pageCount: 1, syncScope: scope })).document;
}
async function putImage(store, text) {
  const bytes = new TextEncoder().encode(text), sha256 = await hash(bytes);
  await store.files.put({ id: 'note-image:' + sha256, sha256, blob: new Blob([bytes], { type: 'image/png' }), createdAt: new Date().toISOString() });
  return sha256;
}
const refFor = doc => ({ documentId: doc.id, fileVersion: doc.fileVersion });
const inputFor = (ref, comment) => ({ kind: 'highlight', selection: { anchor: { ...ref, pages: [{ pageIndex: 0, rects: [{ x: 10, y: 10, width: 20, height: 10 }] }] }, text: 'source' }, color: 'yellow', comment });
const connection = { url: 'https://dav.test/', username: 'u', password: 'fixture' };
function server(onPut = async () => {}) {
  const files = new Map(), requests = [], versions = new Map(); let version = 0;
  return { files, requests, fetcher: async (url, options) => {
    const path = new URL(url).pathname;
    requests.push({ method: options.method, path });
    if (options.method === 'MKCOL') return new Response('', { status: 201 });
    if (options.method === 'GET') return files.has(path) ? new Response(files.get(path), { headers: { ETag: `"${versions.get(path)}"` } }) : new Response('', { status: 404 });
    if (options.method === 'PUT') {
      const match = options.headers.get('If-Match'), none = options.headers.get('If-None-Match');
      if ((match && match !== `"${versions.get(path)}"`) || (none === '*' && files.has(path))) return new Response('', { status: 412 });
      const body = options.body instanceof Blob ? new Uint8Array(await options.body.arrayBuffer()) : String(options.body);
      await onPut(path, body);
      files.set(path, body); versions.set(path, ++version);
      return new Response('', { status: 201, headers: { ETag: `"${versions.get(path)}"` } });
    }
    throw Error('Unexpected request');
  } };
}
async function sync(store, connections, remote) {
  await synchronize(new AbortController().signal, { store, connections, client: new WebDavClient(connection, remote.fetcher) });
}

// Real persistence boundaries, ZIP codec, and a separate empty device database.
test('完整 ZIP 恢复笔记正文、历史与评论/历史引用的 PNG，重开数据库仍完整', async () => {
  const store = fresh(), doc = await importDoc(store), ref = refFor(doc), notes = new NoteDatabase(), annotations = new AnnotationDatabase();
  const commentImage = await putImage(store, 'comment PNG'), historyImage = await putImage(store, 'history PNG');
  const old = await notes.writeNote(ref, '', markdown(`旧笔记 ![](paperpane-asset:${historyImage})`));
  await notes.writeNote(ref, old.version.revision, markdown('研究正文'), [old.version]);
  await annotations.create(ref, inputFor(ref, `![图片](paperpane-asset:${commentImage})`), 'comment');
  const preview = await inspectBackup(await createBackup(await store.snapshot(true)));
  assert.equal(preview.version, 3); assert.equal(preview.complete, true);
  assert.equal(preview.assets.filter(a => a.mimeType === 'image/png').length, 2);
  assert.equal((await store.restore(preview)).conflicts, 0, 'Restoring our own ZIP must not conflict on omitted optional fields');
  await notes.close(); await annotations.close(); await store.close();
  const target = fresh(); assert.equal((await target.restore(preview)).conflicts, 0); await target.close();
  const reopened = new TransferStore(), restoredNotes = new NoteDatabase(), restoredAnnotations = new AnnotationDatabase();
  const restored = await restoredNotes.readNote(ref);
  assert.equal(restored.version.content.markdown, '研究正文');
  assert.equal(restored.history[0].content.markdown, old.version.content.markdown);
  assert.equal((await restoredAnnotations.load(ref)).items[0].comment, `![图片](paperpane-asset:${commentImage})`);
  assert.equal((await reopened.files.read('note-image:' + commentImage)).type, 'image/png');
  assert.equal(await (await reopened.files.read('note-image:' + historyImage)).text(), 'history PNG');
  assert.equal(await (await reopened.readFile(ref)).text(), '%PDF-1.7 regression fixture');
  await restoredNotes.close(); await restoredAnnotations.close(); await reopened.close();
});

test('完整备份拒绝遗漏的嵌入图片，数据备份和旧版恢复提示覆盖范围', async () => {
  const store = fresh(), doc = await importDoc(store), notes = new NoteDatabase();
  await notes.writeNote(refFor(doc), '', markdown(`![](paperpane-asset:${'a'.repeat(64)})`));
  await assert.rejects(() => store.snapshot(true).then(createBackup), /缺少嵌入图片/);
  const partial = await inspectBackup(await createBackup(await store.snapshot(false)));
  assert.equal(partial.complete, false);
  assert.ok((await store.restore(partial)).warnings.some(x => x.includes('图片')));
  partial.version = 1; assert.ok((await store.restore(partial)).warnings.some(x => x.includes('旧版')));
  await notes.close(); await store.close();
});

test('Zotero 更新选择远程后仍由 byDocument 查到，布局导入也重建索引', async () => {
  const store = fresh(), doc = await importDoc(store), ref = refFor(doc), annotations = new AnnotationDatabase();
  const id = 'zotero:123:ANNO0001:' + doc.fileVersion;
  await annotations.create(ref, inputFor(ref, '本地评论'), id);
  const row = fromZoteroAnnotation({ key: 'ANNO0001', version: 2, data: { itemType: 'annotation', annotationType: 'highlight', annotationText: 'source', annotationComment: '远程评论', annotationColor: '#ffd400', annotationPosition: JSON.stringify({ pageIndex: 0, rects: [[10, 10, 40, 20]] }) } }, ref, [[0, 0, 400, 500]], id);
  const snapshot = { ...(await store.snapshot(false)), id: 'zotero-update', databases: [{ name: 'paperpane', version: 3, stores: { annotations: [row], annotationLayouts: [{ id, document: ref, layout: { id, dx: 1, dy: 2 } }] } }] };
  await store.restore(snapshot); const remoteVersion = (await store.versions()).find(v => v.value === '远程评论' || v.value === 'remote'); assert.ok(remoteVersion); await store.useVersion(remoteVersion.id, remoteVersion.current);
  const visible = await annotations.load(ref);
  assert.equal(visible.items.length, 1); assert.equal(visible.items[0].comment, '远程评论'); assert.equal(visible.layouts.length, 1);
  assert.deepEqual((await read(store, 'annotations', id)).documentKey, [ref.documentId, ref.fileVersion]);
  await annotations.close(); await store.close();
});

test('并发保存两种连接，或断开一种同时更新另一种，均保留对方配置和密钥', async () => {
  const store = fresh(), a = new ConnectionStore(), b = new ConnectionStore();
  await Promise.all([a.saveDav(connection, true), b.saveZotero('key1', '123', true)]);
  assert.equal((await a.view()).dav.url, connection.url); assert.equal((await a.view()).zotero.userId, '123');
  assert.equal((await a.dav()).password, 'fixture'); assert.equal(await b.zotero(), 'key1');
  await Promise.all([a.disconnect('dav'), b.saveZotero('key2', '456', false)]);
  assert.equal((await a.view()).dav, undefined); assert.equal(await a.dav(), undefined);
  assert.equal((await b.view()).zotero.userId, '456'); assert.equal(await b.zotero(), 'key2');
  await Promise.all([a.saveDav(connection, true, true), b.disconnect('zotero')]);
  assert.equal((await a.view()).dav.automatic, true); assert.equal((await b.view()).zotero, undefined); assert.equal(await b.zotero(), undefined);
  await a.close(); await b.close(); await store.close();
});

test('同一连接保存不会覆盖同时写入的新同步状态', async () => {
  const store = fresh(), a = new ConnectionStore(), b = new ConnectionStore();
  await a.saveDav(connection, true);
  await Promise.all([a.saveDav(connection, true, true), b.write('transfer-sync-state', { phase: 'running', message: '新任务' })]);
  assert.equal((await a.status()).message, '新任务');
  await a.close(); await b.close(); await store.close();
});

test('仅浏览 PDF 不上传文件；手动完整备份保留原文件；接收端正确标记缺失', async () => {
  const store = fresh(), doc = await importDoc(store, 'record-only'), connections = new ConnectionStore(), remote = server();
  await connections.saveDav(connection, true); await sync(store, connections, remote);
  assert.equal(remote.requests.filter(r => r.method === 'PUT' && r.path.endsWith('.pdf')).length, 0);
  assert.equal(JSON.parse(remote.files.get('/paperpane/manifest.json')).assets.length, 0);
  assert.equal((await inspectBackup(await createBackup(await store.snapshot(true)))).assets.length, 1);
  assert.equal((await store.getDocument(doc.id)).file.availability, 'local');
  await connections.close(); await store.close();
  const target = fresh(), targetConnections = new ConnectionStore(); await targetConnections.saveDav(connection, true); await sync(target, targetConnections, remote);
  const [received] = await target.list(); assert.equal(received.syncScope, 'record-only'); assert.equal(received.file.availability, 'local-missing');
  assert.equal((await targetConnections.status()).phase, 'success');
  // Importing the file explicitly later promotes it and allows its next upload.
  await importDoc(target, 'record-and-file'); await sync(target, targetConnections, remote);
  assert.equal(remote.requests.filter(r => r.method === 'PUT' && r.path.endsWith('.pdf')).length, 1);
  await target.close(); await targetConnections.close();
});

test('WebDAV 跨设备恢复笔记、历史和 PNG，重复同步不制造修订冲突', async () => {
  const store = fresh(), doc = await importDoc(store), ref = refFor(doc), notes = new NoteDatabase(), connections = new ConnectionStore(), remote = server();
  const image = await putImage(store, 'shared PNG');
  const old = await notes.writeNote(ref, '', markdown('history'));
  await notes.writeNote(ref, old.version.revision, markdown(`shared ![](paperpane-asset:${image})`), [old.version]);
  await connections.saveDav(connection, true); await sync(store, connections, remote);
  assert.equal((await connections.status()).phase, 'success');
  await notes.close(); await connections.close(); await store.close();
  const target = fresh(), targetNotes = new NoteDatabase(), targetConnections = new ConnectionStore();
  await targetConnections.saveDav(connection, true);
  await sync(target, targetConnections, remote);
  const [targetDoc] = await target.list(), targetRef = refFor(targetDoc);
  assert.notEqual(targetDoc.id, doc.id);
  const note = await targetNotes.readNote(targetRef);
  assert.equal(note.version.content.markdown, `shared ![](paperpane-asset:${image})`); assert.equal(note.history[0].content.markdown, 'history');
  assert.equal(await (await target.files.read('note-image:' + image)).text(), 'shared PNG');
  assert.equal((await targetConnections.status()).phase, 'success');
  await sync(target, targetConnections, remote); assert.equal((await target.versions()).length, 0); assert.equal((await targetConnections.status()).phase, 'success');
  await targetNotes.close(); await targetConnections.close(); await target.close();
});

for (const stage of ['asset', 'manifest']) test(`上传 ${stage} 期间的本地编辑保持待同步，重试后才成功`, async () => {
  const store = fresh(), connections = new ConnectionStore(); await importDoc(store);
  await seed(store, 'libraryFolders', { id: 'folder', name: 'old' }); await connections.saveDav(connection, true);
  let injected = false;
  const remote = server(async path => {
    if (!injected && (stage === 'asset' ? path.endsWith('.pdf') : path.endsWith('manifest.json'))) {
      injected = true; assert.equal((await connections.status()).phase, 'running');
      await seed(store, 'libraryFolders', { id: 'folder', name: 'new' });
    }
  });
  await sync(store, connections, remote);
  assert.equal((await connections.status()).phase, 'idle'); assert.equal((await connections.status()).lastSuccess, undefined);
  const published = JSON.parse(remote.files.get('/paperpane/manifest.json'));
  assert.equal(published.records['paperpane/libraryFolders/folder'].name, 'old');
  assert.equal((await read(store, 'libraryFolders', 'folder')).name, 'new');
  await sync(store, connections, remote);
  assert.equal((await connections.status()).phase, 'success');
  assert.equal(JSON.parse(remote.files.get('/paperpane/manifest.json')).records['paperpane/libraryFolders/folder'].name, 'new');
  await connections.close(); await store.close();
});

test('笔记恢复变更修订令牌，阻止已打开的旧草稿覆盖并保留冲突两版', async () => {
  const store = fresh(), doc = await importDoc(store), ref = refFor(doc), notes = new NoteDatabase();
  const original = await notes.writeNote(ref, '', markdown('local original'));
  const snapshot = await store.snapshot(true), row = snapshot.databases[0].stores.meta.find(r => r.key.startsWith('notes:v1:'));
  row.value.version.content = markdown('remote');
  await store.restore(snapshot); const remoteVersion = (await store.versions()).find(v => v.value === '远程评论' || v.value === 'remote'); assert.ok(remoteVersion); await store.useVersion(remoteVersion.id, remoteVersion.current);
  const restored = await notes.readNote(ref); assert.equal(restored.version.content.markdown, 'remote');
  assert.notEqual(restored.version.revision, original.version.revision); assert.ok((await store.versions()).some(v => v.value === 'local original'));
  await assert.rejects(() => notes.writeNote(ref, original.version.revision, markdown('stale editor')), /另一窗口/);
  await notes.close(); await store.close();
});

test('恢复广播刷新已打开且无草稿的笔记会话', async () => {
  const store = fresh(), doc = await importDoc(store), ref = refFor(doc), notes = new NoteDatabase();
  await notes.writeNote(ref, '', markdown('before'));
  const session = new NoteSession(notes, ref); await session.refresh();
  const snapshot = await store.snapshot(true); snapshot.databases[0].stores.meta.find(r => r.key.startsWith('notes:v1:')).value.version.content = markdown('after');
  const refreshed = new Promise((ok, no) => {
    const timer = setTimeout(() => { off(); no(Error('No restore notification')); }, 2000);
    const off = session.subscribe(() => { if (session.getSnapshot().data?.draft.markdown === 'after') { clearTimeout(timer); off(); ok(); } });
  });
  await store.restore(snapshot, await store.snapshot(true)); await refreshed;
  assert.equal(session.getSnapshot().data.draft.markdown, 'after');
  await session.dispose(); await store.close();
});

test('旧版 WebDAV 清单升级时剥离设备可用性与索引字段，仍可一次同步完成', async () => {
  const store = fresh(), doc = await importDoc(store), annotations = new AnnotationDatabase(), connections = new ConnectionStore(), remote = server();
  await annotations.create(refFor(doc), inputFor(refFor(doc), 'legacy comment'), 'legacy-annotation');
  await connections.saveDav(connection, true); await sync(store, connections, remote);
  const manifest = JSON.parse(remote.files.get('/paperpane/manifest.json')); manifest.version = 1;
  for (const asset of manifest.assets) delete asset.mimeType;
  for (const [key, row] of Object.entries(manifest.records)) {
    if (key.includes('/documents/')) row.file.availability = 'local';
    if (key.includes('/annotations/')) row.documentKey = [row.anchor.documentId, row.anchor.fileVersion];
  }
  remote.files.set('/paperpane/manifest.json', JSON.stringify(manifest));
  await annotations.close(); await connections.close(); await store.close();
  const target = fresh(), targetConnections = new ConnectionStore(), targetAnnotations = new AnnotationDatabase();
  await targetConnections.saveDav(connection, true); await sync(target, targetConnections, remote);
  assert.equal((await targetConnections.status()).phase, 'success');
  const [received] = await target.list(); assert.equal((await targetAnnotations.load(refFor(received))).items[0].comment, 'legacy comment');
  assert.equal(JSON.parse(remote.files.get('/paperpane/manifest.json')).version, 3);
  await targetAnnotations.close(); await targetConnections.close(); await target.close();
});

test('真实持久层两设备编辑同一对话：不同消息自动合并，重叠文字留版本且其余内容继续同步', async () => {
  const a=fresh(),ac=new ConnectionStore(),remote=server();const doc=await importDoc(a);
  const keyA=`ai-v1:${doc.id}:${doc.fileVersion}`;
  const record={revision:'base',sessions:[{id:'s',title:'研究讨论',messages:[{id:'m1',markdown:'问题一'},{id:'m2',markdown:'问题二'}]}],cards:[],overviews:[],attempts:[]};
  await seed(a,'meta',{key:keyA,value:record});await ac.saveDav(connection,true);await sync(a,ac,remote);
  const b=fresh(),bc=new ConnectionStore();await bc.saveDav(connection,true);await sync(b,bc,remote);
  const [docB]=await b.list(),keyB=`ai-v1:${docB.id}:${docB.fileVersion}`;
  const left=(await read(a,'meta',keyA)).value,right=(await read(b,'meta',keyB)).value;
  left.sessions[0].messages[0].markdown='本机补充第一条';right.sessions[0].messages[1].markdown='另一设备补充第二条';
  await seed(a,'meta',{key:keyA,value:left});await seed(b,'meta',{key:keyB,value:right});
  await sync(a,ac,remote);await sync(b,bc,remote);await sync(a,ac,remote);
  const combined=(await read(a,'meta',keyA)).value.sessions[0].messages;
  assert.deepEqual(combined.map(x=>x.markdown),['本机补充第一条','另一设备补充第二条']);assert.equal((await a.versions()).length,0);
  const l2=(await read(a,'meta',keyA)).value,r2=(await read(b,'meta',keyB)).value;
  l2.sessions[0].messages[0].markdown='左边完全改写';r2.sessions[0].messages[0].markdown='右边完全改写';
  await seed(a,'meta',{key:keyA,value:l2});await seed(b,'meta',{key:keyB,value:r2});
  await seed(b,'libraryFolders',{id:'independent',name:'同步不能被挡住',createdAt:'2026-01-01'});
  await sync(a,ac,remote);await sync(b,bc,remote);await sync(a,ac,remote);
  assert.equal((await ac.status()).phase,'success');assert.equal((await bc.status()).phase,'success');
  assert.equal((await read(a,'libraryFolders','independent')).name,'同步不能被挡住');
  const versions=await a.versions();assert.equal(versions.length,2);assert.deepEqual(new Set(versions.map(v=>v.value?.markdown??v.value)),new Set(['左边完全改写','右边完全改写']));
  assert.ok(versions.every(v=>v.path.at(-1)==='@m1'&&v.context==='研究讨论'));
  for(let i=0;i<3;i++){await sync(b,bc,remote);await sync(a,ac,remote);}
  assert.equal((await a.versions()).length,2);assert.equal((await b.versions()).length,2);
  const chosen=(await a.versions()).find(v=>v.value?.markdown==='左边完全改写');
  const current=(await read(a,'meta',keyA)).value;current.revision='background-save-only';current.sessions[0].messages[1].markdown='查看版本期间继续改另一条';await seed(a,'meta',{key:keyA,value:current});
  assert.equal(await a.useVersion(chosen.id,chosen.current),'applied');
  assert.equal((await read(a,'meta',keyA)).value.sessions[0].messages[1].markdown,'查看版本期间继续改另一条');
  await sync(a,ac,remote);await sync(b,bc,remote);assert.equal((await read(b,'meta',keyB)).value.sessions[0].messages[0].markdown,'左边完全改写');
  // Alternate versions must survive a complete ZIP and a fresh database.
  const backup=await inspectBackup(await createBackup(await a.snapshot(true)));
  await a.close();await ac.close();await b.close();await bc.close();const restored=fresh();await restored.restore(backup);
  assert.equal((await restored.versions()).length,2);await restored.close();
});

test('旧冲突本机已变化：自动收存旧本机、最新本机、远端三个版本，同步立即恢复',async()=>{
  const store=fresh(),connections=new ConnectionStore(),remote=server();
  const key='ai-v1:legacy:version';
  const row=text=>({key,value:{revision:crypto.randomUUID(),sessions:[{id:'s',title:'旧对话',messages:[{id:'m',markdown:text}]}],cards:[],overviews:[],attempts:[]}});
  const local=row('旧本机'),latest=row('最新本机'),foreign=row('远端');
  await seed(store,'meta',latest);await seed(store,'meta',{key:'transfer-conflict:legacy',value:{id:'transfer-conflict:legacy',store:'meta',key,local,remote:foreign,snapshotId:'old'}});
  await connections.saveDav(connection,true);await sync(store,connections,remote);
  assert.equal((await connections.status()).phase,'success');assert.equal(await read(store,'meta','transfer-conflict:legacy'),undefined);
  const texts=(await store.versions()).map(v=>v.value?.markdown??v.value);for(const text of ['旧本机','最新本机','远端'])assert.ok(texts.includes(text));
  await sync(store,connections,remote);assert.equal((await store.versions()).length,3);
  await store.close();await connections.close();
});

test('两设备同时发布导致条件写入失败时，自动重读远端并重试合并',async()=>{
  const store=fresh(),connections=new ConnectionStore(),remote=server();await connections.saveDav(connection,true);
  await seed(store,'libraryFolders',{id:'local',name:'本机文件夹',createdAt:'2026-01-01'});
  let injected=false,puts=0;
  const fetcher=async(url,options)=>{
    if(options.method==='PUT'&&new URL(url).pathname.endsWith('manifest.json')){
      puts++;
      if(!injected){injected=true;
        const manifest=JSON.parse(String(options.body));manifest.records={'paperpane/libraryFolders/other':{id:'other',name:'另一设备文件夹',createdAt:'2026-01-01'}};
        await remote.fetcher(url,{...options,body:JSON.stringify(manifest)});
        return new Response('',{status:412});
      }
    }
    return remote.fetcher(url,options);
  };
  await synchronize(new AbortController().signal,{store,connections,client:new WebDavClient(connection,fetcher)});
  assert.equal(puts,2);assert.equal((await connections.status()).phase,'success');
  const manifest=JSON.parse(remote.files.get('/paperpane/manifest.json'));
  assert.equal(manifest.records['paperpane/libraryFolders/local'].name,'本机文件夹');assert.equal(manifest.records['paperpane/libraryFolders/other'].name,'另一设备文件夹');
  await store.close();await connections.close();
});
