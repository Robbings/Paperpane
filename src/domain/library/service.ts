import { failure, success, type Result, type Snapshot } from '@/contracts/common';
import type { LibraryService, LibraryState } from '@/contracts/library';
import { LibraryDatabase, LibraryFault } from '@/data/library-database';
import { libraryDefaults, queryDefaults } from '@/data/library-records';
import { importError } from '@/document/errors';
import { StorageFault } from '@/data/database';

function libraryError(error: unknown, operation: 'read' | 'write') {
  const detail = importError(error);
  if (detail.code === 'QUOTA_EXCEEDED') return { ...detail, message: '本机存储空间不足，修改未保存' };
  if (detail.code === 'SAVE_FAILED' && !(error instanceof StorageFault)) return { ...detail, message: operation === 'read' ? '无法读取文献库，请重试' : '文献库保存失败，请重试' };
  return detail;
}

function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); Object.values(value).forEach(freeze); }
  return value;
}

export function createLibraryService(database = new LibraryDatabase()) {
  let snapshot: Snapshot<LibraryState> = { mode: 'live', state: 'loading', data: {
    items: [], total: 0, folders: [], tags: [], counts: { all: 0, recent: 0, starred: 0, unfiled: 0, folders: {} },
    query: structuredClone(queryDefaults), preferences: structuredClone(libraryDefaults), unavailableSearchFields: ['body', 'summary'],
  } };
  let limit = 60, epoch = 0, disposed = false;
  const listeners = new Set<() => void>();
  const channel = new BroadcastChannel('paperpane-documents');
  freeze(snapshot);
  const publish = (next: Snapshot<LibraryState>) => { if (!disposed) { snapshot = freeze(next); listeners.forEach(fn => fn()); } };
  async function refresh() {
    const ticket = ++epoch, query = structuredClone(snapshot.data.query);
    try {
      const data = await database.query(query, limit);
      if (ticket === epoch) publish({ mode: 'live', state: 'ready', data: { ...data, query } });
    } catch (error) {
      if (ticket === epoch) publish({ ...snapshot, state: snapshot.data.items.length ? 'partial' : 'failed', error: libraryError(error, 'read') });
    }
  }
  async function mutate<T>(action: () => Promise<T>): Promise<Result<T>> {
    if (disposed) return failure('CANCELLED', '页面已关闭');
    try { const result = await action(); channel.postMessage({ kind: 'invalidate' }); await refresh(); return success(result); }
    catch (error) {
      await refresh();
      return error instanceof LibraryFault ? failure(error.code, error.message, ['reload']) : { ok: false, error: libraryError(error, 'write') };
    }
  }
  channel.onmessage = () => void refresh();
  const annotations = new BroadcastChannel('paperpane-annotations');
  annotations.onmessage = ({ data }) => {
    if (data?.countChanged) void refresh();
  };
  const visible = () => { if (document.visibilityState === 'visible') void refresh(); };
  document.addEventListener('visibilitychange', visible);
  const service: LibraryService = {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    setQuery(patch) { limit = 60; publish({ ...snapshot, data: { ...snapshot.data, query: { ...snapshot.data.query, ...structuredClone(patch) } } }); void refresh(); },
    loadMore() { if (limit >= snapshot.data.total) return; limit += 60; void refresh(); },
    update: (id, revision, patch, baseline) => mutate(() => database.update(id, revision, patch, baseline)),
    star: (ids, on) => mutate(() => database.star(ids, on)),
    toggleStars: ids => mutate(() => database.toggleStars([...ids])),
    move: (ids, folderId) => mutate(() => database.move(ids, folderId)),
    addTag: (ids, tag) => mutate(() => database.addTag(ids, tag)),
    addTags: (ids, tags) => { const captured = structuredClone(tags); return mutate(() => database.addTags([...ids], captured)); },
    removeTag: (id, tagId) => mutate(() => database.removeTag(id, tagId)),
    remove: ids => mutate(() => database.membership(ids, false)),
    restore: items => mutate(() => database.restore(items)),
    createFolder: (id, parentId) => mutate(() => database.folder('create', id, parentId)),
    renameFolder: (id, name) => mutate(() => database.folder('rename', id, name)),
    moveFolder: (id, parentId) => mutate(() => database.folder('move', id, parentId)),
    deleteFolder: id => mutate(() => database.folder('delete', id)),
    setPreferences: patch => mutate(() => database.preferences(patch)),
  };
  void refresh();
  return { database, service, refresh, mutate,
    async invalidate() { if (!disposed) { channel.postMessage({ kind: 'invalidate' }); await refresh(); } },
    dispose() { disposed = true; epoch++; channel.close(); annotations.close(); listeners.clear(); document.removeEventListener('visibilitychange', visible); },
  };
}
