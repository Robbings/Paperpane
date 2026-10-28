import type { DocumentRef, PdfRect } from '@/contracts/document';
import type { ExtractedPaper, TranslationSentence, SourceSpan } from '@/contracts/translation';
/** Structural interface keeps extraction usable in browser and offline publisher probes. */
export interface TextPage { view: readonly number[]; getTextContent(): Promise<{ items: unknown[]; styles: Record<string, { ascent?: number; descent?: number; fontFamily?: string; vertical?: boolean }> }> }
export interface TextDocument { numPages: number; getPage(n: number): Promise<TextPage> }
interface Item { str: string; width: number; height: number; transform: number[]; fontName: string; dir: string }
interface Piece { text: string; rect: PdfRect; size: number; math: boolean }
interface Line { pieces: Piece[]; text: string; x: number; y: number; right: number; size: number; pageIndex: number; column: number; kind: TranslationSentence['kind']; skip: boolean }
interface Block { lines: Line[]; kind: TranslationSentence['kind']; id: string }
export const EXTRACTION_VERSION = 'layout-sentences-2';
const median = (a: number[]) => [...a].sort((x,y)=>x-y)[Math.floor(a.length/2)] ?? 10;
const endsSentence = (s: string) => /[.!?。！？][”’"')\]]*$/.test(s.trim());
const isAbbreviation = (s: string) => /(?:\b(?:Fig|Figs|Eq|Eqs|Sect|Sec|Table|Dr|Prof|Mr|Mrs|vs|al|approx|cf)\.|\b[eig]\.[eg]\.|\b[A-Z]\.)\s*$/i.test(s);
/** Intl handles scripts/decimals; repair scientific abbreviations with following context. */
export function sentenceRanges(text: string): {start:number;end:number}[] {
  const ranges: {start:number;end:number}[] = [];
  for(const part of new Intl.Segmenter('en',{granularity:'sentence'}).segment(text)) {
    const previous=ranges.at(-1);
    if(previous && isAbbreviation(text.slice(previous.start,previous.end))) previous.end=part.index+part.segment.length;
    else ranges.push({start:part.index,end:part.index+part.segment.length});
  }
  return ranges;
}
function appendBlock(block: Block) {
  let text=''; const spans: SourceSpan[]=[];
  for(const line of block.lines) {
    if(text) {
      // Keep actual lexical compounds. A line-end hyphen is removed only for lower-case continuation.
      if(/[a-z]{2,}-$/.test(text) && !/\b(?:self|fine|pre|gene|state|well|high|low|multi|cross|non|open|semi|long|short|left|right|of|the|ever)-$/.test(text) && /^[a-z]/.test(line.text)) { text=text.slice(0,-1); const last=spans.at(-1);if(last)last.end=Math.min(last.end,text.length); }
      else if(!text.endsWith('-'))text+=' ';
    }
    let previous: Piece|undefined;
    for(const p of line.pieces) {
      if(previous && p.rect.x-(previous.rect.x+previous.rect.width)>line.size*.12 && !text.endsWith(' '))text+=' ';
      const start=text.length;text+=p.text;spans.push({start,end:text.length,pageIndex:line.pageIndex,rect:p.rect});previous=p;
    }
  }
  return {text,spans};
}
function linesFrom(items: Item[], page: TextPage, styles: Awaited<ReturnType<TextPage['getTextContent']>>['styles'], pageIndex: number): Line[] {
  const pieces=items.filter(x=>x.str?.trim() && x.width>0 && Number.isFinite(x.transform?.[4])).map(x=>{
    const size=Math.hypot(x.transform[2]!,x.transform[3]!)||x.height||10;
    const style=styles[x.fontName]; const descent=style?.descent ?? -.2;
    return {text:x.str,rect:{x:x.transform[4]!-page.view[0]!,y:x.transform[5]!-page.view[1]!+descent*size,width:x.width,height:size},size,math:/Symbol|Math|CMSY|CMMI|CMEX/i.test(style?.fontFamily??'') || /[∑∫√≠∈∼≤≥]/.test(x.str)};
  }).sort((a,b)=>b.rect.y-a.rect.y||a.rect.x-b.rect.x);
  const width=page.view[2]!-page.view[0]!;
  const long=pieces.filter(p=>p.text.length>20&&p.rect.width>70);
  const scores=Array.from({length:101},(_,i)=>width*(.2+i*.005)).map(x=>({x,left:long.filter(p=>p.rect.x<x&&p.rect.x+p.rect.width<x+2).length,right:long.filter(p=>p.rect.x>=x-2).length,cross:long.filter(p=>p.rect.x<x-2&&p.rect.x+p.rect.width>x+2).length})).filter(g=>g.left>=5&&g.right>=5);
  const best=Math.max(...scores.map(g=>g.left+g.right-3*g.cross));
  const winning=scores.filter(g=>g.left+g.right-3*g.cross===best);const gutter=winning.length?median(winning.map(g=>g.x)):undefined;
  const rows: Piece[][]=[];
  for(const p of pieces) {const row=rows.find(r=>Math.abs(r[0]!.rect.y-p.rect.y)<Math.min(p.size,r[0]!.size)*.36);if(row)row.push(p);else rows.push([p]);}
  // Attach superscripts/subscripts to the nearby baseline before ordering by x.
  const typical=median(pieces.filter(p=>p.text.length>20).map(p=>p.size));
  for(let i=rows.length-1;i>=0;i--){const row=rows[i]!;if(median(row.map(p=>p.size))>=typical*.83||row.map(p=>p.text).join('').length>24)continue;
    const y=median(row.map(p=>p.rect.y));const target=rows.filter(r=>r!==row&&median(r.map(p=>p.size))>=typical*.9&&Math.abs(median(r.map(p=>p.rect.y))-y)<typical*.9).sort((a,b)=>Math.abs(median(a.map(p=>p.rect.y))-y)-Math.abs(median(b.map(p=>p.rect.y))-y))[0];
    if(target){target.push(...row);rows.splice(i,1);}
  }
  const lines:Line[]=[];
  for(const row of rows) {
    row.sort((a,b)=>a.rect.x-b.rect.x);let group:Piece[]=[];
    const flush=()=>{if(!group.length)return; const x=group[0]!.rect.x;const right=Math.max(...group.map(p=>p.rect.x+p.rect.width));
      let text='';let prev:Piece|undefined;for(const p of group){if(prev&&p.rect.x-prev.rect.x-prev.rect.width>p.size*.12)text+=' ';text+=p.text;prev=p;}
      lines.push({pieces:group,text,x,y:median(group.map(p=>p.rect.y)),right,size:median(group.map(p=>p.size)),pageIndex,column:gutter===undefined?0:x>=gutter-2?1:right>gutter+2?2:0,kind:'text',skip:false});group=[];};
    for(const p of row){const prev=group.at(-1);if(prev && ((gutter!==undefined&&prev.rect.x<gutter&&prev.rect.x+prev.rect.width<gutter+2&&p.rect.x>=gutter-2)||p.rect.x-prev.rect.x-prev.rect.width>Math.max(20,p.size*2.2)))flush();group.push(p);}flush();
  }
  return lines.sort((a,b)=>b.y-a.y||a.x-b.x);
}
export async function extractPaper(pdf: TextDocument, ref: DocumentRef, signal?: AbortSignal, progress?: (page:number)=>void): Promise<ExtractedPaper> {
  const pages: {lines:Line[];width:number;height:number}[]=[];
  for(let p=0;p<pdf.numPages;p++) {
    signal?.throwIfAborted();const page=await pdf.getPage(p+1);const tc=await page.getTextContent();
    const lines=linesFrom(tc.items.filter((i):i is Item=>!!i&&typeof i==='object'&&'str'in i) as Item[],page,tc.styles,p);
    pages.push({lines,width:page.view[2]!-page.view[0]!,height:page.view[3]!-page.view[1]!});progress?.(p+1);
    await new Promise(r=>setTimeout(r,0));
  }
  const repeated=new Map<string,Set<number>>();
  const norm=(s:string)=>s.replace(/\d+/g,'#').toLowerCase().trim();
  pages.forEach((page,p)=>page.lines.filter(l=>l.y>page.height*.91||l.y<page.height*.08).forEach(l=>{const key=norm(l.text);const set=repeated.get(key)??new Set();set.add(p);repeated.set(key,set);}));
  const blocks:Block[]=[];const warnings:string[]=[];
  pages.forEach(({lines,width,height},p)=>{
    const body=median(lines.filter(l=>l.text.length>45).map(l=>l.size));
    const left=lines.filter(l=>l.column===0&&l.text.length>30),right=lines.filter(l=>l.column===1&&l.text.length>30);
    const sidebar=left.length&&right.length&&median(left.map(l=>l.right-l.x))<width*.32&&median(right.map(l=>l.right-l.x))>width*.5;
    const abstract= p===0 ? lines.find(l=>/^abstract(?:\.|$)/i.test(l.text.trim())) : undefined;
    for(const l of lines) {
      l.skip=Boolean(sidebar&&l.column===0)||(l.y>height*.91||l.y<height*.08)&&((repeated.get(norm(l.text))?.size??0)>1||/^\d+$/.test(l.text)||/doi:|https?:|www\.|copyright|©|published by|proceedings of/i.test(l.text));
      if((p>0&&(l.y>height*.94||(l.y>height*.92&&l.size<body*.9)))||/^[\d\s,]+$/.test(l.text.trim()))l.skip=true;
      if(/^(?:doi:|www\.|https?:|©|CC Attribution|Published by|RESEARCH ARTICLE)/i.test(l.text))l.skip=true;
      if(p===0 && (l.y>height*.92 || l.y<height*.2) && l.size<body*.92)l.skip=true;
      if(/^(?:Figure|Fig\.|Table)\s*\d/i.test(l.text))l.kind='figure';
      else if(l.size>body*1.22 || (/^(?:Abstract|Introduction|Related Work|Methods?|Results?|Discussion|Conclusions?|References|Acknowledgments?)$/i.test(l.text.trim())||/^\d+(?:\.\d+)*\.?\s+[A-Z][A-Za-z -]+$/.test(l.text.trim())) && l.text.length<95)l.kind='heading';
      else if(l.pieces.filter(x=>x.math).length>l.pieces.length*.4 && l.text.replace(/[^A-Za-z]/g,'').length<20)l.kind='formula';
      if(abstract&&l.y>abstract.y&&l.kind==='text')l.skip=true;
      // Publisher marginal metadata and tiny figure labels are not body paragraphs.
      else if(l.size<body*.76 || /^(?:OPEN ACCESS|Citation:|Editor:|Received:|Accepted:|Published:|Copyright:|Data Availability|Funding:|Competing interests:|a1111)/i.test(l.text))l.skip=true;
    }
    // Sparse labels immediately above a caption belong to its figure, not to body flow.
    for(const caption of lines.filter(l=>l.kind==='figure')) {
      const above=lines.filter(l=>!l.skip&&l.column===caption.column&&l.y>caption.y).sort((a,b)=>a.y-b.y);
      for(const l of above){if(l.text.length>65||l.kind==='heading')break;l.kind='formula';}
    }
    // Full-width headings divide the page into bands. Within each band read whole columns.
    const wideHeadings=lines.filter(l=>l.column===2&&l.kind==='heading'&&!l.skip);
    const band=(l:Line)=>wideHeadings.filter(h=>h.y>l.y+2).length;
    const ordered=lines.filter(l=>!l.skip).sort((a,b)=>band(a)-band(b)||(a.column===2&&a.kind==='heading'?-1:b.column===2&&b.kind==='heading'?1:0)||(a.column===2?0:a.column)-(b.column===2?0:b.column)||b.y-a.y||a.x-b.x);
    let current:Block|undefined;let prev:Line|undefined;let caption=false;
    for(const l of ordered) {
      const sameColumn=prev?.column===l.column;
      const gap=prev?prev.y-l.y:Infinity;
      if(l.kind==='figure')caption=true;
      else if(caption && sameColumn && gap<l.size*1.75 && l.size<body*.99)l.kind='figure';else caption=false;
      const paragraphStart=!prev||l.kind!==prev.kind||!sameColumn||gap>l.size*1.85||gap<0||(l.x-prev.x>l.size*.65&&endsSentence(prev.text))||(l.kind==='heading'&&gap>l.size*1.8);
      if(!current||paragraphStart){current={lines:[],kind:l.kind,id:`p${p}-b${blocks.length}`};blocks.push(current);}
      current.lines.push(l);prev=l;
    }
    if(!ordered.length)warnings.push(`第 ${p+1} 页未提取到可翻译正文，可能是扫描件。`);
  });
  // Keep figures outside the body flow; join only evidence-supported column/page continuations.
  const prose=blocks.filter(b=>b.kind!=='figure'&&b.kind!=='formula');
  const merged:Block[]=[];
  for(const b of prose){const prior=merged.at(-1);const last=prior?.lines.at(-1);const first=b.lines[0]!;
    const continuation=prior?.kind==='text'&&b.kind==='text'&&last&&(!endsSentence(last.text)||isAbbreviation(last.text))&&(/^[a-z(]/.test(appendBlock(b).text)||/^[A-Z][a-z]?\s+to\s/.test(appendBlock(b).text))&&Math.abs(median(b.lines.map(l=>l.size))-last.size)<last.size*.2&&(last.column!==first.column||last.pageIndex+1===first.pageIndex);
    if(continuation)prior.lines.push(...b.lines);else merged.push(b);
  }
  const all=[...merged,...blocks.filter(b=>b.kind==='figure'||b.kind==='formula')].sort((a,b)=>a.lines[0]!.pageIndex-b.lines[0]!.pageIndex||blocks.indexOf(a)-blocks.indexOf(b));
  const sentences:TranslationSentence[]=[];
  for(const b of all) {
    const {text,spans}=appendBlock(b);const ranges=b.kind==='heading'||b.kind==='formula'?[{start:0,end:text.length}]:sentenceRanges(text);
    for(const range of ranges) {
      const source=text.slice(range.start,range.end).trim();if(!source)continue;
      const grouped=new Map<number,PdfRect[]>();let approximate=false;
      for(const span of spans){const start=Math.max(span.start,range.start),end=Math.min(span.end,range.end);if(end<=start)continue;
        const n=span.end-span.start;const fraction=(end-start)/n;const r={...span.rect,x:span.rect.x+span.rect.width*(start-span.start)/n,width:span.rect.width*fraction};
        if(fraction<1)approximate=true;const rects=grouped.get(span.pageIndex)??[];rects.push(r);grouped.set(span.pageIndex,rects);
      }
      if(!grouped.size)continue;
      sentences.push({id:`${EXTRACTION_VERSION}:${b.id}:s${range.start}`,paragraphId:b.id,source,kind:b.kind,anchor:{...ref,pages:[...grouped].map(([pageIndex,rects])=>({pageIndex,rects}))},approximate:true,warnings:[...(approximate?['句首句尾使用近似字宽定位']:[]),...(/�/.test(source)?['含无法解码的文字']:[]),...(/[=∈∑∫√≠≤≥]/.test(source)?['含数学表达式，请对照原文核对符号']:[])]});
    }
  }
  return {...ref,version:EXTRACTION_VERSION,pageCount:pdf.numPages,sentences,warnings};
}
