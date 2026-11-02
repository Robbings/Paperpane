import { createPdfButton } from './button';
import { isPdfLink, pdfSourceUrl } from './pdf';
import { scanPaperSources } from './source-adapters';

/** Scans local DOM only; no speculative HEAD/fetch requests for a page's links. */
export function mountPdfPage(doc: Document, open: (url: string) => Promise<void>) {
  const controls = new Map<Element, { control: HTMLElement; url: string; anchor?:Element }>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  function scan() {
    for (const [source, entry] of controls) if (!source.isConnected || !entry.control.isConnected) { entry.control.remove(); controls.delete(source); }
    const { candidates, exclusive } = scanPaperSources(doc);
    const seen = new Set(candidates.map(candidate => candidate.url));
    if (!exclusive) {
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
    const sources = new Set(candidates.map(candidate => candidate.source));
    for (const [source, entry] of controls) if (!sources.has(source)) { entry.control.remove(); controls.delete(source); }
    for (const { source, url, floating, anchor, position, site } of candidates) {
      const existing = controls.get(source);
      if (existing && (existing.url !== url||existing.anchor!==anchor)) { existing.control.remove(); controls.delete(source); }
      if (controls.has(source) || (floating && doc.querySelector('[data-paperpane-floating]'))) continue;
      const wrapper = doc.createElement('span'); wrapper.dataset.paperpaneEntry = '';
      if(site)wrapper.dataset.paperpaneSource=site;
      if (floating) { wrapper.dataset.paperpaneFloating = ''; wrapper.style.cssText = 'position:fixed;left:20px;bottom:20px;z-index:2147483647;'; }
      else wrapper.style.cssText = site==='google-scholar'?'display:block;margin:6px 0;':'display:inline-flex;margin:4px 8px;vertical-align:middle';
      wrapper.append(floating ? createPdfButton(doc, () => open(url)) : createPdfButton(doc, () => open(url), '用纸窗打开 PDF', 'link'));
      if (floating) doc.documentElement.append(wrapper); else if(position==='append')(anchor??source).append(wrapper);else(anchor??source).after(wrapper);
      controls.set(source, { control: wrapper, url, anchor });
    }
  }
  const schedule = () => { if (timer) clearTimeout(timer); timer = setTimeout(scan, 120); };
  const observer = new MutationObserver(schedule);
  observer.observe(doc.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['href', 'src', 'data', 'type', 'content'] });
  scan();
  return () => {
    observer.disconnect();
    clearTimeout(timer);
    for (const { control } of controls.values()) control.remove();
    controls.clear();
  };
}
