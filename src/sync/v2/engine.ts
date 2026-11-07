import { TransferStore } from '@/data/transfer-store';
import { assetMime, assetPath, imageReferences } from '@/transfer/assets';
import { sha256 } from '@/transfer/backup';
import type { TransferAsset } from '@/contracts/transfer';
import type { MergeVersion } from '../merge';
import { canonical, flatten, inflate, syncSnapshot, type SyncManifest } from '../manifest';
import { ConnectionStore } from '../settings';
import { versionRows } from '../versions';
import { DavError, WebDavClient } from '../webdav-client';
import { responseBytes } from '../engine';
import { loadAutomerge, type AutomergeApi } from './automerge';
import { CHANGES, HEADS, ROOT, listed, newWriter, pack, publishPointer, readPointers, register, unpack } from './discovery';
import { capture, decode, encode, leafOf, overlappingText, read, settleConflicts, stored, type Leaf } from './entries';

// 同步第二版：合并交给 Automerge，云端只放不可变文件。
//
//   paperpane/sync-v2/changes/<sha256>.bin   一批改动；文件名就是内容哈希，写了不再改
//   paperpane/sync-v2/heads, writers.json    用来发现新文件，见 discovery.ts
//   paperpane/assets/<sha256>.pdf|png        附件，沿用第一版
//
// 改动文件只追加、从不改写，所以服务器不必支持条件写入；同名文件内容必然相同，
// 重传也不会覆盖别人的东西。

const STATE = 'transfer-sync-v2';

interface State {
  /** Server and account the document belongs to. */
  where: string;
  /** The document as of the last finished step: what this device has merged. */
  doc: Uint8Array;
  /** Change files already merged here (or written by this device). */
  seen: string[];
  /** Change files written locally, not yet confirmed on the server. */
  queue: { name: string; bytes: Uint8Array }[];
  /** The folders exist on the server; checked again only when a write says otherwise. */
  ready?: boolean;
  /** This device's writer id, and the newest change file it wrote (queued or not). */
  writer?: string;
  last?: string;
  /** The head this device's pointer was last confirmed to hold. */
  published?: string;
  /** Writers seen so far, so a damaged registry cannot hide them. */
  writers?: string[];
}

export interface SyncReport {
  uploaded: number;
  downloaded: number;
  versions: number;
  /** Change files listed on the server. */
  files: number;
  docBytes: number;
}

export async function synchronizeV2(signal: AbortSignal, options: { store?: TransferStore; connections?: ConnectionStore; client?: WebDavClient } = {}): Promise<SyncReport> {
  const A = await loadAutomerge();
  const store = options.store ?? new TransferStore(), connections = options.connections ?? new ConnectionStore();
  const run = async (): Promise<SyncReport> => {
    const previous = await connections.status();
    try {
      const connection = await connections.dav();
      if (!connection) throw new Error('还没有连接 WebDAV');
      const client = options.client ?? new WebDavClient(connection);
      await connections.write('transfer-sync-state', { ...previous, phase: 'running', message: '正在同步…' });
      const where = client.base.href + '|' + connection.username;
      const report: SyncReport = { uploaded: 0, downloaded: 0, versions: 0, files: 0, docBytes: 0 };

      let saved: State | undefined;
      await store.updateTransferState((_s, meta) => {
        saved = meta.find((r) => r.key === STATE)?.value as State | undefined;
        return {};
      });
      const state: State = saved?.where === where ? saved : { where, doc: new Uint8Array(), seen: [], queue: [] };
      // A fresh actor every run: two copies of one browser profile never claim the same history.
      let doc: Record<string, unknown> = state.doc.length ? A.load(state.doc) : A.init();
      const seen = new Set(state.seen);
      const queue = [...state.queue];
      let ready = !!state.ready;
      const writer = state.writer ?? newWriter();
      let last = state.last, published = state.published;
      const writers = new Set(state.writers ?? []);
      let registered = true;
      const save = () => ({ [STATE]: { where, doc: A.save(doc as any), seen: [...seen], queue, ready, writer, last, published, writers: [...writers] } satisfies State });
      const folders = async () => {
        for (const dir of ['paperpane', ROOT, CHANGES, HEADS, 'paperpane/assets']) await client.mkdir(dir, signal);
        ready = true;
      };
      /** A write into a folder that went missing recreates the folders once. */
      const write = async (path: string, body: Blob) => {
        try {
          await client.put(path, body, undefined, signal);
        } catch (e) {
          if (!(e instanceof DavError) || ![404, 409].includes(e.status)) throw e;
          await folders();
          await client.put(path, body, undefined, signal);
        }
      };
      const persist = () => store.updateTransferState(save);
      const enqueue = async (before: Record<string, unknown>) => {
        const heads = A.getHeads(before as any);
        if (heads.join() === A.getHeads(doc as any).join()) return;
        // From nothing, the whole compressed document is far smaller than the list of changes.
        const chunk = heads.length ? A.saveSince(doc as any, heads) : A.save(doc as any);
        const bytes = pack({ writer, prev: last ?? null }, chunk);
        last = (await sha256(bytes)) + '.bin';
        queue.push({ name: last, bytes });
      };
      /** The base plus downloaded changes only, for showing the other side's text in a version. */
      let theirs: Record<string, unknown> | undefined;
      /** Finds unmerged change files by following each writer's chain back from its newest file. */
      const pull = async () => {
        const found = await readPointers(client, writers, signal);
        for (const w of found.writers) writers.add(w);
        registered = found.registered.includes(writer);
        const ownHeads = found.heads.get(writer) ?? [];
        if (published && !ownHeads.includes(published)) published = undefined; // a lost pointer write: publish again
        const stack = [...[...found.heads.values()].flat(), ...(await listed(client, signal))];
        const got: string[] = [];
        while (stack.length) {
          signal.throwIfAborted();
          const name = stack.pop()!;
          if (seen.has(name) || got.includes(name)) continue;
          let bytes: Uint8Array;
          try {
            bytes = await responseBytes(await client.download(`${CHANGES}/${name}`, signal), 256 * 1024 * 1024, signal);
          } catch (e) {
            // Named but not readable yet (or briefly missing): try again next time.
            if (signal.aborted) throw e;
            continue;
          }
          if ((await sha256(bytes)) !== name.slice(0, 64)) continue;
          const { header, chunk } = unpack(bytes);
          doc = A.loadIncremental(doc as any, chunk);
          if (theirs) theirs = A.loadIncremental(theirs as any, chunk);
          got.push(name);
          report.downloaded++;
          if (header?.prev && !seen.has(header.prev)) stack.push(header.prev);
          if (header) writers.add(header.writer);
        }
        // Changes waiting for ones not downloaded yet stay queued inside the document;
        // their files are only marked done once nothing is missing.
        if (!A.getMissingDeps(doc as any, A.getHeads(doc as any)).length) for (const name of got) seen.add(name);
        report.files = seen.size;
      };
      const flush = async () => {
        while (queue.length) {
          signal.throwIfAborted();
          const item = queue[0]!;
          await write(`${CHANGES}/${item.name}`, new Blob([new Uint8Array(item.bytes)]));
          // Read back: some bridges answer before the file is really stored.
          const back = await responseBytes(await client.download(`${CHANGES}/${item.name}`, signal), 256 * 1024 * 1024, signal);
          if ((await sha256(back)) !== item.name.slice(0, 64)) throw new Error('上传的同步文件校验失败');
          seen.add(item.name);
          queue.shift();
          report.uploaded++;
          await persist();
        }
        // Only now that the files are readable may the pointer name them.
        if (last && last !== published && !queue.length) {
          writers.add(writer);
          await publishPointer(client, write, writer, last, published ? [published] : [], writers, signal);
          published = last;
          await persist();
        }
        if (!registered && published) {
          await register(client, write, writer, writers, signal);
          registered = true;
        }
      };

      if (!ready) await folders();

      // 1. This device's edits since the last sync become one change, saved before any network step.
      const snapshot = canonical(syncSnapshot(await store.snapshot(true)));
      const local = encode(flatten(snapshot), snapshot.assets.map(({ blob, ...a }) => a));
      let joining = false;
      if (!state.doc.length) {
        // First sync on this server: start from the library already there, if any.
        await pull();
        joining = Object.keys(doc).length > 0;
      }
      const base = read(A, doc as any);
      const versions: MergeVersion[] = [];
      const beforeCapture = doc;
      doc = A.change(doc as any, (d) => void versions.push(...capture(A, d as any, local, base, joining)));
      await enqueue(beforeCapture);
      await persist();

      // 2. Attachments before the changes that refer to them.
      const remoteAssets = new Set(await client.names('paperpane/assets', signal));
      for (const asset of snapshot.assets) {
        signal.throwIfAborted();
        const path = assetPath(asset);
        if (remoteAssets.has(path.slice('assets/'.length))) continue;
        await write(`paperpane/${path}`, asset.blob);
        const back = await responseBytes(await client.download(`paperpane/${path}`, signal), 1024 * 1024 * 1024, signal);
        if ((await sha256(back)) !== asset.sha256) throw new Error('上传的附件校验失败');
      }

      // 3. Publish this device's changes, then take everyone else's.
      await flush();
      const mine = read(A, doc as any);
      theirs = A.clone(beforeCapture as any);
      await pull();

      // 4. Concurrent values: one shown everywhere, each kept as a version; same-paragraph text edits too.
      const merged = read(A, doc as any);
      versions.push(...overlappingText(base, mine, merged, read(A, theirs as any)));
      const settled = settleConflicts(A, doc);
      versions.push(...settled.versions);
      if (settled.keys.length) {
        const before = doc;
        doc = A.change(doc as any, (d: any) => {
          for (const key of settled.keys) {
            const leaf = leafOf(A, (before as any)[key]) as Leaf | undefined;
            if (leaf) d[key] = stored(A, leaf);
          }
        });
        await enqueue(before);
      }

      // 5. Write the merged library and the document in one transaction.
      const { records, assets: described } = decode(read(A, doc as any));
      const database = snapshot.databases[0]!.name;
      for (const row of versionRows(versions, new Date().toISOString())) records[[database, 'meta', row.key].map(encodeURIComponent).join('/')] ??= row as any;
      report.versions = versions.length;
      const have = new Map<string, TransferAsset>(snapshot.assets.map((a) => [a.database + ':' + a.id, a]));
      const fetched: TransferAsset[] = [];
      for (const a of described) {
        if (have.has(a.database + ':' + a.id)) continue;
        const bytes = await responseBytes(await client.download(`paperpane/${assetPath(a)}`, signal), 1024 * 1024 * 1024, signal);
        if ((await sha256(bytes)) !== a.sha256) throw new Error('远程附件文件校验失败');
        const full = { ...a, blob: new Blob([new Uint8Array(bytes)], { type: assetMime(a) }) };
        have.set(a.database + ':' + a.id, full);
        fetched.push(full);
      }
      for (const hash of imageReferences(records)) if (![...have.values()].some((a) => a.id === 'note-image:' + hash)) throw new Error('笔记里有图片缺失，没能同步');
      const manifest: SyncManifest = { format: 'paperpane-sync', version: 3, generation: crypto.randomUUID(), createdAt: new Date().toISOString(), records, assets: [] };
      const incoming = inflate(manifest, snapshot);
      incoming.assets = fetched;
      await store.restore(incoming, snapshot, undefined, save());

      // 6. The settled conflicts are a change of their own.
      await flush();
      report.docBytes = A.save(doc as any).length;
      await connections.write('transfer-sync-state', { phase: 'success', lastSuccess: new Date().toISOString(), message: report.versions ? `已同步，另存了 ${report.versions} 个版本` : '已同步' });
      return report;
    } catch (error) {
      await connections.write('transfer-sync-state', { ...previous, phase: 'failed', message: error instanceof Error ? error.message : '同步失败' });
      throw error;
    }
  };
  try {
    if (globalThis.navigator?.locks) return await navigator.locks.request('paperpane-sync', { signal }, run);
    return await run();
  } finally {
    if (!options.store) await store.close();
    if (!options.connections) await connections.close();
  }
}
export type { AutomergeApi };
