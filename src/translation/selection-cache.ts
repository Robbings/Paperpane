import type { TranslationRun } from '@/contracts/translation';
type Selection = NonNullable<TranslationRun['selection']>;
const pages = (selection: Pick<Selection, 'anchor'>) => [...new Set(selection.anchor.pages.map(page => page.pageIndex))].sort((a, b) => a - b);
/** Geometry describes where to display a result, not what needs translation. */
export function sameSelection(a: Selection | undefined, b: Selection): boolean {
  return !!a && a.text.trim() === b.text.trim() && JSON.stringify(pages(a)) === JSON.stringify(pages(b));
}
export async function selectionCacheKey(selection: Pick<Selection, 'text' | 'anchor'>): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify({ text: selection.text.trim(), pages: pages(selection) }));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('');
}
