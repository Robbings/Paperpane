import { PaperDatabase, type StoredDocument } from './database';
import type { Annotation, AnnotationNoteLayout, NewAnnotation, AnnotationLayoutRecord } from '@/contracts/annotations';
import type { DocumentRef, DocumentRecord } from '@/contracts/document';
import type { ErrorCode, RecordStamp } from '@/contracts/common';

export class AnnotationFault extends Error { constructor(readonly code: ErrorCode, message: string) { super(message); } }
const key = (ref: DocumentRef) => [ref.documentId, ref.fileVersion];
const request = <T>(req: IDBRequest<T>) => new Promise<T>((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
const colors = new Set(['yellow', 'green', 'blue', 'pink', 'purple']);
export class AnnotationDatabase extends PaperDatabase {
  /** Read-only boundary: the library owns item identity and PDF association. */
  async resolveReaderDocument(id: string): Promise<StoredDocument | undefined> {
    const direct = await this.getDocument(id); if (direct) return direct;
    const db = await this.open();
    const tx = db.transaction('libraryItems', 'readonly');
    const item = await request(tx.objectStore('libraryItems').get(id));
    return item?.document?.documentId && !item.deletedAt ? this.getDocument(item.document.documentId) : undefined;
  }
  private async run<T>(mode: IDBTransactionMode, action: (tx: IDBTransaction) => Promise<T>): Promise<T> {
    const db = await this.open();
    const tx = db.transaction(['annotations', 'annotationLayouts', 'documents', 'changes', 'meta'], mode, { durability: 'strict' });
    const done = new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); });
    void done.catch(() => undefined);
    try { const value = await action(tx); await done; return value; }
    catch (error) { try { tx.abort(); } catch {} await done.catch(() => undefined); throw error; }
  }
  private async document(tx: IDBTransaction, ref: DocumentRef): Promise<DocumentRecord> {
    const doc = await request(tx.objectStore('documents').get(ref.documentId)) as DocumentRecord | undefined;
    if (!doc || doc.deletedAt || doc.fileVersion !== ref.fileVersion) throw new AnnotationFault('NOT_FOUND', '此 PDF 版本已不可用，请重新打开文献库中的原文件。');
    return doc;
  }
  private async write<T extends RecordStamp>(tx: IDBTransaction, store: string, ref: DocumentRef, row: T, operation: string, baseRevision?: string): Promise<T> {
    const device = await request(tx.objectStore('meta').get('deviceId'));
    const deviceId = device?.value ?? crypto.randomUUID();
    if (!device) tx.objectStore('meta').put({ key: 'deviceId', value: deviceId });
    tx.objectStore(store).put(store === 'documents' ? row : { ...row, documentKey: key(ref) });
    tx.objectStore('changes').add({ entity: store === 'documents' ? 'document' : store, entityId: row.id, documentId: ref.documentId, fileVersion: ref.fileVersion, revision: row.revision, baseRevision, deviceId, operation, at: row.updatedAt });
    return row;
  }
  async load(ref: DocumentRef): Promise<{ items: Annotation[]; layouts: AnnotationLayoutRecord[] }> {
    return this.run('readonly', async tx => {
      await this.document(tx, ref);
      const items = await request(tx.objectStore('annotations').index('byDocument').getAll(IDBKeyRange.only(key(ref)))) as Annotation[];
      const layouts = await request(tx.objectStore('annotationLayouts').index('byDocument').getAll(IDBKeyRange.only(key(ref)))) as AnnotationLayoutRecord[];
      return { items, layouts };
    });
  }
  async create(ref: DocumentRef, input: NewAnnotation, id: string): Promise<Annotation> {
    return this.run('readwrite', async tx => {
      const doc = await this.document(tx, ref); const anchor = input.kind === 'page-comment' ? input.anchor : input.selection.anchor;
      if (anchor.documentId !== ref.documentId || anchor.fileVersion !== ref.fileVersion || !anchor.pages.length || anchor.pages.some(p => !Number.isInteger(p.pageIndex) || p.pageIndex < 0 || p.pageIndex >= (doc.pageCount ?? 0) || !p.rects.length || p.rects.some(r => ![r.x,r.y,r.width,r.height].every(Number.isFinite) || r.width <= 0 || r.height <= 0)) || !colors.has(input.color)) throw new AnnotationFault('INVALID_INPUT', '批注的原文坐标或颜色无效。');
      if (input.comment !== undefined && (typeof input.comment !== 'string' || input.comment.length > 200000)) throw new AnnotationFault('INVALID_INPUT', '评论无效或过长。');
      const existing = await request(tx.objectStore('annotations').get(id)) as Annotation | undefined;
      if (existing) { if (existing.anchor.documentId !== ref.documentId || existing.anchor.fileVersion !== ref.fileVersion) throw new AnnotationFault('CONFLICT', '批注标识冲突。'); return existing; }
      const at = new Date().toISOString();
      const row: Annotation = { id, revision: crypto.randomUUID(), createdAt: at, updatedAt: at, anchor: structuredClone(anchor), kind: input.kind, color: input.color, quote: input.kind === 'page-comment' ? '' : input.selection.text, comment: input.comment ?? '', source: { kind: 'user' }, save: { local: 'saved', sync: 'unconfigured' } };
      if (doc.syncScope !== 'record-and-file') {
        const promoted = { ...doc, syncScope: 'record-and-file' as const, revision: crypto.randomUUID(), updatedAt: at, save: { local: 'saved' as const, sync: doc.save.sync === 'unconfigured' ? 'unconfigured' as const : 'pending' as const } };
        await this.write(tx, 'documents', ref, promoted, 'upsert', doc.revision);
      }
      return this.write(tx, 'annotations', ref, row, 'upsert');
    });
  }
  async mutate(ref: DocumentRef, id: string, expected: string, patch: { color?: Annotation['color']; comment?: string; kind?: 'highlight' | 'selection-comment' }, operation: 'update' | 'delete' | 'restore' = 'update'): Promise<Annotation> {
    return this.run('readwrite', async tx => {
      await this.document(tx, ref);
      const row = await request(tx.objectStore('annotations').get(id)) as Annotation | undefined;
      if (!row || row.anchor.documentId !== ref.documentId || row.anchor.fileVersion !== ref.fileVersion) throw new AnnotationFault('NOT_FOUND', '批注不存在。');
      if (row.revision !== expected) throw new AnnotationFault('CONFLICT', '此批注已在其他窗口修改。你的草稿仍保留，请先核对最新内容。');
      if ((operation === 'restore') !== Boolean(row.deletedAt)) throw new AnnotationFault('CONFLICT', '批注状态已改变。');
      if (patch.kind !== undefined && (row.kind === 'page-comment' || !['highlight', 'selection-comment'].includes(patch.kind))) throw new AnnotationFault('INVALID_INPUT', '这条批注不能切换高亮。');
      if ((patch.color !== undefined && !colors.has(patch.color)) || (patch.comment !== undefined && (typeof patch.comment !== 'string' || patch.comment.length > 200000))) throw new AnnotationFault('INVALID_INPUT', '批注内容无效或过长。');
      const at = new Date().toISOString();
      const next: Annotation = { ...row, ...patch, revision: crypto.randomUUID(), updatedAt: at, deletedAt: operation === 'delete' ? at : undefined, save: { local: 'saved', sync: row.save.sync === 'unconfigured' ? 'unconfigured' : 'pending' } };
      return this.write(tx, 'annotations', ref, next, operation === 'delete' ? 'delete' : 'upsert', row.revision);
    });
  }
  async layout(ref: DocumentRef, layout: AnnotationNoteLayout, expected?: string): Promise<AnnotationLayoutRecord> {
    return this.run('readwrite', async tx => {
      await this.document(tx, ref);
      const annotation = await request(tx.objectStore('annotations').get(layout.id)) as Annotation | undefined;
      if (!annotation || annotation.deletedAt || annotation.anchor.documentId !== ref.documentId || annotation.anchor.fileVersion !== ref.fileVersion) throw new AnnotationFault('NOT_FOUND', '便签对应的批注已不可用。');
      if ((layout.zoom !== undefined && (!Number.isFinite(layout.zoom) || layout.zoom < 25 || layout.zoom > 400)) || ![layout.dx,layout.dy,layout.width,layout.height,layout.z].every(Number.isFinite) || typeof layout.open !== 'boolean' || typeof layout.collapsed !== 'boolean' || layout.width < 100 || layout.height < 34 || layout.width > 2000 || layout.height > 2000) throw new AnnotationFault('INVALID_INPUT', '便签尺寸无效。');
      const old = await request(tx.objectStore('annotationLayouts').get(layout.id)) as AnnotationLayoutRecord | undefined;
      if (old?.revision !== expected) throw new AnnotationFault('CONFLICT', '便签布局已在其他窗口修改。');
      const at = new Date().toISOString();
      const row: AnnotationLayoutRecord = { id: layout.id, document: ref, layout: structuredClone(layout), createdAt: old?.createdAt ?? at, updatedAt: at, revision: crypto.randomUUID() };
      return this.write(tx, 'annotationLayouts', ref, row, 'upsert', old?.revision);
    });
  }
}
