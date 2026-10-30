import type { ResearchRecord } from "./types";
const equal = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
const keyed = (value: any[]) =>
  value.every(
    (item) => item && typeof item === "object" && typeof item.id === "string",
  );
/** Three-way merge. Independent sessions, branches and attempts never replace one another. */
function merge(base: any, local: any, remote: any): any {
  if (equal(local, base)) return structuredClone(remote);
  if (equal(remote, base) || equal(local, remote))
    return structuredClone(local);
  if (
    Array.isArray(local) &&
    Array.isArray(remote) &&
    keyed(local) &&
    keyed(remote)
  ) {
    const before = new Map(
      (Array.isArray(base) ? base : []).map((v: any) => [v.id, v]),
    );
    const left = new Map(local.map((v) => [v.id, v])),
      right = new Map(remote.map((v) => [v.id, v]));
    return [...new Set([...left.keys(), ...right.keys()])]
      .map((id) => merge(before.get(id), left.get(id), right.get(id)))
      .filter((v) => v !== undefined);
  }
  if (
    local &&
    remote &&
    typeof local === "object" &&
    typeof remote === "object" &&
    !Array.isArray(local) &&
    !Array.isArray(remote)
  ) {
    const out: any = {};
    for (const key of new Set([...Object.keys(local), ...Object.keys(remote)]))
      out[key] = merge(base?.[key], local[key], remote[key]);
    return out;
  }
  return structuredClone(local);
}
export function mergeRecords(
  base: ResearchRecord,
  local: ResearchRecord,
  remote: ResearchRecord,
): ResearchRecord {
  const result = merge(base, local, remote) as ResearchRecord;
  // Two windows can type different drafts in the same conversation. Keep both;
  // the second draft becomes an ordinary recoverable session, not discarded text.
  for (const left of local.sessions) {
    const old = base.sessions.find((s) => s.id === left.id),
      right = remote.sessions.find((s) => s.id === left.id);
    if (
      !old ||
      !right ||
      equal(left.draft, old.draft) ||
      equal(right.draft, old.draft) ||
      equal(left.draft, right.draft)
    )
      continue;
    const id = `draft:${left.id}:${remote.revision}`;
    if (!result.sessions.some((s) => s.id === id))
      result.sessions.push({
        ...structuredClone(right),
        id,
        title: "保留的草稿",
        messages: [],
        activeLeafId: null,
      });
  }
  return result;
}
/** Keep live message object identities while adopting other windows' additions. */
export function adoptRecord(target: any, source: any): any {
  if (target && typeof target === "object" && Object.isFrozen(target))
    return structuredClone(source);
  if (
    Array.isArray(target) &&
    Array.isArray(source) &&
    keyed(source) &&
    keyed(target)
  ) {
    const values = source.map((next) => {
      const old = target.find((v) => v.id === next.id);
      return old ? adoptRecord(old, next) : next;
    });
    target.splice(0, target.length, ...values);
    return target;
  }
  if (
    target &&
    source &&
    typeof target === "object" &&
    typeof source === "object" &&
    !Array.isArray(target) &&
    !Array.isArray(source)
  ) {
    for (const key of Object.keys(target))
      if (!(key in source)) delete target[key];
    for (const key of Object.keys(source))
      target[key] = adoptRecord(target[key], source[key]);
    return target;
  }
  return source;
}
