import { stable, type MergeVersion, type ContentPath } from './merge';
export interface SavedVersion {
  id:string; store:string; key:string; path:ContentPath; value:unknown;
  savedAt:string; sourceAt?:string;
}
/** Stable content address; the full payload is checked on collision before overwriting. */
function fingerprint(text:string) {
  let a=0xcbf29ce484222325n,b=0x84222325cbf29ce4n;
  for(let i=0;i<text.length;i++){const c=BigInt(text.charCodeAt(i));a=BigInt.asUintN(64,(a^c)*0x100000001b3n);b=BigInt.asUintN(64,(b^c)*0x100000001b3n);}
  return a.toString(16).padStart(16,'0')+b.toString(16).padStart(16,'0');
}
export function savedVersion(store:string,key:string,path:ContentPath,value:unknown,savedAt=new Date().toISOString(),sourceAt?:string):SavedVersion {
  const identity={store,key,path,value};
  return {id:'transfer-version:'+fingerprint(stable(identity)),...identity,savedAt,...(sourceAt?{sourceAt}:{})};
}
export function versionRows(versions:MergeVersion[],at:string) {
  return versions.map(v=>{
    const [,store,key]=v.entity.split('/').map(decodeURIComponent);
    if(!store||!key)throw new Error('版本来源无效');
    const value=savedVersion(store,key,v.path,v.value,at);
    return {key:value.id,value};
  });
}
