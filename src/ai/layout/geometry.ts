import type { Box, LayoutRegion, ElementKind } from './types';
export const elementKind=(r:LayoutRegion):ElementKind|undefined=>r.label==='image'?'picture':r.label==='table'?'table':r.label==='formula'?'formula':undefined;
export function expandBox(b:Box,kind:ElementKind):Box{
  const w=b[2]-b[0],h=b[3]-b[1],px=kind==='formula'?Math.max(.014,w*.055):.004,py=kind==='formula'?Math.max(.010,h*.23):.004;
  return [Math.max(0,b[0]-px),Math.max(0,b[1]-py),Math.min(1,b[2]+px),Math.min(1,b[3]+py)];
}
export const unionBox=(a:Box,b:Box):Box=>[Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[2],b[2]),Math.max(a[3],b[3])];
/** IoU alone misses a small false formula wholly contained inside a figure. */
export function overlap(a:Box,b:Box){
 const intersection=Math.max(0,Math.min(a[2],b[2])-Math.max(a[0],b[0]))*Math.max(0,Math.min(a[3],b[3])-Math.max(a[1],b[1]));
 const aa=(a[2]-a[0])*(a[3]-a[1]),bb=(b[2]-b[0])*(b[3]-b[1]);
 return {iou:intersection/Math.max(1e-12,aa+bb-intersection),covered:intersection/Math.max(1e-12,aa),contained:intersection/Math.max(1e-12,Math.min(aa,bb))};
}
export function resolveElements(regions:readonly LayoutRegion[]):LayoutRegion[]{
 const kept:LayoutRegion[]=[];
 for(const label of ['image','table','formula']){
  const group=regions.filter(r=>r.label===label&&r.score>=.5&&r.box[2]>r.box[0]&&r.box[3]>r.box[1]).map(r=>({...r,box:[...r.box] as Box}));
  let changed=true;
  while(changed){changed=false;outer:for(let i=0;i<group.length;i++)for(let j=i+1;j<group.length;j++){
   const o=overlap(group[i]!.box,group[j]!.box);if(o.iou>=.6||o.contained>=.75){group[i]={...group[i]!,box:unionBox(group[i]!.box,group[j]!.box),score:Math.max(group[i]!.score,group[j]!.score)};group.splice(j,1);changed=true;break outer;}
  }}
  // Suppress a lower-priority box only when that box is substantially covered.
  // A tiny image inside a large real table must not remove the whole table.
  for(const region of group)if(!kept.some(higher=>{const o=overlap(region.box,higher.box);return o.iou>=.6||o.covered>=.75;}))kept.push(region);
 }
 return kept;
}
/** Caption must overlap the element's column and sit close above/below it. */
export function matchCaption(target:LayoutRegion,regions:readonly LayoutRegion[]):LayoutRegion|undefined{
  const isTable=target.label==='table';
  const candidates=regions.filter(r=>r.score>=.5&&(r.label==='caption'||(isTable?r.label==='table_title':r.label==='figure_title'))).flatMap(r=>{
    const b=target.box,c=r.box,overlap=Math.max(0,Math.min(b[2],c[2])-Math.max(b[0],c[0]))/Math.max(.001,Math.min(b[2]-b[0],c[2]-c[0]));
    const gap=c[1]>=b[3]?c[1]-b[3]:b[1]>=c[3]?b[1]-c[3]:Infinity;
    return overlap>=.55&&gap<=.045?[{r,score:gap+(1-overlap)*.012}]:[];
  }).sort((a,b)=>a.score-b.score);
  return candidates[0]?.r;
}
