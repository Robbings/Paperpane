import type { StoredDocument } from '@/data/database';
import { abortIfNeeded } from './errors';

/** A fallback for throttled downloads, not a replacement for fresh URL imports. */
export async function readableLocalSource(database: { list(): Promise<StoredDocument[]>; readFile(doc: StoredDocument): Promise<Blob> }, url: string, signal: AbortSignal): Promise<StoredDocument | undefined> {
  for (const doc of await database.list()) {
    abortIfNeeded(signal);
    if (doc.sourceUrl !== url && !doc.sources?.includes(url)) continue;
    try { if ((await database.readFile(doc)).size > 0) return doc; }
    catch { abortIfNeeded(signal); }
  }
  return undefined;
}
