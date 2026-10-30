import type { ReaderOutlineItem } from '@/contracts/reader';
interface Bookmark { title: string; dest?: string | unknown[] | null; items?: Bookmark[] }
interface OutlinePdf {
  numPages: number;
  getOutline(): Promise<Bookmark[] | null>;
  getDestination(name: string): Promise<unknown[] | null>;
  getPageIndex(ref: {num:number;gen:number}): Promise<number>;
}
export interface NavigationItem extends ReaderOutlineItem { destination?: unknown[]; top?: number }
/** Only local, resolvable destinations. A broken bookmark must not suppress valid children. */
export async function nativeOutline(pdf: OutlinePdf, signal?: AbortSignal): Promise<NavigationItem[]> {
  const result: NavigationItem[] = [];
  async function visit(items: Bookmark[], depth: number) {
    for (const item of items) {
      signal?.throwIfAborted();
      try {
        const dest = typeof item.dest === 'string' ? await pdf.getDestination(item.dest) : item.dest;
        if (Array.isArray(dest) && dest.length) {
          const pageIndex = typeof dest[0] === 'number' ? dest[0] : await pdf.getPageIndex(dest[0] as {num:number;gen:number});
          if (Number.isInteger(pageIndex) && pageIndex >= 0 && pageIndex < pdf.numPages)
            result.push({id:`native-${result.length}`,title:item.title || '未命名章节',depth,pageIndex,destination:dest});
        }
      } catch { signal?.throwIfAborted(); }
      await visit(item.items ?? [],depth+1);
    }
  }
  await visit(await pdf.getOutline() ?? [],0); return result;
}
interface Heading { kind: string; source: string; anchor?: { pages: readonly {pageIndex:number;rects:readonly {y:number;height:number}[]}[] } }
export function generatedOutline(sentences: readonly Heading[]): NavigationItem[] {
  return sentences.filter(s=>s.kind==='heading' && s.source.trim().length>1 && s.source.length<180 && s.anchor?.pages[0]).map((s,i)=>{
    const page=s.anchor!.pages[0]!;
    const number=s.source.match(/^\s*(\d+(?:\.\d+)*)[.\s]/)?.[1];
    return {id:`layout-${i}`,title:s.source.trim(),depth:number?Math.min(5,number.split('.').length-1):0,pageIndex:page.pageIndex,top:Math.max(...page.rects.map(r=>r.y+r.height))};
  });
}
