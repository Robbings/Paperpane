import type { DocumentRecord, DocumentRef, ReadingPosition } from '../contracts/document';
import { IndexedDbFileStore } from './file-store';
import { itemFromDocument, enrichItem, LIBRARY, FOLDERS, TAGS, PREFERENCES } from './library-records';
import type { LibraryItem, PdfBibliography } from '@/contracts/library';

const DB_NAME = 'paperpane';
const DB_VERSION = 3;
const DOCUMENTS = 'documents';
const ASSETS = 'assets';
const CHANGES = 'changes';
const META = 'meta';
const CACHE = 'cache';

export interface StoredDocument extends DocumentRecord {
  originalFilename: string;
  byteLength: number;
  sources: string[];
  bibliography?: PdfBibliography;
}
interface Change { sequence?: number; entity: 'document'; entityId: string; revision: string; deviceId: string; operation: 'upsert'; at: string }
export interface ImportCommit {
  blob: Blob; sha256: string; filename: string; pageCount: number;
  sourceUrl?: string; syncScope: DocumentRecord['syncScope'];
  bibliography?: PdfBibliography;
}
export interface ImportReceipt { document: StoredDocument; duplicate: boolean }
export class StorageFault extends Error {
  constructor(readonly kind: 'missing' | 'invalid' | 'blocked', message: string) { super(message); }
}
function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
}
function completion(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new DOMException('Storage transaction aborted', 'AbortError'));
    tx.onerror = () => { /* Abort reports the final outcome. Never resolve on request success. */ };
  });
}
export class PaperDatabase {
  private connection?: Promise<IDBDatabase>;
  readonly files = new IndexedDbFileStore(() => this.open());
  constructor(private readonly name = DB_NAME) {}
  protected open(): Promise<IDBDatabase> {
    if (this.connection) return this.connection;
    this.connection = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(this.name, DB_VERSION);
      let abandoned = false;
      req.onupgradeneeded = () => {
        const db = req.result;
        // Additive migration only. Never delete an existing store to "reset" data.
        if (!db.objectStoreNames.contains(DOCUMENTS)) {
          const docs = db.createObjectStore(DOCUMENTS, { keyPath: 'id' });
          docs.createIndex('byHash', 'file.sha256', { unique: true });
        }
        if (!db.objectStoreNames.contains(ASSETS)) db.createObjectStore(ASSETS, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(CHANGES)) db.createObjectStore(CHANGES, { keyPath: 'sequence', autoIncrement: true });
        if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'key' });
        if (!db.objectStoreNames.contains(CACHE)) db.createObjectStore(CACHE, { keyPath: 'key' });
        if (!db.objectStoreNames.contains(LIBRARY)) {
          const items = db.createObjectStore(LIBRARY, { keyPath: 'id' });
          items.createIndex('byDocument', 'documentId', { unique: true });
          items.createIndex('byBibliographyKey', 'bibliographyKey', { unique: true });
          items.createIndex('byAddedAt', 'addedAt');
          const cursor = req.transaction!.objectStore(DOCUMENTS).openCursor();
          cursor.onsuccess = () => {
            if (!cursor.result) return;
            items.put(itemFromDocument(cursor.result.value as StoredDocument));
            cursor.result.continue();
          };
        }
        if (!db.objectStoreNames.contains(FOLDERS)) db.createObjectStore(FOLDERS, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(TAGS)) {
          const tags = db.createObjectStore(TAGS, { keyPath: 'id' });
          tags.createIndex('byNormalized', 'normalized', { unique: true });
        }
        if (!db.objectStoreNames.contains(PREFERENCES)) db.createObjectStore(PREFERENCES, { keyPath: 'key' });
        for (const name of ['annotations', 'annotationLayouts']) {
          if (!db.objectStoreNames.contains(name)) {
            const store = db.createObjectStore(name, { keyPath: 'id' });
            store.createIndex('byDocument', 'documentKey');
          }
        }
      };
      req.onblocked = () => { abandoned = true; reject(new StorageFault('blocked', '请关闭其他 Paperpane 页面后重试数据库升级')); };
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        if (abandoned) { req.result.close(); return; }
        const db = req.result;
        db.onversionchange = () => { db.close(); this.connection = undefined; };
        db.onclose = () => { this.connection = undefined; };
        resolve(db);
      };
    });
    this.connection.catch(() => { this.connection = undefined; });
    return this.connection;
  }
  async list(): Promise<StoredDocument[]> {
    const db = await this.open();
    const tx = db.transaction(DOCUMENTS, 'readonly');
    const done = completion(tx);
    const [items] = await Promise.all([request(tx.objectStore(DOCUMENTS).getAll()) as Promise<StoredDocument[]>, done]);
    return items.filter((item) => !item.deletedAt).sort((a, b) => (b.lastReadAt ?? b.updatedAt).localeCompare(a.lastReadAt ?? a.updatedAt));
  }
  async commitImport(input: ImportCommit): Promise<ImportReceipt> {
    const db = await this.open();
    const tx = db.transaction([DOCUMENTS, ASSETS, CHANGES, META, LIBRARY], 'readwrite', { durability: 'strict' });
    const done = completion(tx);
    // Requests below are enqueued synchronously or in IDB callbacks, never after non-IDB awaits.
    let receipt: ImportReceipt | undefined;
    const docs = tx.objectStore(DOCUMENTS);
    const meta = tx.objectStore(META);
    const deviceRequest = meta.get('deviceId');
    deviceRequest.onsuccess = () => {
      const deviceId: string = deviceRequest.result?.value ?? crypto.randomUUID();
      if (!deviceRequest.result) meta.put({ key: 'deviceId', value: deviceId });
      const existing = docs.index('byHash').get(input.sha256);
      existing.onsuccess = () => {
        const previous = existing.result as StoredDocument | undefined;
        const at = new Date().toISOString();
        const id = previous?.id ?? crypto.randomUUID();
        const assetId = input.sha256;
        const sources = [...new Set([...(previous?.sources ?? []), ...(input.sourceUrl ? [input.sourceUrl] : [])])];
        const document: StoredDocument = {
          ...(previous ?? {}), id, documentId: id, fileVersion: input.sha256,
          revision: crypto.randomUUID(), createdAt: previous?.createdAt ?? at, updatedAt: at,
          title: previous && previous.title !== previous.originalFilename.replace(/\.pdf$/i, '') ? previous.title : input.bibliography?.title ?? previous?.title ?? input.filename.replace(/\.pdf$/i, ''), originalFilename: previous?.originalFilename ?? input.filename,
          bibliography: input.bibliography ?? previous?.bibliography,
          byteLength: input.blob.size, pageCount: input.pageCount, sourceUrl: previous?.sourceUrl ?? input.sourceUrl, sources,
          file: { assetId, sha256: input.sha256, availability: previous?.file.availability === 'uploaded' ? 'uploaded' : 'local' },
          syncScope: previous?.syncScope === 'record-and-file' || input.syncScope === 'record-and-file' ? 'record-and-file' : 'record-only',
          save: { local: 'saved', sync: previous?.save.sync === 'unconfigured' || !previous ? 'unconfigured' : 'pending' },
          deletedAt: undefined,
        };
        // The file, document and future synchronization change record share one transaction.
        this.files.putInTransaction(tx, { id: assetId, blob: input.blob, sha256: input.sha256, createdAt: previous?.createdAt ?? at });
        docs.put(document);
        const items = tx.objectStore(LIBRARY);
        const libraryItem = items.index('byDocument').get(id);
        libraryItem.onsuccess = () => {
          if (!libraryItem.result) {
            const item = itemFromDocument(document); items.put(item);
            tx.objectStore(CHANGES).add({ entity: LIBRARY, entityId: item.id, revision: item.revision, deviceId, operation: 'upsert', at });
          } else if (input.bibliography) {
            const original = libraryItem.result as LibraryItem;
            const next = enrichItem(original, input.bibliography, previous?.title ?? document.title);
            if (JSON.stringify(next) !== JSON.stringify(original)) {
              const item = { ...next, updatedAt: at, revision: crypto.randomUUID() }; items.put(item);
              tx.objectStore(CHANGES).add({ entity: LIBRARY, entityId: item.id, revision: item.revision, baseRevision: original.revision, deviceId, operation: 'upsert', at });
            }
          }
        };
        const change: Change = { entity: 'document', entityId: id, revision: document.revision, deviceId, operation: 'upsert', at };
        tx.objectStore(CHANGES).add(change);
        receipt = { document, duplicate: !!previous };
      };
    };
    await done;
    if (!receipt) throw new Error('Import transaction completed without a document');
    return receipt;
  }
  async readFile(ref: DocumentRef): Promise<Blob> {
    const db = await this.open();
    const tx = db.transaction(DOCUMENTS, 'readonly');
    const done = completion(tx);
    let assetId: string | undefined;
    const doc = tx.objectStore(DOCUMENTS).get(ref.documentId);
    doc.onsuccess = () => {
      const row = doc.result as StoredDocument | undefined;
      if (!row || row.deletedAt || row.fileVersion !== ref.fileVersion) return;
      assetId = row.file.assetId;
    };
    await done;
    if (!assetId) throw new StorageFault('missing', '记录或 PDF 原文件不可用，请重新导入');
    try { return await this.files.read(assetId); }
    catch (error) { if (error instanceof DOMException && error.name === 'NotFoundError') throw new StorageFault('missing', 'PDF 原文件不可用，请重新导入'); throw error; }
  }
  async getDocument(id: string): Promise<StoredDocument | undefined> {
    const db = await this.open(); const tx = db.transaction(DOCUMENTS, 'readonly');
    const done = completion(tx);
    const [document] = await Promise.all([request(tx.objectStore(DOCUMENTS).get(id)) as Promise<StoredDocument | undefined>, done]);
    return document?.deletedAt ? undefined : document;
  }
  async recordReading(ref: DocumentRef, position: ReadingPosition): Promise<void> {
    const db = await this.open();
    const tx = db.transaction([DOCUMENTS, CHANGES, META], 'readwrite', { durability: 'strict' });
    const done = completion(tx);
    let problem: StorageFault | undefined;
    const devices = tx.objectStore(META).get('deviceId');
    devices.onsuccess = () => {
      const deviceId: string = devices.result?.value ?? crypto.randomUUID();
      if (!devices.result) tx.objectStore(META).put({ key: 'deviceId', value: deviceId });
      const req = tx.objectStore(DOCUMENTS).get(ref.documentId);
      req.onsuccess = () => {
        const doc = req.result as StoredDocument | undefined;
        if (!doc || doc.deletedAt || doc.fileVersion !== ref.fileVersion) { problem = new StorageFault('missing', '此文档版本不存在'); tx.abort(); return; }
        if (!Number.isInteger(position.pageIndex) || position.pageIndex < 0 || position.pageIndex >= (doc.pageCount ?? 0) || !Number.isFinite(position.offset) || position.offset < 0 || position.offset > 1 || !Number.isFinite(position.zoom) || position.zoom <= 0 || ![0, 90, 180, 270].includes(position.rotation)) {
          problem = new StorageFault('invalid', '阅读位置无效'); tx.abort(); return;
        }
        const at = new Date().toISOString(); const revision = crypto.randomUUID();
        tx.objectStore(DOCUMENTS).put({ ...doc, revision, updatedAt: at, lastReadAt: at, position: structuredClone(position), save: { local: 'saved', sync: doc.save.sync === 'unconfigured' ? 'unconfigured' : 'pending' } });
        tx.objectStore(CHANGES).add({ entity: 'document', entityId: doc.id, revision, deviceId, operation: 'upsert', at } satisfies Change);
      };
    };
    try { await done; } catch (error) { throw problem ?? error; }
  }
  /** No document/asset/change stores are opened by cache clearing. */
  async clearCache(): Promise<void> {
    const db = await this.open(); const tx = db.transaction(CACHE, 'readwrite'); const done = completion(tx);
    tx.objectStore(CACHE).clear(); await done;
  }
  async close(): Promise<void> { const connection = this.connection; this.connection = undefined; (await connection)?.close(); }
}
