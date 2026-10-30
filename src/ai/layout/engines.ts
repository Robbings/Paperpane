import type { LayoutRegion } from './types';
export type LayoutEngineId='picodet17'|'heron-int8';
export interface LayoutEngineSpec {id:LayoutEngineId;version:string;asset:string;sha256:string;side:number;normalization:'imagenet'|'rgb';labels:readonly string[]}
export const ENGINES:Record<LayoutEngineId,LayoutEngineSpec>={
 picodet17:{id:'picodet17',version:'picodet17-9cea1f4-onnx17-v2',asset:'/models/picodet-s-17.onnx',sha256:'683723678a0bf720bccbde2a113ae0faafb788eae52d988edf4f19d258e088fe',side:480,normalization:'imagenet',labels:['paragraph_title','image','text','number','abstract','content','figure_title','formula','table','table_title','reference','doc_title','footnote','header','algorithm','footer','seal']},
 'heron-int8':{id:'heron-int8',version:'heron-int8-87ac925d-v1',asset:'/models/layout_heron_int8.onnx',sha256:'87ac925d4183b4f4745fb48f6ff216fe88ce244d9ab635725e6d514fe490fc2a',side:640,normalization:'rgb',labels:['caption','footnote','formula','list_item','page_footer','page_header','picture','section_header','table','text','title','document_index','code','checkbox_selected','checkbox_unselected','form','key_value_region']},
};
/** Heron is an interchangeable adapter, but its weights are intentionally not bundled. */
export const DEFAULT_LAYOUT_ENGINE:LayoutEngineId='picodet17';
export const layoutVersion=(id:LayoutEngineId)=>ENGINES[id].version;
export function decodeLayout(engine:LayoutEngineId,outputs:Record<string,{data:ArrayLike<number>;dims:readonly number[]}>,width:number,height:number):LayoutRegion[]{
 const spec=ENGINES[engine],regions:LayoutRegion[]=[];
 if(engine==='picodet17'){const raw=Object.values(outputs)[0]!.data;for(let i=0;i<raw.length;i+=6){const label=raw[i]!,score=raw[i+1]!;if(score<.5||label<0)continue;regions.push({label:spec.labels[label]!,score,box:[raw[i+2]!/width,raw[i+3]!/height,raw[i+4]!/width,raw[i+5]!/height].map(v=>Math.max(0,Math.min(1,v))) as LayoutRegion['box']});}}
 else{const logits=outputs.logits!,boxes=outputs.pred_boxes!.data,classes=logits.dims[2]!,queries=logits.dims[1]!;const sorted=Array.from(logits.data,(v,i)=>({i,score:1/(1+Math.exp(-Math.max(-60,Math.min(60,v))))})).sort((a,b)=>b.score-a.score).slice(0,queries);
 for(const {i,score}of sorted){if(score<.5)continue;const q=Math.floor(i/classes),raw=spec.labels[i%classes]!,label=raw==='picture'?'image':raw,cx=boxes[q*4]!,cy=boxes[q*4+1]!,w=boxes[q*4+2]!,h=boxes[q*4+3]!;regions.push({label,score,box:[cx-w/2,cy-h/2,cx+w/2,cy+h/2].map(v=>Math.max(0,Math.min(1,v))) as LayoutRegion['box']});}}
 return regions;
}
