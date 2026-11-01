import type { ZoteroCollection, ZoteroItem } from './types';

export type ImportDestination = { kind: 'folder'; folderId: string | null } | { kind: 'collections'; collections: readonly ZoteroCollection[] };
export type FolderOption = { id: string; name: string; parentId: string | null };
export function folderLabel(folders: readonly FolderOption[], id: string | null): string {
  const parts: string[] = [], seen = new Set<string>();
  while (id) {
    if (seen.has(id)) throw new Error('分类目录存在循环，请先在 Zotero 中整理');
    seen.add(id); const folder = folders.find(f => f.id === id);
    if (!folder) { parts.unshift('未知分类'); break; }
    parts.unshift(folder.name); id = folder.parentId;
  }
  return parts.join(' / ') || '未分类';
}
export const collectionFolders = (collections: readonly ZoteroCollection[]): FolderOption[] => collections.map(c => ({ id: c.key, name: c.data.name, parentId: c.data.parentCollection || null }));
export function collectionLabels(item: ZoteroItem, collections: readonly ZoteroCollection[]): string[] {
  return (item.data.collections ?? []).map(id => folderLabel(collectionFolders(collections), id)).sort((a,b)=>a.localeCompare(b,'zh-CN'));
}
export const importable = (item: ZoteroItem) => !['note', 'annotation'].includes(item.data.itemType);
export function collectionPlan(userId: string, collections: readonly ZoteroCollection[], keys: readonly string[]) {
  const root = `zotero-folder:${userId}:root`, folders = new Map<string, FolderOption>();
  folders.set(root, { id: root, name: 'Zotero', parentId: null });
  const visit = (key: string, ancestors = new Set<string>()): string => {
    if (ancestors.has(key)) throw new Error('Zotero 分类目录存在循环');
    const row = collections.find(c => c.key === key); if (!row) throw new Error('Zotero 分类已改变，请重新读取后导入');
    const id = `zotero-folder:${userId}:${key}`; if (folders.has(id)) return id;
    const next = new Set(ancestors).add(key);
    const parentId = row.data.parentCollection ? visit(row.data.parentCollection, next) : root;
    folders.set(id, { id, name: row.data.name, parentId }); return id;
  };
  const memberships = [...new Set(keys)].map(key => visit(key));
  if (!memberships.length) {
    const id = `zotero-folder:${userId}:unfiled`;
    folders.set(id, { id, name: '未分类', parentId: root }); memberships.push(id);
  }
  return { folders: [...folders.values()], memberships };
}
