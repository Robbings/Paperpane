import type { LibraryService } from '@/contracts/library';
import type { LibraryDatabase } from '@/data/library-database';
import { PDF_BIBLIOGRAPHY_VERSION } from '@/document/bibliography';
import type { createLibraryImports } from './imports';

/** Lazily upgrade visible legacy entries, one worker at a time. All work stays local. */
export function createLibraryEnrichment(database: LibraryDatabase, service: LibraryService, imports: ReturnType<typeof createLibraryImports>, onSaved: () => Promise<void>) {
  const attempted = new Set<string>(); let busy = false, disposed = false;
  let controller: AbortController | undefined;
  const importing = () => imports.getSnapshot().some(j => !['completed', 'failed', 'cancelled'].includes(j.phase));
  async function pump() {
    if (busy || disposed || importing()) return;
    const item = service.getSnapshot().data.items.find(i => i.document && i.hasPdf && !attempted.has(i.document.documentId));
    if (!item?.document) return;
    busy = true; controller = new AbortController(); const current = controller;
    try {
      const document = await database.getDocument(item.document.documentId);
      if (!document || (document.bibliography?.version ?? 0) >= PDF_BIBLIOGRAPHY_VERSION) { attempted.add(item.document.documentId); return; }
      if (current.signal.aborted) return;
      const blob = await database.readFile(item.document);
      if (current.signal.aborted) return;
      const { inspectPdf } = await import('@/document/inspect-pdf');
      if (current.signal.aborted) return;
      const bytes = new Uint8Array(await blob.arrayBuffer());
      // Old encrypted PDFs require the explicit import password flow; never retain passwords.
      const result = await inspectPdf(bytes, current.signal, () => { attempted.add(item.document!.documentId); current.abort(); }, { metadataOnly: true });
      if (current.signal.aborted) return;
      await database.saveBibliography(item.document, result.bibliography);
      attempted.add(item.document.documentId); await onSaved();
    } catch { if (!current.signal.aborted) attempted.add(item.document.documentId); }
    finally { busy = false; controller = undefined; if (!disposed) void pump(); }
  }
  const unsubscribe = service.subscribe(() => { void pump(); });
  const unsubscribeImports = imports.subscribe(() => { if (importing()) controller?.abort(); else void pump(); });
  void pump();
  return { dispose() { disposed = true; controller?.abort(); unsubscribe(); unsubscribeImports(); } };
}
