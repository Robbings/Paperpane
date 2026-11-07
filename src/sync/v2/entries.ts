import { quiet, setFields, stable, textFields, type EntityMap, type MergeVersion } from '../merge';
import type { AutomergeApi } from './automerge';

// 同步文档的形状：根上一张平铺的表，每个键是一条记录里的一个位置。
// 不用嵌套对象，因为两台设备同时创建同一个嵌套对象时，Automerge 只会保留其中一个，
// 另一个里的字段整体看不见；平铺后，冲突只会落在同一个位置上。
//
//   r␟<记录>                 记录本身的标记
//   r␟<记录>␟title          一个字段（原子值）
//   r␟<记录>␟value␟markdown 一段可协同的正文（按字符合并）
//   r␟<记录>␟tagIds␟#"t-a"  集合里的一个成员
//   r␟<记录>␟messages␟@m1   按 id 排列的数组里的一项
//   a␟<数据库>␟<附件>        一份附件的说明（不含文件本身）

export const SEP = '\u241f';
const RECORD = 'r' + SEP, ASSET = 'a' + SEP;
// Automerge reads '/' in a key as a path step, so each path segment escapes it.
const esc = (s: string) => s.replace(/%/g, '%25').replace(/\//g, '%2F');
const unesc = (s: string) => s.replace(/%2F/g, '/').replace(/%25/g, '%');

/** One position in the flat document. */
export type Leaf =
  | { kind: 'object' }
  | { kind: 'ids' }
  | { kind: 'set' }
  | { kind: 'atom'; json: string }
  | { kind: 'text'; text: string };

const MARK = { object: '{}', ids: '[@]', set: '[#]' } as const;
const plain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const byId = (v: unknown[]) => v.length > 0 && v.every((x) => plain(x) && typeof x.id === 'string') && new Set(v.map((x) => (x as any).id)).size === v.length;

function encodeValue(path: string, field: string, value: unknown, out: Map<string, Leaf>) {
  if (value === undefined) return;
  if (field.includes(SEP)) throw new Error('记录字段无效');
  if (plain(value)) {
    out.set(path, { kind: 'object' });
    for (const [key, child] of Object.entries(value)) encodeValue(path + SEP + esc(key), key, child, out);
  } else if (Array.isArray(value) && setFields.has(field)) {
    out.set(path, { kind: 'set' });
    for (const member of value) out.set(path + SEP + '#' + esc(stable(member)), { kind: 'atom', json: stable(member) });
  } else if (Array.isArray(value) && byId(value)) {
    out.set(path, { kind: 'ids' });
    // A message's text and its citations belong together: each message is one value.
    for (const item of value as Record<string, unknown>[])
      if (field === 'messages') out.set(path + SEP + '@' + esc(String(item.id)), { kind: 'atom', json: stable(item) });
      else encodeValue(path + SEP + '@' + esc(String(item.id)), '', item, out);
  } else if (typeof value === 'string' && textFields.has(field)) {
    out.set(path, { kind: 'text', text: value });
  } else {
    out.set(path, { kind: 'atom', json: stable(value) });
  }
}

/** Every position of every record and asset description. */
export function encode(records: EntityMap, assets: { database: string; id: string }[]): Map<string, Leaf> {
  const out = new Map<string, Leaf>();
  for (const [key, row] of Object.entries(records)) encodeValue(RECORD + esc(key), '', row, out);
  for (const asset of assets) out.set(ASSET + esc(asset.database) + SEP + esc(asset.id), { kind: 'atom', json: stable(asset) });
  return out;
}

/** A document value as a leaf. Collaborative text arrives as a string; everything else is an ImmutableString. */
export function leafOf(A: AutomergeApi, value: unknown): Leaf | undefined {
  if (typeof value === 'string') return { kind: 'text', text: value };
  if (!A.isImmutableString(value)) return undefined;
  const s = value.toString();
  if (s.startsWith('=')) return { kind: 'atom', json: s.slice(1) };
  return s === MARK.object ? { kind: 'object' } : s === MARK.ids ? { kind: 'ids' } : s === MARK.set ? { kind: 'set' } : undefined;
}

export function stored(A: AutomergeApi, leaf: Leaf): unknown {
  return leaf.kind === 'text' ? leaf.text : new A.ImmutableString(leaf.kind === 'atom' ? '=' + leaf.json : MARK[leaf.kind]);
}

export const sameLeaf = (a?: Leaf, b?: Leaf) =>
  !!a && !!b && a.kind === b.kind && (a.kind === 'atom' ? a.json === (b as any).json : a.kind === 'text' ? a.text === (b as any).text : true);

export function read(A: AutomergeApi, doc: Record<string, unknown>): Map<string, Leaf> {
  const out = new Map<string, Leaf>();
  for (const key of Object.keys(doc)) {
    const leaf = leafOf(A, doc[key]);
    if (leaf) out.set(key, leaf);
  }
  return out;
}

/** Rebuilds records and asset descriptions. Positions whose container was removed are ignored. */
export function decode(leaves: Map<string, Leaf>): { records: EntityMap; assets: any[] } {
  const children = new Map<string, string[]>();
  for (const key of leaves.keys()) {
    const cut = key.lastIndexOf(SEP);
    const parent = key.slice(0, cut);
    (children.get(parent) ?? children.set(parent, []).get(parent)!).push(key);
  }
  const value = (path: string): unknown => {
    const leaf = leaves.get(path)!;
    const kids = (children.get(path) ?? []).filter((k) => leaves.has(k));
    switch (leaf.kind) {
      case 'atom':
        return JSON.parse(leaf.json);
      case 'text':
        return leaf.text;
      case 'set':
        return kids.filter((k) => k.slice(path.length + 1).startsWith('#')).map(value).sort((a, b) => (stable(a) < stable(b) ? -1 : 1));
      case 'ids':
        return kids
          .filter((k) => k.slice(path.length + 1).startsWith('@'))
          .map(value)
          .filter(plain)
          .sort((a: any, b: any) => String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')) || String(a.id).localeCompare(String(b.id)));
      case 'object': {
        const out: Record<string, unknown> = {};
        for (const k of kids) out[unesc(k.slice(path.length + 1))] = value(k);
        return out;
      }
    }
  };
  const records: EntityMap = {}, assets: any[] = [];
  for (const key of leaves.keys()) {
    const cut = key.indexOf(SEP);
    if (key.startsWith(RECORD) && key.indexOf(SEP, RECORD.length) < 0) {
      const row = value(key);
      if (plain(row)) records[unesc(key.slice(RECORD.length))] = row;
    } else if (key.startsWith(ASSET) && cut === 1 && key.split(SEP).length === 3) {
      const meta = value(key);
      if (plain(meta)) assets.push(meta);
    }
  }
  return { records, assets };
}

/** Where a position sits inside its record, in the path form saved versions use. */
export function locate(key: string): { entity: string; path: string[]; field: string } | undefined {
  if (!key.startsWith(RECORD)) return undefined;
  const [entity, ...path] = key.slice(RECORD.length).split(SEP).map(unesc);
  return { entity: entity!, path, field: [...path].reverse().find((p) => !p.startsWith('@') && !p.startsWith('#')) ?? '' };
}
const versionable = (key: string) => {
  const at = locate(key);
  return at && at.path.length > 0 && !at.path.at(-1)!.startsWith('#') && !quiet.has(at.field) ? at : undefined;
};

/**
 * Writes this device's state into the document. Positions are only touched where
 * they differ. Records missing here are left alone: deletions of whole records are
 * not synchronized, as before. `join` (first sync of a device that already had data
 * against an existing library) keeps the library's value where the two differ and
 * returns this device's value as a saved version instead.
 */
export function capture(A: AutomergeApi, d: Record<string, unknown>, local: Map<string, Leaf>, current: Map<string, Leaf>, join = false): MergeVersion[] {
  const versions: MergeVersion[] = [];
  const present = new Set([...local.keys()].filter((k) => k.startsWith(RECORD) && k.indexOf(SEP, RECORD.length) < 0));
  const recordOf = (key: string) => key.slice(0, key.indexOf(SEP, RECORD.length) < 0 ? key.length : key.indexOf(SEP, RECORD.length));
  const isQuiet = (key: string) => quiet.has(locate(key)?.field ?? '');
  // Bookkeeping fields (revision, updatedAt, …) are rewritten whenever a merge is saved
  // here. They travel only together with a real change to the same record; otherwise
  // two devices would keep sending each other fresh revision ids.
  const changed = new Set<string>();
  for (const [key, leaf] of local) if (!sameLeaf(current.get(key), leaf) && !isQuiet(key)) changed.add(recordOf(key));
  for (const key of current.keys()) if (key.startsWith(RECORD) && !local.has(key) && !isQuiet(key) && present.has(recordOf(key))) changed.add(recordOf(key));
  for (const [key, leaf] of local) {
    const now = current.get(key);
    if (sameLeaf(now, leaf)) continue;
    if (now && isQuiet(key) && !changed.has(recordOf(key))) continue;
    if (now && join) {
      const at = versionable(key);
      if (at && (leaf.kind === 'atom' || leaf.kind === 'text')) versions.push({ entity: at.entity, path: at.path, value: leaf.kind === 'atom' ? JSON.parse(leaf.json) : leaf.text });
      continue;
    }
    if (now?.kind === 'text' && leaf.kind === 'text') A.updateText(d as any, [key], leaf.text);
    else d[key] = stored(A, leaf);
  }
  if (!join)
    for (const key of current.keys()) {
      if (local.has(key) || !key.startsWith(RECORD)) continue;
      if (present.has(recordOf(key)) && (!isQuiet(key) || changed.has(recordOf(key)))) delete d[key];
    }
  return versions;
}

/**
 * Concurrent values of one position: the document shows one of them on every
 * device; each distinct value is returned as a version, then the shown one is
 * written again so the same conflict is not reported twice.
 */
export function settleConflicts(A: AutomergeApi, doc: Record<string, unknown>): { versions: MergeVersion[]; keys: string[] } {
  const versions: MergeVersion[] = [], keys: string[] = [];
  for (const key of Object.keys(doc)) {
    const conflicts = A.getConflicts(doc as any, key);
    if (!conflicts || Object.keys(conflicts).length < 2) continue;
    keys.push(key);
    const at = versionable(key);
    if (!at) continue;
    const seen = new Set<string>();
    // Competing values come back as plain strings either way; the shown value tells
    // whether this position holds collaborative text or encoded atoms.
    const text = typeof doc[key] === 'string';
    for (const value of Object.values(conflicts)) {
      const leaf = typeof value === 'string' && !text ? leafOf(A, new A.ImmutableString(value)) : leafOf(A, value);
      if (!leaf || (leaf.kind !== 'atom' && leaf.kind !== 'text')) continue;
      const v = leaf.kind === 'atom' ? JSON.parse(leaf.json) : leaf.text;
      if (seen.has(stable(v))) continue;
      seen.add(stable(v));
      versions.push({ entity: at.entity, path: at.path, value: v });
    }
    if (seen.size < 2) versions.splice(versions.length - seen.size, seen.size);
  }
  return { versions, keys };
}

/** The changed span between two texts: [start, end) in `before`, [start, stop) in `after`. */
function span(before: string, after: string) {
  let start = 0, end = before.length, stop = after.length;
  while (start < end && start < stop && before[start] === after[start]) start++;
  while (end > start && stop > start && before[end - 1] === after[stop - 1]) { end--; stop--; }
  return { start, end, stop };
}
/** Indexes of the blank-line separated paragraphs of `text` that [from, to] reaches. */
function paragraphs(text: string, from: number, to: number): Set<number> {
  const index = (p: number) => text.slice(0, p).split(/\n\s*\n/).length - 1;
  const out = new Set<number>();
  for (let i = index(from); i <= index(Math.max(from, to)); i++) out.add(i);
  return out;
}

/**
 * Text edited here and by another device in the same paragraph: the merged text
 * may interleave both, so this device's text is kept as a version. Edits to
 * different paragraphs merge without one. `remote` is the base plus only the
 * changes downloaded this time: the other side's text before interleaving.
 */
export function overlappingText(base: Map<string, Leaf>, local: Map<string, Leaf>, merged: Map<string, Leaf>, remote: Map<string, Leaf>): MergeVersion[] {
  const versions: MergeVersion[] = [];
  for (const [key, mine] of local) {
    const before = base.get(key), after = merged.get(key);
    if (mine.kind !== 'text' || before?.kind !== 'text' || after?.kind !== 'text') continue;
    if (before.text === mine.text || after.text === mine.text) continue;
    // Both spans are measured in this device's text before the merge.
    const o = span(before.text, mine.text), t = span(mine.text, after.text);
    const ours = paragraphs(mine.text, o.start, o.stop), theirs = paragraphs(mine.text, t.start, t.end);
    if (![...theirs].some((i) => ours.has(i))) continue;
    const at = versionable(key);
    if (!at) continue;
    versions.push({ entity: at.entity, path: at.path, value: mine.text });
    // And the other side's text as it was, before the two were interleaved.
    const theirsText = remote.get(key);
    if (theirsText?.kind === 'text' && theirsText.text !== mine.text) versions.push({ entity: at.entity, path: at.path, value: theirsText.text });
  }
  return versions;
}
