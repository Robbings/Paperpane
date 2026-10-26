import type { Annotation, AnnotationService, AnnotationState } from '../annotations';
import type { DocumentAnchor, DocumentRef } from '../document';
import { failure, success } from '../common';
import { demoId, demoStore, now } from './store';
export function validAnchor(anchor: DocumentAnchor, ref: DocumentRef): boolean {
  return anchor.documentId === ref.documentId && anchor.fileVersion === ref.fileVersion && anchor.pages.length > 0 && anchor.pages.every((page) =>
    Number.isInteger(page.pageIndex) && page.pageIndex >= 0 && page.rects.length > 0 && page.rects.every((rect) =>
      [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) && rect.width >= 0 && rect.height >= 0));
}
export function createDemoAnnotations(document: DocumentRef) {
  const store = demoStore<AnnotationState>({ document, items: [] });
  async function mutate(id: string, revision: string, change: (item: Annotation) => Annotation) {
    const gate = await store.gate(); if (!gate.ok) return gate;
    const item = store.data().items.find((entry) => entry.id === id);
    if (!item) return failure('NOT_FOUND', '批注不存在');
    if (item.revision !== revision) return failure('CONFLICT', '批注已被修改', ['reload']);
    const updated = { ...change(item), revision: demoId(), updatedAt: now() };
    store.update({ ...store.data(), items: store.data().items.map((entry) => entry.id === id ? updated : entry) });
    return success(structuredClone(updated));
  }
  const service: AnnotationService = {
    ...store.readable,
    async create(input) {
      input = structuredClone(input);
      const gate = await store.gate(); if (!gate.ok) return gate;
      const anchor = input.kind === 'page-comment' ? input.anchor : input.selection.anchor;
      if (!validAnchor(anchor, document)) return failure('INVALID_INPUT', '批注锚点无效或不属于当前文件版本');
      const item: Annotation = { id: demoId(), revision: demoId(), createdAt: now(), updatedAt: now(), anchor,
        kind: input.kind, color: input.color, quote: input.kind === 'page-comment' ? '' : input.selection.text,
        comment: input.comment ?? '', source: { kind: 'user' }, save: { local: 'saved', sync: 'unconfigured' } };
      store.update({ ...store.data(), items: [...store.data().items, item] }); return success(structuredClone(item));
    },
    async update(id, revision, patch) {
      patch = structuredClone(patch);
      const current = store.data().items.find((item) => item.id === id);
      if (current?.deletedAt) return failure('INVALID_INPUT', '请先恢复已删除的批注');
      if (patch.anchor && (current?.kind !== 'page-comment' || !validAnchor(patch.anchor, document))) return failure('INVALID_INPUT', '只有页面评论可移动，且不能跨文件版本');
      return mutate(id, revision, (item) => ({ ...item, ...patch }));
    },
    remove: (id, revision) => mutate(id, revision, (item) => ({ ...item, deletedAt: now() })),
    restore: (id, revision) => mutate(id, revision, (item) => ({ ...item, deletedAt: undefined })),
    async export(format) {
      const gate = await store.gate(); if (!gate.ok) return gate;
      const items = store.data().items.filter((item) => !item.deletedAt);
      // Prefix spreadsheet formulas before CSV quoting; content may come from PDFs or models.
      const csv = (text: string) => '"' + (/^[\s]*[=+@-]/u.test(text) ? "'" + text : text).replaceAll('"', '""') + '"';
      const text = format === 'csv'
        ? [['page', 'quote', 'comment', 'color'], ...items.map((item) => [String((item.anchor.pages[0]?.pageIndex ?? 0) + 1), item.quote, item.comment, item.color])].map((row) => row.map(csv).join(',')).join('\r\n')
        : items.map((item) => `## 第 ${(item.anchor.pages[0]?.pageIndex ?? 0) + 1} 页\n\n${item.quote.split('\n').map((line) => `> ${line}`).join('\n')}\n\n${item.comment}`).join('\n\n');
      return success({ filename: `annotations.${format === 'csv' ? 'csv' : 'md'}`, mimeType: format === 'csv' ? 'text/csv;charset=utf-8' : 'text/markdown;charset=utf-8', text, warnings: [] });
    },
  };
  return { service, controls: store.controls };
}
