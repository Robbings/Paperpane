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
    const anchor = pdfLink ?? doc.querySelector('h1');
    if (!anchor) return;
    const button = createPdfButton(doc, () => {
      if (pdfLink && pdfLink.href.split(/[?#]/, 1)[0] === url) return open(pdfLink.href);
      return open(url);
    }, '用纸间打开 PDF', 'link');
    button.id = 'paperpane-open-arxiv';
    const listItem = anchor.closest('li');
    if (listItem) {
      const item = doc.createElement('li');
      item.append(button);
      listItem.after(item);
      inserted = item;
    } else { anchor.after(button); inserted = button; }
  }
  insert();
  const observer = new MutationObserver(insert);
  observer.observe(doc.body, { childList: true, subtree: true });
  return () => { observer.disconnect(); inserted?.remove(); };
}
