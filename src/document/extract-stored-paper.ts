import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PaperDatabase } from '@/data/database';
import type { DocumentRef } from '@/contracts/document';
import { TranslationStore } from '@/data/translation-store';
import { extractPaper, EXTRACTION_VERSION } from '@/translation/extract';
import { pdfjsResources } from './pdfjs-resources';
GlobalWorkerOptions.workerSrc = workerUrl;

export async function extractStoredPaper(database: PaperDatabase, ref: DocumentRef, signal: AbortSignal) {
  const store = new TranslationStore();
  try {
    signal.throwIfAborted();
    const cached = await store.extraction(ref, EXTRACTION_VERSION);
    if (cached) return cached;
    const blob = await database.readFile(ref);
    signal.throwIfAborted();
    const task = getDocument({ ...pdfjsResources(), data: new Uint8Array(await blob.arrayBuffer()), useWorkerFetch: false, enableXfa: false });
    const abort = () => { void task.destroy().catch(() => {}); };
    signal.addEventListener('abort', abort, { once: true });
    try {
      signal.throwIfAborted();
      const pdf = await task.promise;
      const paper = await extractPaper(pdf, ref, signal);
      signal.throwIfAborted();
      await store.saveExtraction(paper);
      return paper;
    } finally { signal.removeEventListener('abort', abort); await task.destroy().catch(() => {}); }
  } finally { await store.close(); }
}
