import { arxivPdfUrl } from './arxiv';
import { createPdfButton } from './button';

/** Returns cleanup so a content-script context invalidation releases its observer. */
export function mountArxivButton(doc: Document, open: (url: string) => Promise<void>): () => void {
  let inserted: HTMLElement | undefined;
  function insert() {
    if (doc.getElementById('paperpane-open-arxiv')) return;
    let url: string;
    try { url = arxivPdfUrl(doc.location.href); } catch { return; }
    const pdfLink = doc.querySelector<HTMLAnchorElement>('.full-text a[href*="/pdf/"], a[title="Download PDF"]');
    if (!pdfLink) return;
    const button = createPdfButton(doc, () => open(url), '用纸窗打开 PDF', 'link');
    button.id = 'paperpane-open-arxiv';
    const listItem = pdfLink.closest('li');
    if (listItem) {
      const item = doc.createElement('li');
      item.append(button);
      listItem.after(item);
      inserted = item;
    } else { pdfLink.after(button); inserted = button; }
  }
  insert();
  const observer = new MutationObserver(insert);
  observer.observe(doc.body, { childList: true, subtree: true });
  return () => { observer.disconnect(); inserted?.remove(); };
}
