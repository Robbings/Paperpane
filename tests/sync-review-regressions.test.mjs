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
  assert.equal(preview.version, 2); assert.equal(preview.complete, true);
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
  await store.restore(snapshot); const [conflict] = await store.conflicts(); await store.resolveConflict(conflict.id, 'remote');
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
  await sync(target, targetConnections, remote); assert.equal((await target.conflicts()).length, 0); assert.equal((await targetConnections.status()).phase, 'success');
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
  await store.restore(snapshot); const [conflict] = await store.conflicts(); await store.resolveConflict(conflict.id, 'remote');
  const restored = await notes.readNote(ref); assert.equal(restored.version.content.markdown, 'remote');
  assert.notEqual(restored.version.revision, original.version.revision); assert.equal(restored.history.at(-1).content.markdown, 'local original');
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
  assert.equal(JSON.parse(remote.files.get('/paperpane/manifest.json')).version, 2);
  await targetAnnotations.close(); await targetConnections.close(); await target.close();
});
