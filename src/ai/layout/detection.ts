import type { PdfjsReader } from '@/document/reader/pdfjs-reader';
import type { DocumentRef } from '@/contracts/document';
import { ElementStore } from './store';
import { detectLayout } from './client';
import { elementKind, matchCaption, resolveElements } from './geometry';
import { LAYOUT_VERSION, type PaperElement, type PageLayout } from './types';

/** Visible-page detection and background counting share the same cache and lock. */
export async function readLayoutPage(reader: PdfjsReader, ref: DocumentRef, index: number, signal: AbortSignal): Promise<PageLayout> {
  const store = new ElementStore(), key = `layout:${ref.fileVersion}:${ref.documentId}:${index}:${LAYOUT_VERSION}`;
  const cached = await store.read<PageLayout>(key, true);
  signal.throwIfAborted();
  if (cached) return cached;
  return navigator.locks.request(key, { signal }, async () => {
    const saved = await store.read<PageLayout>(key, true);
    signal.throwIfAborted();
    if (saved) return saved;
    const image = await reader.layoutPage(index, signal);
    const regions = await detectLayout(image.blob, image.width, image.height, signal);
    const page: PageLayout = { ...ref, pageIndex: index, width: image.width, height: image.height, regions, version: LAYOUT_VERSION };
    signal.throwIfAborted();
    await store.write(key, page, true);
    return page;
  });
}

export async function pageElements(reader: PdfjsReader, page: PageLayout, signal: AbortSignal): Promise<PaperElement[]> {
  const found: PaperElement[] = [];
  for (const [i, region] of resolveElements(page.regions).entries()) {
    const kind = elementKind(region);
    if (!kind) continue;
    const anchor = await reader.elementAnchor(page.pageIndex, region.box);
    const caption = matchCaption(region, page.regions);
    const captionAnchor = caption ? await reader.elementAnchor(page.pageIndex, caption.box) : undefined;
    signal.throwIfAborted();
    found.push({ id: `${page.pageIndex}:${i}:${region.box.map(n => n.toFixed(5)).join(',')}`, kind, region, page, anchor, caption, captionAnchor });
  }
  return found;
}
