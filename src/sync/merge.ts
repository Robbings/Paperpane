export type EntityMap=Record<string,Record<string,unknown>>;
export function stable(value:unknown):string{
  if(Array.isArray(value))return '['+value.map(stable).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable((value as any)[k])).join(',')+'}';
  return JSON.stringify(value)??'undefined';
}
const same=(a:unknown,b:unknown)=>stable(a)===stable(b);
/** Three-way merge; concurrent changes are never settled by wall clocks. */
export function mergeEntities(base:EntityMap,local:EntityMap,remote:EntityMap){
  const conflicts:string[]=[];
  function merge(b:any,l:any,r:any,path:string):any{
    if(same(l,r))return l;if(same(b,l))return r;if(same(b,r))return l;
    if(l&&r&&typeof l==='object'&&typeof r==='object'&&(Boolean(l.deletedAt)!==Boolean(r.deletedAt)||(typeof l.inLibrary==='boolean'&&typeof r.inLibrary==='boolean'&&l.inLibrary!==r.inLibrary))){conflicts.push(path);return l;}
    if(l&&r&&typeof l==='object'&&typeof r==='object'&&!Array.isArray(l)&&!Array.isArray(r)){
      const out:Record<string,unknown>={};
      for(const key of new Set([...Object.keys(b??{}),...Object.keys(l),...Object.keys(r)])){
        if(['__proto__','constructor','prototype'].includes(key))throw new Error('远程记录字段无效');
        const value=['revision','updatedAt','save'].includes(key)?l[key]??r[key]:merge(b?.[key],l[key],r[key],`${path}/${key}`);
        if(value!==undefined)out[key]=value;
      }return out;
    }
    conflicts.push(path);return l;
  }
  const records:EntityMap={};for(const key of new Set([...Object.keys(base),...Object.keys(local),...Object.keys(remote)])){const value=merge(base[key],local[key],remote[key],key);if(value!==undefined)records[key]=value;}
  return {records,conflicts};
}
