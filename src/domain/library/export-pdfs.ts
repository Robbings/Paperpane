import { zipSync } from 'fflate';
import { AnnotationDatabase } from '@/data/annotation-database';
import type { LibraryItem } from '@/contracts/library';
import { annotatedPdf } from '@/document/reader/export-pdf';

/** Export durable PDFs, including saved annotations, independently of mounted reader pages. */
export async function exportLibraryPdfs(items: readonly LibraryItem[]) {
  const db = new AnnotationDatabase();
  const files: { name: string; bytes: Uint8Array }[] = [];
  const missing: string[] = [];
  try {
    for (const item of items) {
      if (!item.document) { missing.push(item.title); continue; }
      const doc = await db.getDocument(item.document.documentId);
      if (!doc || doc.fileVersion !== item.document.fileVersion) throw new Error(`「${item.title}」的 PDF 已改变，请重新选择`);
      const original = await db.readFile(doc);
      const rows = (await db.load(item.document)).items.filter(row => !row.deletedAt);
      const bytes = new Uint8Array(await original.arrayBuffer());
      const name = (item.title || doc.originalFilename || 'paper').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/\.pdf$/i, '').slice(0, 150) + '.pdf';
      files.push({ name, bytes: rows.length ? await annotatedPdf(bytes, rows) : bytes });
    }
    if (!files.length) throw new Error('所选条目没有可导出的 PDF');
    if (files.length === 1) return { blob: new Blob([new Uint8Array(files[0]!.bytes)], { type: 'application/pdf' }), name: files[0]!.name, missing };
    const entries = Object.fromEntries(files.map((file, index) => [`${index + 1}-${file.name}`, file.bytes]));
    return { blob: new Blob([new Uint8Array(zipSync(entries, { level: 0 }))], { type: 'application/zip' }), name: 'Paperpane-PDFs.zip', missing };
  } finally { await db.close(); }
}
