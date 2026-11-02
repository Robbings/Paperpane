import type { Annotation, HighlightColor } from '@/contracts/annotations';
import type { DocumentRef } from '@/contracts/document';
import type { ZoteroItem, ZoteroData } from './types';
const colors:Record<HighlightColor,string>={yellow:'#ffd400',green:'#5fb236',blue:'#2ea8e5',pink:'#ff6666',purple:'#a28ae5'};
export function fromZoteroAnnotation(item:ZoteroItem,ref:DocumentRef,views:readonly number[][],id:string):Annotation{
  // Zotero's types and what they become here: underline reads as a highlight; a text box and an
  // image (area) become comments pinned to their place on the page. Ink has no rectangles to keep.
  const d=item.data,type=d.annotationType??'';
  if(type==='ink')throw new Error('手绘批注暂不支持，已跳过');
  if(!['highlight','underline','note','text','image'].includes(type))throw new Error(`「${type||'未知'}」类型的批注暂不支持，已跳过`);
  const position=JSON.parse(String(d.annotationPosition??'null'));if(!position||!Number.isInteger(position.pageIndex))throw new Error('Zotero 批注位置无效');
  function page(index:number,rects:unknown){const view=views[index];if(!view||!Array.isArray(rects)||!rects.length)throw new Error('Zotero 批注页码或矩形无效');
    return {pageIndex:index,rects:rects.map(r=>{if(!Array.isArray(r)||r.length!==4||!r.every(Number.isFinite)||r[2]<=r[0]||r[3]<=r[1])throw new Error('Zotero 批注矩形无效');return {x:r[0]-view[0]!,y:r[1]-view[1]!,width:r[2]-r[0],height:r[3]-r[1]};})};}
  const pages=[page(position.pageIndex,position.rects)];if(position.nextPageRects)pages.push(page(position.pageIndex+1,position.nextPageRects));
  const color=(Object.entries(colors).find(([,value])=>value.toLowerCase()===d.annotationColor?.toLowerCase())?.[0]??'yellow') as HighlightColor;
  const at=new Date().toISOString();
  const onPage=['note','text','image'].includes(type);
  // A text box keeps its words as the comment; an image area has no text of its own.
  const comment=type==='text'?[d.annotationText,d.annotationComment].filter(Boolean).join('\n\n'):d.annotationComment??'';
  return {id,revision:crypto.randomUUID(),createdAt:at,updatedAt:at,kind:onPage?'page-comment':d.annotationComment?'selection-comment':'highlight',anchor:{...ref,pages},color,quote:onPage?'':d.annotationText??'',comment,source:{kind:'user'},save:{local:'saved',sync:'unconfigured'}};
}
export function toZoteroAnnotations(row:Annotation,parentItem:string,views:readonly number[][]):ZoteroData[]{
  if(row.deletedAt)return [];
  return row.anchor.pages.map(page=>{const view=views[page.pageIndex];if(!view)throw new Error('批注文件版本或页码不匹配');
    return {itemType:'annotation',parentItem,annotationType:row.kind==='page-comment'?'note':'highlight',annotationText:row.quote,annotationComment:row.comment,annotationColor:colors[row.color],annotationPageLabel:String(page.pageIndex+1),annotationSortIndex:`${String(page.pageIndex).padStart(5,'0')}|000000|00000`,annotationPosition:JSON.stringify({pageIndex:page.pageIndex,rects:page.rects.map(r=>[r.x+view[0]!,r.y+view[1]!,r.x+r.width+view[0]!,r.y+r.height+view[1]!])}),tags:[]};
  });
}
