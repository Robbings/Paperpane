import { createPdfButton } from './button';
import { isPdfLink, pdfSourceUrl } from './pdf';
import { arxivPdfUrl } from './arxiv';
import { scanPaperSources, type PdfCandidate } from './source-adapters';

/** Scans local DOM only; no speculative HEAD/fetch requests for a page's links. */
export function mountPdfPage(doc: Document, open: (url: string) => Promise<void>, report: (url: string, direct: boolean) => void) {
  const controls = new Map<Element, { control: HTMLElement; url: string; anchor?:Element }>();
  let show = true, reported = '', timer: ReturnType<typeof setTimeout> | undefined;
  let isArxiv = false;
  try { arxivPdfUrl(doc.location.href); isArxiv = /^\/(abs|html)\//.test(doc.location.pathname); } catch { /* Generic page. */ }
  function scan() {
    for (const [source, entry] of controls) if (!source.isConnected || !entry.control.isConnected || !show) { entry.control.remove(); controls.delete(source); }
    const direct = doc.contentType === 'application/pdf';
    const candidates: PdfCandidate[] = [];
    if (direct) {
      try { candidates.push({ source: doc.documentElement, url: pdfSourceUrl(doc.location.href), floating: true }); } catch { /* Restricted page. */ }
    } else if (!isArxiv) {
      const adapted=scanPaperSources(doc);candidates.push(...adapted.candidates);
      const seen=new Set(candidates.map(candidate=>candidate.url));
      if(!adapted.exclusive){
      for (const source of doc.querySelectorAll<HTMLAnchorElement | HTMLEmbedElement | HTMLObjectElement | HTMLIFrameElement>('a[href],embed[src],object[data],iframe[src]')) {
        if (source.closest('[data-paperpane-entry]')) continue;
        const raw = source.getAttribute('href') ?? source.getAttribute('src') ?? source.getAttribute('data');
        if (!raw) continue;
        let url: string; try { url = pdfSourceUrl(new URL(raw, doc.baseURI).href); } catch { continue; }
        const type = source.getAttribute('type') ?? '';
        if (!isPdfLink(url, type) && !(source.tagName === 'A' && /^(?:view|download|full[ -]text|查看|下载)?\s*PDF$/i.test(source.textContent?.trim() ?? ''))) continue;
        if(seen.has(url))continue;seen.add(url);
        candidates.push({ source, url, floating: source.tagName !== 'A' });
      }
      const meta = doc.querySelector<HTMLMetaElement>('meta[name="citation_pdf_url"]');
      if (meta?.content.trim()&&!meta.content.trim().startsWith('#')) { try { const url=pdfSourceUrl(new URL(meta.content, doc.baseURI).href);if(url!==pdfSourceUrl(doc.location.href)&&!seen.has(url))candidates.push({ source: meta, url, floating: true }); } catch { /* Ignore invalid metadata. */ } }
      }
    }
    const first = candidates[0]?.url ?? '';
    if (reported !== first) { reported = first; report(first, direct); }
    const sources = new Set(candidates.map(candidate => candidate.source));
    for (const [source, entry] of controls) if (!sources.has(source)) { entry.control.remove(); controls.delete(source); }
    for (const { source, url, floating, anchor, position, site } of candidates) {
      const existing = controls.get(source);
      if (existing && (existing.url !== url||existing.anchor!==anchor)) { existing.control.remove(); controls.delete(source); }
      if (!show || controls.has(source) || (floating && doc.querySelector('[data-paperpane-floating]'))) continue;
      const wrapper = doc.createElement('span'); wrapper.dataset.paperpaneEntry = '';
      if(site)wrapper.dataset.paperpaneSource=site;
      if (floating) { wrapper.dataset.paperpaneFloating = ''; wrapper.style.cssText = 'position:fixed;left:20px;bottom:20px;z-index:2147483647;'; }
      else wrapper.style.cssText = site==='google-scholar'?'display:block;margin:6px 0;':'display:inline-flex;margin:4px 8px;vertical-align:middle';
      wrapper.append(createPdfButton(doc, () => open(url)));
      if (floating) doc.documentElement.append(wrapper); else if(position==='append')(anchor??source).append(wrapper);else(anchor??source).after(wrapper);
      controls.set(source, { control: wrapper, url, anchor });
    }
  }
  const schedule = () => { if (timer) clearTimeout(timer); timer = setTimeout(scan, 120); };
  const observer = new MutationObserver(schedule);
  observer.observe(doc.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['href', 'src', 'data', 'type', 'content'] });
  scan();
  return {
    setVisible(value: boolean) { show = value; scan(); },
    dispose() { observer.disconnect(); clearTimeout(timer); for (const { control } of controls.values()) control.remove(); controls.clear(); },
  };
}
