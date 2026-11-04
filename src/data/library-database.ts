import { PaperDatabase, importJobKey, type StoredDocument } from './database';
import { FOLDERS, LIBRARY, PREFERENCES, TAGS, libraryDefaults, enrichItem, itemFolders } from './library-records';
import type { LibraryFolder, LibraryItem, LibraryPatch, LibraryPreferences, LibraryQuery, LibraryRow, LibraryState, LibraryTag, LibraryTagInput, PdfBibliography } from '@/contracts/library';
import type { RecordStamp } from '@/contracts/common';
import type { DocumentRef } from '@/contracts/document';

const stores = [LIBRARY, FOLDERS, TAGS, PREFERENCES, 'documents', 'changes', 'meta'];
const req = <T>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
});
/** What the reader's 收藏 popover edits. */
export interface ReaderEntry { title: string; authors: string[]; venue?: string; year?: number; folderId: string | null; tags: readonly LibraryTagInput[] }
export class LibraryFault extends Error {
  constructor(readonly code: 'NOT_FOUND' | 'CONFLICT' | 'INVALID_INPUT', message: string) { super(message); }
}
const required = <T>(value: T | undefined, message = '记录不存在或已改变，请刷新后重试'): T => {
  if (!value) throw new LibraryFault('NOT_FOUND', message); return value;
};
const stamp = (id: string = crypto.randomUUID()): RecordStamp => {
  const at = new Date().toISOString(); return { id, createdAt: at, updatedAt: at, revision: crypto.randomUUID() };
};
function descendants(folders: readonly LibraryFolder[], root: string): Set<string> {
  const ids = new Set([root]);
  let changed = true;
  while (changed) { changed = false; for (const f of folders) if (f.parentId && ids.has(f.parentId) && !ids.has(f.id)) { ids.add(f.id); changed = true; } }
  return ids;
}
function row(item: LibraryItem, document?: StoredDocument): LibraryRow {
  return { ...item,
    document: document ? { documentId: document.id, fileVersion: document.fileVersion } : item.document,
    lastReadAt: document?.lastReadAt, pageCount: document?.pageCount,
    progress: document?.position && document.pageCount ? Math.min(1, (document.position.pageIndex + document.position.offset) / document.pageCount) : undefined,
    hasPdf: !!document && !document.deletedAt && !['local-missing', 'remote-missing'].includes(document.file.availability),
  };
}
export class LibraryDatabase extends PaperDatabase {
  private async run<T>(mode: IDBTransactionMode, fn: (tx: IDBTransaction) => Promise<T>, scope = stores): Promise<T> {
    const db = await this.open(); const tx = db.transaction(scope, mode, { durability: 'strict' });
    const done = new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); });
    // Attach the rejection handler immediately; callback errors may abort before awaiting completion.
    void done.catch(() => undefined);
    try { const result = await fn(tx); await done; return result; }
    catch (error) { try { tx.abort(); } catch { /* Already completed/aborted. */ } await done.catch(() => undefined); throw error; }
  }
  private async changed<T extends RecordStamp>(tx: IDBTransaction, store: string, item: T, operation = 'upsert'): Promise<T> {
    const device = await req(tx.objectStore('meta').get('deviceId'));
    const deviceId = device?.value ?? crypto.randomUUID();
    if (!device) tx.objectStore('meta').put({ key: 'deviceId', value: deviceId });
    const next = { ...item, revision: crypto.randomUUID(), updatedAt: new Date().toISOString() };
    tx.objectStore(store).put(next);
    tx.objectStore('changes').add({ entity: store === 'documents' ? 'document' : store, entityId: item.id, revision: next.revision, baseRevision: item.revision, deviceId, operation, at: next.updatedAt });
    return next;
  }
  async getItem(id: string): Promise<LibraryRow | undefined> {
    return this.run('readonly', async tx => {
      const item = await req(tx.objectStore(LIBRARY).get(id)) as LibraryItem | undefined;
      if (!item) return;
      const doc = item.documentId ? await req(tx.objectStore('documents').get(item.documentId)) : undefined;
      return row(item, doc);
    });
  }
  async getItemForDocument(documentId: string): Promise<LibraryRow | undefined> {
    return this.run('readonly', async tx => {
      const item = await req(tx.objectStore(LIBRARY).index('byDocument').get(documentId)) as LibraryItem | undefined;
      if (!item || item.deletedAt) return;
      const doc = await req(tx.objectStore('documents').get(documentId)) as StoredDocument | undefined;
      return row(item, doc);
    });
  }
  async saveBibliography(ref: DocumentRef, bibliography: PdfBibliography): Promise<void> {
    await this.run('readwrite', async tx => {
      const document = required(await req(tx.objectStore('documents').get(ref.documentId))) as StoredDocument;
      if (document.deletedAt || document.fileVersion !== ref.fileVersion) throw new LibraryFault('CONFLICT', 'PDF 版本已改变');
      const item = await req(tx.objectStore(LIBRARY).index('byDocument').get(ref.documentId)) as LibraryItem | undefined;
      if (item) {
        const next = enrichItem(item, bibliography, document.title);
        if (JSON.stringify(next) !== JSON.stringify(item)) await this.changed(tx, LIBRARY, next);
      }
      const title = document.title === document.originalFilename.replace(/\.pdf$/i, '') ? bibliography.title ?? document.title : document.title;
      await this.changed(tx, 'documents', { ...document, title, bibliography });
    });
  }
  async query(query: LibraryQuery, limit: number): Promise<Omit<LibraryState, 'query'>> {
    return this.run('readonly', async tx => {
      const folders = (await req(tx.objectStore(FOLDERS).getAll()) as LibraryFolder[]).filter(f => !f.deletedAt);
      const tags = (await req(tx.objectStore(TAGS).getAll()) as LibraryTag[]).filter(t => !t.deletedAt);
      const pref = await req(tx.objectStore(PREFERENCES).get('view'));
      const counts = { all: 0, recent: 0, starred: 0, unfiled: 0, folders: Object.fromEntries(folders.map(f => [f.id, 0])) };
      const folderSets = new Map(folders.map(f => [f.id, descendants(folders, f.id)]));
      const tagMap = new Map(tags.map(t => [t.id, t.label]));
      const items: LibraryRow[] = []; let total = 0;
      const collectionTags = new Set<string>();
      const needle = query.text.trim().normalize('NFKC').toLocaleLowerCase();
      const value = (item: LibraryRow): string | number => {
        switch (query.sort.column) {
          case 'starred': return Number(item.starred);
          case 'authors': return item.authors.join(' ');
          case 'tags': return item.tagIds.map(id => tagMap.get(id) ?? '').join(' ');
          case 'pages': return item.pageCount ?? -1;
          case 'year': return item.year ?? -1;
          default: return item[query.sort.column] ?? '';
        }
      };
      const compare = (a: LibraryRow, b: LibraryRow) => {
        const av = value(a), bv = value(b);
        const c = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv), 'zh-CN', { numeric: true });
        return (query.sort.direction === 'asc' ? c : -c) || a.id.localeCompare(b.id);
      };
      // Cursor scan supports substring search without retaining the entire library in memory.
      // Keep only the requested sorted window. Full-text/AI indices are separate future stores.
      await new Promise<void>((resolve, reject) => {
        const cursor = tx.objectStore(LIBRARY).index('byAddedAt').openCursor(null, query.sort.direction === 'asc' ? 'next' : 'prev');
        cursor.onerror = () => reject(cursor.error);
        cursor.onsuccess = () => {
          const current = cursor.result; if (!current) { resolve(); return; }
          const item = current.value as LibraryItem;
          if (item.deletedAt) { current.continue(); return; }
          const accept = (doc?: StoredDocument) => {
            try {
              const r = row(item, doc);
              if (item.inLibrary) {
                counts.all++; if (item.starred) counts.starred++; if (!itemFolders(item).length) counts.unfiled++;
                for (const [id, ids] of folderSets) if (itemFolders(item).some(folder => ids.has(folder))) counts.folders[id]!++;
              }
              if (r.lastReadAt) counts.recent++;
              let matches = query.collection.kind === 'recent' ? !!r.lastReadAt : item.inLibrary;
              if (query.collection.kind === 'starred') matches &&= item.starred;
              if (query.collection.kind === 'unfiled') matches &&= !itemFolders(item).length;
              if (query.collection.kind === 'folder') matches &&= itemFolders(item).some(id => folderSets.get((query.collection as {folderId:string}).folderId)?.has(id));
              if (matches) for (const id of item.tagIds) collectionTags.add(id);
              if (query.tagIds.length) matches &&= query.tagIds.some(id => item.tagIds.includes(id));
              if (needle) matches &&= query.fields.some(field => {
                const text = field === 'authors' ? item.authors.join(' ') : field === 'note' ? item.shortNote : field === 'body' || field === 'summary' ? '' : item[field];
                return (text ?? '').normalize('NFKC').toLocaleLowerCase().includes(needle);
              });
              if (matches) {
                total++;
                let low = 0, high = items.length;
                while (low < high) { const mid = (low + high) >>> 1; if (compare(items[mid]!, r) <= 0) low = mid + 1; else high = mid; }
                if (low < limit) { items.splice(low, 0, r); if (items.length > limit) items.pop(); }
              }
              current.continue();
            } catch (error) { reject(error); }
          };
          if (item.documentId) {
            const get = tx.objectStore('documents').get(item.documentId);
            get.onerror = () => reject(get.error); get.onsuccess = () => accept(get.result);
          } else accept();
        };
      });
      const annotations = tx.objectStore('annotations').index('byDocument');
      await Promise.all(items.map(async item => {
        const ref = item.document;
        const rows = ref ? await req(annotations.getAll([ref.documentId, ref.fileVersion])) : [];
        item.annotationCount = rows.filter(annotation => !annotation.deletedAt).length;
      }));
      return { items, total, folders, tags, counts, preferences: pref?.value ?? structuredClone(libraryDefaults), unavailableSearchFields: ['body', 'summary'], collectionTagIds: [...collectionTags] };
    }, [...stores, 'annotations']);
  }
  private async items(tx: IDBTransaction, ids: readonly string[]): Promise<LibraryItem[]> {
    return Promise.all([...new Set(ids)].map(async id => required(await req(tx.objectStore(LIBRARY).get(id)) as LibraryItem | undefined)));
  }
  async update(id: string, revision: string, patch: LibraryPatch, baseline?: LibraryPatch): Promise<void> {
    await this.run('readwrite', async tx => {
      const [item] = await this.items(tx, [id]);
      if (item!.revision !== revision && (!baseline || Object.keys(patch).some(key => !(key in baseline) || JSON.stringify(item![key as keyof LibraryPatch]) !== JSON.stringify(baseline[key as keyof LibraryPatch])))) {
        throw new LibraryFault('CONFLICT', '同一字段已有新修改，请核对最新内容后再修改');
      }
      const clean: LibraryPatch = {};
      for (const key of ['title', 'venue', 'abstract', 'shortNote'] as const) if (key in patch) {
        const value = patch[key];
        if (value !== undefined && (typeof value !== 'string' || value.length > 100_000)) throw new LibraryFault('INVALID_INPUT', '文字字段无效或过长');
        clean[key] = value?.trim();
      }
      if ('title' in clean && !clean.title) throw new LibraryFault('INVALID_INPUT', '标题不能为空');
      if ('authors' in patch) {
        if (!Array.isArray(patch.authors) || patch.authors.length > 1000 || patch.authors.some(a => typeof a !== 'string' || a.length > 1000)) throw new LibraryFault('INVALID_INPUT', '作者格式无效');
        clean.authors = patch.authors.map(a => a.trim()).filter(Boolean);
      }
      if ('year' in patch) {
        if (patch.year !== undefined && (!Number.isInteger(patch.year) || patch.year < 1 || patch.year > 9999)) throw new LibraryFault('INVALID_INPUT', '年份应为 1–9999 的整数');
        clean.year = patch.year;
      }
      await this.changed(tx, LIBRARY, { ...item!, ...clean, editedFields: [...new Set([...(item!.editedFields ?? []), ...Object.keys(clean)])] });
    });
  }
  async star(ids: readonly string[], starred: boolean): Promise<void> {
    await this.run('readwrite', async tx => { for (const item of await this.items(tx, ids)) await this.changed(tx, LIBRARY, { ...item, starred }); });
  }
  async toggleStars(ids: readonly string[]): Promise<void> {
    await this.run('readwrite', async tx => {
      const items = await this.items(tx, ids);
      const starred = !items.every(item => item.starred);
      for (const item of items) if (item.starred !== starred) await this.changed(tx, LIBRARY, { ...item, starred });
    });
  }
  async move(ids: readonly string[], folderId: string | null): Promise<void> {
    await this.run('readwrite', async tx => {
      if (folderId) { const folder = required(await req(tx.objectStore(FOLDERS).get(folderId)) as LibraryFolder); if (folder.deletedAt) throw new LibraryFault('NOT_FOUND', '文件夹已删除'); }
      for (const item of await this.items(tx, ids)) await this.changed(tx, LIBRARY, { ...item, folderId, folderIds: [] });
    });
  }
  async addTag(ids: readonly string[], input: LibraryTagInput): Promise<void> {
    return this.addTags(ids, [input]);
  }
  async addTags(ids: readonly string[], inputs: readonly LibraryTagInput[]): Promise<void> {
    if (!ids.length || !inputs.length) throw new LibraryFault('INVALID_INPUT', '请先选择论文和标签');
    const clean = inputs.map(input => {
      const label = typeof input.label === 'string' ? input.label.trim() : '';
      if (!label || label.length > 100) throw new LibraryFault('INVALID_INPUT', '标签应为 1–100 个字符');
      return { id: input.id, label, normalized: label.normalize('NFKC').toLocaleLowerCase() };
    });
    await this.run('readwrite', async tx => {
      const items = await this.items(tx, ids);
      const resolved = new Set<string>();
      for (const input of clean) {
        let tag = await req(input.id ? tx.objectStore(TAGS).get(input.id) : tx.objectStore(TAGS).index('byNormalized').get(input.normalized)) as LibraryTag | undefined;
        if (input.id) required(tag, '标签不存在，可能已在其他页面移除；请重新选择');
        if (tag?.deletedAt) throw new LibraryFault('NOT_FOUND', '标签已删除，请重新选择');
        if (!tag) tag = await this.changed(tx, TAGS, { ...stamp(), label: input.label, normalized: input.normalized });
        resolved.add(tag.id);
      }
      for (const item of items) {
        const tagIds = [...new Set([...item.tagIds, ...resolved])];
        if (tagIds.length !== item.tagIds.length) await this.changed(tx, LIBRARY, { ...item, tagIds });
      }
    });
  }
  async removeTag(id: string, tagId: string): Promise<void> {
    await this.run('readwrite', async tx => { const [item] = await this.items(tx, [id]); await this.changed(tx, LIBRARY, { ...item!, tagIds: item!.tagIds.filter(t => t !== tagId) }); });
  }
  async membership(ids: readonly string[], inLibrary: boolean): Promise<{ id: string; revision: string }[]> {
    return this.run('readwrite', async tx => {
      const changed = [];
      for (const item of await this.items(tx, ids)) changed.push(await this.changed(tx, LIBRARY, { ...item, inLibrary }));
      return changed.map(({ id, revision }) => ({ id, revision }));
    });
  }
  async restore(items: readonly { id: string; revision: string }[]): Promise<void> {
    await this.run('readwrite', async tx => {
      for (const expected of items) {
        const [item] = await this.items(tx, [expected.id]);
        if (item!.revision !== expected.revision) throw new LibraryFault('CONFLICT', '条目已有后续修改，无法直接撤销；可重新收藏');
        await this.changed(tx, LIBRARY, { ...item!, inLibrary: true });
      }
    });
  }
  async folder(action: 'create' | 'rename' | 'move' | 'delete', id: string, value?: string | null): Promise<void> {
    await this.run('readwrite', async tx => {
      const all = (await req(tx.objectStore(FOLDERS).getAll()) as LibraryFolder[]).filter(f => !f.deletedAt);
      if (action === 'create' && await req(tx.objectStore(FOLDERS).get(id))) throw new LibraryFault('CONFLICT', '文件夹标识已存在，请重试');
      const item = action === 'create' ? { ...stamp(id), name: '新建文件夹', parentId: value ?? null } : required(all.find(f => f.id === id), '文件夹不存在');
      if (action === 'rename') {
        const name = value?.trim(); if (!name || name.length > 200) throw new LibraryFault('INVALID_INPUT', '文件夹名应为 1–200 个字符'); item.name = name;
      }
      if (action === 'move' || action === 'create') {
        const parentId = value ?? null;
        if (parentId) required(all.find(f => f.id === parentId), '目标文件夹不存在');
        if (parentId && descendants(all, id).has(parentId)) throw new LibraryFault('INVALID_INPUT', '不能移入自己或自己的子文件夹');
        item.parentId = parentId;
      }
      if (action === 'delete') {
        if (all.some(f => f.parentId === id)) throw new LibraryFault('INVALID_INPUT', '请先清空子文件夹');
        const entries = await req(tx.objectStore(LIBRARY).getAll()) as LibraryItem[];
        if (entries.some(p => p.inLibrary && itemFolders(p).includes(id))) throw new LibraryFault('INVALID_INPUT', '请先移出文件夹内的论文');
        // Removed memberships must not retain dangling folder references when restored.
        for (const entry of entries.filter(p => itemFolders(p).includes(id))) { const remaining = itemFolders(entry).filter(folder => folder !== id); await this.changed(tx, LIBRARY, { ...entry, folderId: remaining[0] ?? null, folderIds: remaining.slice(1) }); }
        item.deletedAt = new Date().toISOString();
      }
      await this.changed(tx, FOLDERS, item, action === 'delete' ? 'delete' : 'upsert');
    });
  }
  async preferences(patch: Partial<LibraryPreferences>): Promise<void> {
    await this.run('readwrite', async tx => {
      const previous = await req(tx.objectStore(PREFERENCES).get('view'));
      tx.objectStore(PREFERENCES).put({ key: 'view', value: { ...(previous?.value ?? libraryDefaults), ...structuredClone(patch) } });
    });
  }
  /**
   * Saves the reader's 收藏 popover in one transaction: adds the open paper to the
   * library (its PDF then syncs with it) or edits its entry. Only the fields the
   * reader changed since opening the popover (baseline → entry) are written, so an
   * edit made meanwhile in another window survives; a field changed in both
   * places is a conflict. Returns whether an automatic translation was queued.
   */
  async saveDocumentEntry(ref: DocumentRef, entry: ReaderEntry, baseline: ReaderEntry): Promise<{ item: LibraryItem; translationQueued: boolean }> {
    const clean = (value: ReaderEntry) => ({
      title: value.title.trim(), authors: value.authors.map(a => a.trim()).filter(Boolean),
      venue: value.venue?.trim() || undefined, year: value.year, folderId: value.folderId,
    });
    const next = clean(entry), base = clean(baseline);
    if (!next.title || next.title.length > 100_000) throw new LibraryFault('INVALID_INPUT', '标题不能为空');
    if (next.year !== undefined && (!Number.isInteger(next.year) || next.year < 1 || next.year > 9999)) throw new LibraryFault('INVALID_INPUT', '年份应为 1–9999 的整数');
    const label = (tag: LibraryTagInput) => tag.label.trim().normalize('NFKC').toLocaleLowerCase();
    if (entry.tags.some(tag => !tag.label.trim() || tag.label.trim().length > 100)) throw new LibraryFault('INVALID_INPUT', '标签应为 1–100 个字符');
    const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
    return this.run('readwrite', async tx => {
      const document = required(await req(tx.objectStore('documents').get(ref.documentId)) as StoredDocument | undefined, '论文记录不存在，请重新打开');
      if (document.deletedAt) throw new LibraryFault('NOT_FOUND', '论文记录已删除，请重新导入');
      const item = required(await req(tx.objectStore(LIBRARY).index('byDocument').get(ref.documentId)) as LibraryItem | undefined, '文献库条目不存在，请重新打开论文');
      const adding = !item.inLibrary;
      const patch: Partial<LibraryItem> = {};
      const edited: string[] = [];
      for (const key of ['title', 'authors', 'venue', 'year'] as const) {
        if (same(next[key], base[key])) continue;
        if (!same(item[key], base[key]) && !same(item[key], next[key])) throw new LibraryFault('CONFLICT', '这篇论文的书目信息刚在别处改过，请重新打开收藏窗口核对后再保存');
        Object.assign(patch, { [key]: next[key] });
        edited.push(key);
      }
      // A paper being added takes the folder chosen now; an edit only moves it if the reader changed the folder.
      if (adding || next.folderId !== base.folderId) {
        if (!adding && item.folderId !== base.folderId && item.folderId !== next.folderId) throw new LibraryFault('CONFLICT', '这篇论文刚在别处移动过文件夹，请重新打开收藏窗口核对后再保存');
        if (next.folderId) {
          const folder = await req(tx.objectStore(FOLDERS).get(next.folderId)) as LibraryFolder | undefined;
          if (!folder || folder.deletedAt) throw new LibraryFault('NOT_FOUND', '所选文件夹已删除，请重新选择');
        }
        patch.folderId = next.folderId;
        patch.folderIds = next.folderId === item.folderId ? item.folderIds : [];
      }
      // Tags: apply the reader's additions and removals to the stored set.
      const baseIds = new Set(baseline.tags.flatMap(tag => tag.id ? [tag.id] : []));
      const baseLabels = new Set(baseline.tags.map(label));
      const removed = new Set([...baseIds].filter(id => !entry.tags.some(tag => tag.id === id)));
      let tagIds = (adding ? [] : item.tagIds).filter(id => !removed.has(id));
      for (const input of entry.tags) {
        if ((input.id && baseIds.has(input.id)) || (!input.id && baseLabels.has(label(input)))) { if (!adding) continue; }
        let tag = await req(input.id ? tx.objectStore(TAGS).get(input.id) : tx.objectStore(TAGS).index('byNormalized').get(label(input))) as LibraryTag | undefined;
        if (tag?.deletedAt) tag = undefined;
        if (!tag) tag = await this.changed(tx, TAGS, { ...stamp(), label: input.label.trim(), normalized: label(input) });
        tagIds.push(tag.id);
      }
      tagIds = [...new Set(tagIds)];
      if (adding && document.syncScope !== 'record-and-file') await this.changed(tx, 'documents', { ...document, syncScope: 'record-and-file' });
      // Joining the library counts as adding the paper for 「添加文档时自动翻译」, as an import does.
      let translationQueued = false;
      if (adding) {
        const preferences = await req(tx.objectStore('meta').get('readerPreferences')) as { value?: { autoTranslate?: string } } | undefined;
        if (preferences?.value?.autoTranslate === 'on-add') {
          const job = { documentId: ref.documentId, fileVersion: document.fileVersion };
          tx.objectStore('meta').put({ key: importJobKey(job), value: job });
          translationQueued = true;
        }
      }
      const saved = await this.changed(tx, LIBRARY, {
        ...item, ...patch, inLibrary: true, deletedAt: undefined, tagIds,
        addedAt: adding ? new Date().toISOString() : item.addedAt,
        editedFields: edited.length ? [...new Set([...(item.editedFields ?? []), ...edited])] : item.editedFields,
      });
      return { item: saved, translationQueued };
    });
  }
  /** Called after PDF import. Existing classification and manually edited metadata win. */
  async retainDocument(ref: DocumentRef, folderId: string | null, firstImport: boolean): Promise<LibraryItem> {
    return this.run('readwrite', async tx => {
      const item = required(await req(tx.objectStore(LIBRARY).index('byDocument').get(ref.documentId))) as LibraryItem;
      if (folderId) {
        const folder = await req(tx.objectStore(FOLDERS).get(folderId)) as LibraryFolder | undefined;
        if (!folder || folder.deletedAt) throw new LibraryFault('NOT_FOUND', '导入目标文件夹已删除；PDF 已保存在本机，请重新选择文件夹');
      }
      // A paper that was only read before (or never filed) takes the folder it was imported into.
      const unfiled = item.folderId === null && !item.folderIds?.length;
      return this.changed(tx, LIBRARY, { ...item, inLibrary: true, folderId: firstImport || unfiled ? folderId : item.folderId });
    });
  }
  async importBibliography(inputs: readonly Omit<LibraryItem, keyof RecordStamp | 'inLibrary' | 'addedAt' | 'starred' | 'folderId' | 'tagIds'>[], folderId: string | null): Promise<{ added: number; reused: number }> {
    return this.run('readwrite', async tx => {
      if (folderId) { const f = required(await req(tx.objectStore(FOLDERS).get(folderId))) as LibraryFolder; if (f.deletedAt) throw new LibraryFault('NOT_FOUND', '目标文件夹已删除'); }
      let added = 0, reused = 0;
      for (const input of inputs) {
        const existing = input.bibliographyKey ? await req(tx.objectStore(LIBRARY).index('byBibliographyKey').get(input.bibliographyKey)) as LibraryItem | undefined : undefined;
        if (existing) { reused++; if (!existing.inLibrary) await this.changed(tx, LIBRARY, { ...existing, inLibrary: true }); continue; }
        const s = stamp();
        await this.changed(tx, LIBRARY, { ...input, ...s, inLibrary: true, addedAt: s.createdAt, starred: false, folderId, tagIds: [] }); added++;
      }
      return { added, reused };
    });
  }
}
