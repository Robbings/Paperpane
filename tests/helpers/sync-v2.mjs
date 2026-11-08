// Shared harness: bundles the v2 engine for Node and builds simulated devices.
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const repo = resolve(import.meta.dirname, '../..');
const require = createRequire(resolve(repo, 'package.json'));
const { build } = await import(pathToFileURL(require.resolve('esbuild')).href);
const { IDBFactory, IDBKeyRange } = await import(pathToFileURL(require.resolve('fake-indexeddb')).href);
const out = resolve(repo, 'backups/tests/sync-v2.mjs');
await (await import('node:fs/promises')).mkdir(resolve(repo, 'backups/tests'), { recursive: true });
await build({ stdin: { contents: "export {synchronizeV2} from './src/sync/v2/engine';export {TransferStore} from './src/data/transfer-store';export {ConnectionStore} from './src/sync/settings';export {WebDavClient} from './src/sync/webdav-client';export {canonical,flatten,syncSnapshot} from './src/sync/manifest';", resolveDir: repo, loader: 'ts' }, outfile: out, bundle: true, platform: 'node', format: 'esm', alias: { '@': resolve(repo, 'src') }, conditions: ['node'], logLevel: 'error' });
export const { synchronizeV2, TransferStore, ConnectionStore, WebDavClient, canonical, flatten, syncSnapshot } = await import(pathToFileURL(out).href + '?' + Date.now());
globalThis.IDBKeyRange = IDBKeyRange;
globalThis.__paperpaneAutomergeWasm = new Uint8Array((await import('node:fs')).readFileSync(require.resolve('@automerge/automerge/automerge.wasm')));
const request = (r) => new Promise((ok, no) => { r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
const tx = async (store, names, fn) => { const db = await store.open(); const t = db.transaction(names, 'readwrite'); const result = await fn(t); await new Promise((ok, no) => { t.oncomplete = ok; t.onabort = () => no(t.error); }); return result; };

/** In-memory WebDAV that, like OpenList, ignores If-Match / If-None-Match. */
export function memoryDav(log = { PUT: 0, GET: 0, PROPFIND: 0 }, noListing = false) {
  const files = new Map(), dirs = new Set(['']);
  const fetcher = async (url, o) => {
    const path = decodeURIComponent(new URL(url).pathname).replace(/^\/dav\//, '').replace(/\/$/, '');
    log[o.method] = (log[o.method] ?? 0) + 1;
    if (o.method === 'MKCOL') { if (dirs.has(path)) return new Response('', { status: 405 }); dirs.add(path); return new Response('', { status: 201 }); }
    if (o.method === 'PUT') { files.set(path, new Uint8Array(await new Response(o.body).arrayBuffer())); return new Response('', { status: 201 }); }
    if (o.method === 'GET') return files.has(path) ? new Response(files.get(path)) : new Response('', { status: 404 });
    if (o.method === 'DELETE') { files.delete(path); return new Response('', { status: 204 }); }
    if (o.method === 'PROPFIND') {
      if (!dirs.has(path)) return new Response('', { status: 404 });
      // Some bridges return stale or empty directory listings.
      const items = noListing ? [] : [...files.keys()].filter((f) => f.startsWith(path + '/') && !f.slice(path.length + 1).includes('/'));
      const xml = `<d:multistatus xmlns:d="DAV:"><d:response><d:href>/dav/${path}/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response>${items.map((f) => `<d:response><d:href>/dav/${f.split('/').map(encodeURIComponent).join('/')}</d:href><d:propstat><d:prop><d:resourcetype/></d:prop></d:propstat></d:response>`).join('')}</d:multistatus>`;
      return new Response(xml, { status: 207 });
    }
    return new Response('', { status: 405 });
  };
  return { fetcher, files, log, url: 'https://dav.test/dav/' };
}

/** A device: its own IndexedDB, the same server. `from` copies another device's whole profile. */
export async function device(name, server, connection, from) {
  globalThis.indexedDB = from ? from.factory : new IDBFactory();
  const factory = globalThis.indexedDB;
  if (from) { /* reuse: the clone opens the same stored data through a copy below */ }
  const store = new TransferStore(), conn = new ConnectionStore();
  await store.open(); await conn.open();
  await conn.saveDav(connection ?? { url: server.url, username: 'u', password: 'p' }, true);
  const d = {
    name, store, conn, factory,
    client: () => new WebDavClient(connection ?? { url: server.url, username: 'u', password: 'p' }, server.fetcher),
    async sync(signal = new AbortController().signal) { return synchronizeV2(signal, { store, connections: conn, client: d.client() }); },
    folder: (id, fields) => tx(store, ['libraryFolders'], async (t) => { const s = t.objectStore('libraryFolders'); const old = await request(s.get(id)); s.put({ createdAt: '2026-01-01T00:00:00Z', parentId: null, name: '', ...old, id, ...fields }); }),
    getFolder: async (id) => request((await store.open()).transaction('libraryFolders').objectStore('libraryFolders').get(id)),
    note: (doc, markdown) => tx(store, ['meta'], (t) => t.objectStore('meta').put({ key: `notes:v1:${doc}:1`, value: { version: { revision: crypto.randomUUID(), updatedAt: new Date().toISOString(), content: { format: 'paperpane-markdown', schemaVersion: 1, markdown } }, history: [] } })),
    getNote: async (doc) => (await request((await store.open()).transaction('meta').objectStore('meta').get(`notes:v1:${doc}:1`)))?.value?.version?.content?.markdown,
    versions: async () => (await store.versions()).length,
    versionValues: async () => (await store.versions()).map((v) => v.value),
    /** Every row, for comparing two devices. */
    async dump() { const s = await store.snapshot(false); const st = s.databases[0].stores; return JSON.stringify({ f: (st.libraryFolders ?? []).map((r) => [r.id, r.name, r.parentId]).sort(), n: (st.meta ?? []).filter((r) => r.key.startsWith('notes:')).map((r) => [r.key, r.value.version.content.markdown]).sort() }); },
  };
  return d;
}

/** Copies a device's whole IndexedDB (like copying a browser profile) into a new device. */
export async function cloneDevice(name, server, source, connection) {
  const target = await device(name, server, connection);
  const src = await source.store.open(), dst = await target.store.open();
  for (const storeName of src.objectStoreNames) {
    const rows = await request(src.transaction(storeName).objectStore(storeName).getAll());
    const keys = await request(src.transaction(storeName).objectStore(storeName).getAllKeys());
    const t = dst.transaction(storeName, 'readwrite'); const s = t.objectStore(storeName);
    rows.forEach((r, i) => (s.keyPath ? s.put(r) : s.put(r, keys[i])));
    await new Promise((ok, no) => { t.oncomplete = ok; t.onabort = () => no(t.error); });
  }
  return target;
}

