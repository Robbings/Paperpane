/** Raw assets are immutable and addressed by hash. No reader imports IndexedDB details. */
export interface FileStore {
  read(assetId: string): Promise<Blob>;
  put(asset: FileAsset): Promise<void>;
}
export interface FileAsset { id: string; blob: Blob; sha256: string; createdAt: string }
export const ASSET_STORE = 'assets';

/** IDB-specific transaction integration stays here; another backend needs a staged commit protocol. */
export class IndexedDbFileStore implements FileStore {
  constructor(private readonly connection: () => Promise<IDBDatabase>) {}
  putInTransaction(tx: IDBTransaction, asset: FileAsset): void {
    const store = tx.objectStore(ASSET_STORE);
    const existing = store.getKey(asset.id);
    existing.onsuccess = () => { if (existing.result === undefined) store.put(asset); };
  }
  async put(asset: FileAsset): Promise<void> {
    const db = await this.connection();
    const tx = db.transaction(ASSET_STORE, 'readwrite', { durability: 'strict' });
    const done = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error);
    });
    this.putInTransaction(tx, asset); await done;
  }
  async read(assetId: string): Promise<Blob> {
    const db = await this.connection();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(ASSET_STORE, 'readonly');
      const req = tx.objectStore(ASSET_STORE).get(assetId);
      tx.onabort = () => reject(tx.error);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const asset = req.result as FileAsset | undefined;
        if (asset?.blob) resolve(asset.blob);
        else reject(new DOMException('PDF 原文件缺失，请重新导入', 'NotFoundError'));
      };
    });
  }
}
