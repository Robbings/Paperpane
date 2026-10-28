/** Parse completed JSON lines and the current JSON string without losing a half sentence.
 * Every emitted ID is checked against this request; malformed/extra IDs never affect other text. */
export function decodeTranslations(raw:string, ids:Set<string>):Map<string,{text:string;complete:boolean;inferredMath?:boolean}> {
  const result=new Map<string,{text:string;complete:boolean;inferredMath?:boolean}>();
  for(const line of raw.split('\n')){
    try{const value=JSON.parse(line);if(ids.has(value.id)&&typeof value.text==='string'&&value.text.trim()&&!result.has(value.id))result.set(value.id,{text:value.text,complete:true,inferredMath:value.inferredMath===true});continue;}catch{}
    const m=/^\s*\{\s*"id"\s*:\s*("(?:[^"\\]|\\.)*")\s*,\s*"text"\s*:\s*"((?:[^"\\]|\\.)*)/.exec(line);
    if(!m)continue;let id:string;try{id=JSON.parse(m[1]!);}catch{continue;}if(!ids.has(id)||result.has(id))continue;
    let encoded=m[2]!;let text='';while(encoded){try{text=JSON.parse('"'+encoded+'"');break;}catch{encoded=encoded.slice(0,-1);}}
    if(text)result.set(id,{text,complete:false});
  }
  return result;
}
