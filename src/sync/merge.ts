export type EntityMap = Record<string, Record<string, unknown>>;
export type ContentPath = string[];
export interface MergeVersion { entity: string; path: ContentPath; value: unknown; }
export function stable(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).filter(k => (value as any)[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + stable((value as any)[k])).join(',') + '}';
  return JSON.stringify(value) ?? 'undefined';
}
const same = (a: unknown, b: unknown) => stable(a) === stable(b);
const object = (v: any): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
export const quiet = new Set(['revision','updatedAt','save','documentKey','position','lastReadAt','activeDiscussionId','activeExplanationId','activeOverviewId','explanationWindows','layout','generation','usage','context','state','error']);
export const setFields = new Set(['tagIds','folderIds','sources','collections','editedFields']);
export const textFields = new Set(['markdown','comment','shortNote','text']);
const preferred = (a: any, b: any) => stable(a) > stable(b) ? a : b;

/** Combine disjoint edits only. Overlapping replacements are preserved as versions. */
export function mergeText(base: string, a: string, b: string): string | undefined {
  function edit(next: string) {
    let start = 0, end = base.length, stop = next.length;
    while (start < end && start < stop && base[start] === next[start]) start++;
    while (end > start && stop > start && base[end - 1] === next[stop - 1]) { end--; stop--; }
    return { start, end, text: next.slice(start, stop) };
  }
  const edits = [edit(a), edit(b)].sort((x,y) => x.start-y.start);
  const [x,y] = edits as [ReturnType<typeof edit>,ReturnType<typeof edit>];
  if (x.end > y.start || x.start === y.start) return undefined;
  return base.slice(0,x.start)+x.text+base.slice(x.end,y.start)+y.text+base.slice(y.end);
}

/** Merge by entity/message identity; ambiguous content gets durable alternate versions. */
export function mergeEntities(base: EntityMap, local: EntityMap, remote: EntityMap) {
  const versions: MergeVersion[] = [];
  function preserve(entity: string, path: string[], l: any, r: any) {
    for (const value of [l,r]) versions.push({entity,path:[...path],value:structuredClone(value)});
    // Deterministic display choice lets devices converge; both values remain recoverable.
    return l === undefined ? r : r === undefined ? l : preferred(l,r);
  }
  function merge(b: any, l: any, r: any, entity: string, path: string[]): any {
    if (same(l,r)) return l;
    if (same(b,l)) return r;
    if (same(b,r)) return l;
    const field = path.at(-1) ?? '';
    if (quiet.has(field)) return preferred(l,r);
    if (field === 'syncScope') return l==='record-and-file'||r==='record-and-file'?'record-and-file':preferred(l,r);
    if (field === 'createdAt') return [l,r].filter(v=>typeof v==='string').sort()[0];
    // Delete versus edit: keep the editable record visible and save both states.
    if (object(l) && object(r) && (Boolean(l.deletedAt)!==Boolean(r.deletedAt) || (typeof l.inLibrary==='boolean' && typeof r.inLibrary==='boolean' && l.inLibrary!==r.inLibrary))) {
      preserve(entity,path,l,r);
      return l.deletedAt || l.inLibrary===false ? r : l;
    }
    // A message's text and citations belong together when its text is rewritten.
    if(path.at(-2)==='messages'&&object(l)&&object(r)&&typeof l.markdown==='string'&&typeof r.markdown==='string'&&!same(l.markdown,r.markdown)&&!same(b?.markdown,l.markdown)&&!same(b?.markdown,r.markdown)){
      const combined=typeof b?.markdown==='string'?mergeText(b.markdown,l.markdown,r.markdown):undefined;
      if(combined===undefined)return preserve(entity,path,l,r);
    }
    if (Array.isArray(l) && Array.isArray(r)) {
      if (field === 'history' || setFields.has(field)) {
        const bv = Array.isArray(b)?b:[];
        // A removal from a known base wins over an unchanged membership, additions unite.
        return [...new Map([...l,...r].filter(v=>field==='history'||!bv.some(x=>same(x,v))||(l.some(x=>same(x,v))&&r.some(x=>same(x,v)))).map(v=>[stable(v),v])).entries()].sort(([a],[b])=>(a<b?-1:a>b?1:0)).map(([,v])=>v);
      }
      if ([...l,...r,...(Array.isArray(b)?b:[])].every(v=>object(v)&&typeof v.id==='string') && new Set(l.map(v=>v.id)).size===l.length && new Set(r.map(v=>v.id)).size===r.length) {
        const before = new Map((Array.isArray(b)?b:[]).map(v=>[v.id,v])), left = new Map(l.map(v=>[v.id,v])), right = new Map(r.map(v=>[v.id,v]));
        return [...new Set([...before.keys(),...left.keys(),...right.keys()])].sort().map(id=>merge(before.get(id),left.get(id),right.get(id),entity,[...path,'@'+id])).filter(v=>v!==undefined).sort((a,b)=>String(a.createdAt??'').localeCompare(String(b.createdAt??''))||a.id.localeCompare(b.id));
      }
    }
    if (object(l) && object(r)) {
      const out: Record<string,unknown> = {};
      for (const key of [...new Set([...Object.keys(object(b)?b:{}),...Object.keys(l),...Object.keys(r)])].sort()) {
        if (['__proto__','constructor','prototype'].includes(key)) throw new Error('远程记录字段无效');
        const value = merge(b?.[key],l[key],r[key],entity,[...path,key]);
        if (value !== undefined) out[key]=value;
      }
      return out;
    }
    if (textFields.has(field) && typeof b==='string' && typeof l==='string' && typeof r==='string') {
      if(l.startsWith(b)&&r.startsWith(b)&&(l.startsWith(r)||r.startsWith(l)))return l.length>r.length?l:r;
      const text = mergeText(b,l,r); if (text!==undefined) return text;
    }
    return preserve(entity,path,l,r);
  }
  const records: EntityMap = {};
  for (const key of [...new Set([...Object.keys(base),...Object.keys(local),...Object.keys(remote)])].sort()) {
    if(decodeURIComponent(key).includes('/meta/transfer-version:')){
      const l=local[key],r=remote[key];
      const value=!l?r:!r?l:String((l.value as any)?.savedAt)<String((r.value as any)?.savedAt)?l:r;
      if(value)records[key]=value;
      continue;
    }
    const value = merge(base[key],local[key],remote[key],key,[]);
    if (value!==undefined) records[key]=value;
  }
  return {records,versions,conflicts:versions.map(v=>[v.entity,...v.path].join('/'))};
}

export function contentAt(row: any, path: ContentPath): any {
  for (const part of path) row=part.startsWith('@') && Array.isArray(row)?row.find(v=>v.id===part.slice(1)):row?.[part];
  return row;
}
export function replaceContent(row: any, path: ContentPath, value: any): any {
  if (!path.length) return structuredClone(value);
  const copy=structuredClone(row), [part,...rest]=path as [string,...string[]];
  if (part.startsWith('@')) {
    if (!Array.isArray(copy)) throw new Error('内容有变化，请刷新');
    const index=copy.findIndex(v=>v.id===part.slice(1));
    if(index<0)throw new Error('这条内容已移除，原版本仍保留');
    const next=replaceContent(copy[index],rest,value);
    if(next===undefined)copy.splice(index,1);else copy[index]=next;
  } else {
    if(!object(copy)||['__proto__','constructor','prototype'].includes(part))throw new Error('内容有变化，请刷新');
    const next=replaceContent(copy[part],rest,value);if(next===undefined)delete copy[part];else copy[part]=next;
  }
  return copy;
}

export function sameContent(a:unknown,b:unknown):boolean {
  function clean(v:any):any {
    if(Array.isArray(v))return v.map(clean);
    if(object(v))return Object.fromEntries(Object.entries(v).filter(([key])=>!quiet.has(key)).map(([key,value])=>[key,clean(value)]));
    return v;
  }
  return same(clean(a),clean(b));
}
