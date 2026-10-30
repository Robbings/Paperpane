import { toDraft, type SettingsDraft, type SettingsView as SettingsSnapshot } from './types.ts';

type Json = unknown;
const same = (a: Json, b: Json) => JSON.stringify(a) === JSON.stringify(b);
const isPlain = (v: Json): v is Record<string, Json> => typeof v === 'object' && v !== null && !Array.isArray(v);
/** Lists whose items carry an identity merge item by item. */
const itemKey = (v: Json) => (isPlain(v) ? ((v.id ?? v.feature) as string | undefined) : undefined);

/**
 * Three-way merge after a conflict: starting from what this page loaded (base),
 * keep every field the other window changed (latest) and every field this page
 * changed (mine). A field both changed to different values is a conflict: this
 * page's value is used and the path is reported, so the reader decides knowingly.
 */
function merge3(base: Json, latest: Json, mine: Json, path: string, conflicts: string[]): Json {
  if (same(mine, base)) return latest;
  if (same(latest, base) || same(mine, latest)) return mine;
  if (isPlain(base) && isPlain(latest) && isPlain(mine)) {
    const out: Record<string, Json> = {};
    for (const key of new Set([...Object.keys(latest), ...Object.keys(mine)])) {
      const value = merge3(base[key], latest[key], mine[key], path ? `${path}.${key}` : key, conflicts);
      if (value !== undefined) out[key] = value;
    }
    return out;
  }
  if (Array.isArray(base) && Array.isArray(latest) && Array.isArray(mine) && [...base, ...latest, ...mine].every((v) => itemKey(v) !== undefined)) {
    const find = (list: Json[], key: string) => list.find((v) => itemKey(v) === key);
    const keys = [...new Set([...latest, ...mine].map((v) => itemKey(v)!))];
    const out: Json[] = [];
    for (const key of keys) {
      const value = merge3(find(base, key), find(latest, key), find(mine, key), `${path}.${key}`, conflicts);
      if (value !== undefined) out.push(value);
    }
    return out;
  }
  // Metadata overrides are per-field flags: independent additions/removals
  // must not overwrite each other when two model drawers are merged.
  if (path.endsWith('.overrides') && [base, latest, mine].every((v) => v === undefined || (Array.isArray(v) && v.every((key) => typeof key === 'string')))) {
    const before = (base ?? []) as string[], theirs = (latest ?? []) as string[], ours = (mine ?? []) as string[];
    return [...new Set([...theirs, ...ours])].filter((key) => !before.includes(key) || (theirs.includes(key) && ours.includes(key)));
  }
  conflicts.push(path);
  return mine;
}

export function mergeOnto(latest: SettingsSnapshot, base: SettingsSnapshot, draft: SettingsDraft): { merged: SettingsDraft; conflicts: string[] } {
  const conflicts: string[] = [];
  const merged = merge3(toDraft(base), toDraft(latest), draft, '', conflicts) as SettingsDraft;
  return { merged, conflicts };
}
