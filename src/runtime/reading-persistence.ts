import type { DocumentRef, ReadingPosition } from '@/contracts/document';
import type { PaperDatabase } from '@/data/database';

/** Coalesce scroll bursts, serialize writes, and never overwrite a newer pending position. */
export function readingPersistence(db: PaperDatabase, ref: DocumentRef, onError: () => void) {
  let pending: ReadingPosition | undefined, timer: ReturnType<typeof setTimeout> | undefined;
  let writing: Promise<void> | undefined, last = '', closed = false;
  const channel = new BroadcastChannel('paperpane-documents');
  async function flush(): Promise<void> {
    clearTimeout(timer); timer = undefined;
    if (writing) { await writing; if (pending) return flush(); return; }
    const value = pending; if (!value) return; pending = undefined;
    writing = db.recordReading(ref, value).then(() => { if (!closed) channel.postMessage({ kind: 'invalidate' }); })
      .catch(() => { last = ''; onError(); }).finally(() => { writing = undefined; });
    await writing;
    if (pending) await flush();
  }
  const hide = () => { if (document.visibilityState === 'hidden') void flush(); };
  const leave = () => { void flush(); };
  document.addEventListener('visibilitychange', hide); window.addEventListener('pagehide', leave);
  return {
    update(position: ReadingPosition) {
      const key = JSON.stringify(position); if (key === last || closed) return; last = key;
      pending = structuredClone(position);
      // Fixed deadline rather than a trailing debounce: continuous scrolling still saves.
      if (!timer) timer = setTimeout(() => { void flush(); }, 300);
    },
    async dispose() {
      closed = true; document.removeEventListener('visibilitychange', hide); window.removeEventListener('pagehide', leave);
      await flush(); channel.close();
    },
  };
}
