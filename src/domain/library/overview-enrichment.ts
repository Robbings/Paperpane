import type { LibraryService } from '@/contracts/library';
import { queryDefaults } from '@/data/library-records';
import type { LibraryDatabase } from '@/data/library-database';
import { ModelSettingsStore } from '@/data/model-settings';
import { PreferenceStore } from '@/data/preference-store';
import { ResearchStore } from '@/ai/store';
import { overviewMetadata } from '@/ai/overview-metadata';
import { DEFAULT_PREFERENCES } from '@/ui/settings/types';
import type { ResearchService } from '@/ai/service';

/** One queued PDF at a time; the research service owns cross-tab deduplication. */
export function createOverviewEnrichment(database: LibraryDatabase, library: LibraryService, onSaved: () => Promise<void>) {
  const attempted = new Set<string>();
  let busy = false, disposed = false, active: ResearchService | undefined;
  async function pump() {
    if (busy || disposed) return;
    busy = true;
    let found = false;
    const settings = new ModelSettingsStore(), preferences = new PreferenceStore(), store = new ResearchStore();
    try {
      // Query the whole library: newly imported papers may be outside the current
      // folder/filter or beyond the first visible page.
      const rows = await database.query(queryDefaults, Number.MAX_SAFE_INTEGER);
      const item = rows.items.find(item => item.hasPdf && item.document &&
        (!item.abstract || !item.tagIds.length) && !attempted.has(`${item.id}:${item.document.fileVersion}`));
      if (!item?.document || disposed) return;
      found = true;
      const ref = item.document;
      attempted.add(`${item.id}:${ref.fileVersion}`);
      const record = await store.read(`ai-v1:${ref.documentId}:${ref.fileVersion}`);
      const cached = overviewMetadata(record.overviews.find(run => run.id === record.activeOverviewId) ?? record.overviews.at(-1));
      if (cached.abstract || cached.tags?.length) {
        await database.saveOverviewMetadata(ref, cached);
        await onSaved();
      }
      if (cached.abstract && cached.tags?.length) return;
      const view = await settings.view();
      if (disposed || !view.models.length || view.features.find(f => f.feature === 'overview')?.enabled === false) return;
      const prefs = { ...DEFAULT_PREFERENCES, ...await preferences.read() };
      const { ResearchService } = await import('@/ai/service');
      const { extractStoredPaper } = await import('@/document/extract-stored-paper');
      if (disposed) return;
      active = new ResearchService(ref, signal => extractStoredPaper(database, ref, signal), prefs, true);
      await active.load();
      if (!disposed) await active.overview();
      await onSaved();
    } catch { /* Retry on the next visit or configuration change; imports remain usable. */ }
    finally {
      await active?.dispose(); active = undefined;
      await Promise.all([settings.close(), preferences.close(), store.close()]);
      busy = false;
      if (!disposed && found) void pump();
    }
  }
  const off = library.subscribe(() => { void pump(); });
  const channel = new BroadcastChannel('paperpane-model-settings');
  channel.onmessage = () => { attempted.clear(); void pump(); };
  void pump();
  return { dispose() { disposed = true; off(); channel.close(); void active?.dispose(); } };
}
