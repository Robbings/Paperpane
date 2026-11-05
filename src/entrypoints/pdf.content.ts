import { isVerificationPage, observeViewerPdfs } from '@/browser-entry/viewer-pdf';
import { paperpaneNavigationUrl, publisherPdfUrl } from '@/browser-entry/publisher-pdf';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { browser } from 'wxt/browser';
import { mountArxivButton } from '@/browser-entry/arxiv-button';
import { mountPdfPage } from '@/browser-entry/page-buttons';
import { readBrowserSettings, subscribeBrowserSettings } from '@/browser-entry/settings';
import { scanPaperSources } from '@/browser-entry/source-adapters';
import { arxivPdfUrl } from '@/browser-entry/arxiv';

export default defineContentScript({
  matches: ['https://*/*', 'http://*/*'],
  runAt: 'document_idle',
  async main(ctx) {
    if (document.contentType !== 'text/html' && document.contentType !== 'application/xhtml+xml') return;
    let refresh: (() => void) | undefined;
    let readyTimer: ReturnType<typeof setTimeout> | undefined;
    const resources = observeViewerPdfs(document, () => {
      refresh?.();
      clearTimeout(readyTimer);
      readyTimer = setTimeout(() => { void browser.runtime.sendMessage({ type: 'VIEWER_PDF_READY' }).catch(() => {}); }, 150);
    });
    ctx.onInvalidated(() => { resources.dispose(); clearTimeout(readyTimer); });
    const open = async (pdfUrl: string) => {
      const resource = resources.resolve(pdfUrl);
      if (resource) {
        const result = await browser.runtime.sendMessage({ type: 'OPEN_VIEWER_PDF', pdfUrl: resource });
        if (!result?.ok) throw new Error(result?.error ?? '无法读取网页中的 PDF。');
        return;
      }
      pdfUrl = publisherPdfUrl(pdfUrl) ?? pdfUrl;
      // Keep the navigation in the clicked site's browser context (cookies and referrer).
      const marker = 'about:blank#paperpane-' + crypto.getRandomValues(new Uint32Array(4)).join('-');
      const destination = window.open(marker, '_blank');
      if (!destination) throw new Error('请允许此页面打开新标签页后重试。');
      try {
        const result = await browser.runtime.sendMessage({ type: 'BEGIN_PDF_NAVIGATION', pdfUrl, marker });
        if (!result?.ok) throw new Error(result?.error ?? '请刷新页面后重试。');
        // The site only offers the PDF as a download: the extension already sent this tab to the reader.
        if (result.direct) return;
        // Only navigate our blank page. The user may already have closed or reused it.
        if (destination.closed || destination.location.href !== marker) throw new Error('新标签页已关闭或页面已改变。');
        destination.opener = null;
        destination.location.replace(paperpaneNavigationUrl(pdfUrl));
      } catch (error) {
        try {
          if (!destination.closed && destination.location.href === marker) destination.close();
        } catch { /* The destination is already on another origin. */ }
        throw error;
      }
    };
    const isArxiv = location.hostname === 'arxiv.org' && /^\/(abs|html)\//.test(location.pathname);
    // The toolbar popup asks which PDF belongs to this paper page.
    const answer = (message: unknown, _sender: unknown, reply: (value: { url?: string; resources?: string[]; pageUrl?: string }) => void) => {
      if ((message as { type?: string })?.type === 'PDF_RESOURCE_RESPONSE') {
        resources.add((message as { url: string }).url, true); reply({}); return;
      }
      if ((message as { type?: string })?.type !== 'PAPERPANE_PAGE_PDF') return;
      if (isVerificationPage(document)) { reply({}); return; }
      resources.scan();
      let url: string | undefined = resources.resolve();
      try { if (isArxiv) url = arxivPdfUrl(location.href); } catch { /* Not a paper page. */ }
      url ??= scanPaperSources(document).candidates[0]?.url;
      if (!url) {
        const meta = document.querySelector<HTMLMetaElement>('meta[name="citation_pdf_url"]')?.content.trim();
        try { if (meta && !meta.startsWith('#')) url = publisherPdfUrl(new URL(meta, document.baseURI).href) ?? new URL(meta, document.baseURI).href; } catch { /* Invalid metadata. */ }
      }
      reply({ url, resources: resources.list(), pageUrl: location.href.split('#')[0] });
    };
    browser.runtime.onMessage.addListener(answer);
    ctx.onInvalidated(() => browser.runtime.onMessage.removeListener(answer));
    let dispose: (() => void) | undefined;
    function setVisible(show: boolean) {
      if (!show) { dispose?.(); dispose = undefined; }
      else if (!dispose) {
        if (isArxiv) dispose = mountArxivButton(document, open);
        else { const mounted = mountPdfPage(document, open, () => resources.resolve()); dispose = mounted; refresh = mounted.refresh; }
      }
    }
    const unsubscribe = subscribeBrowserSettings(settings => setVisible(settings.showPdfButtons));
    ctx.onInvalidated(() => { unsubscribe(); dispose?.(); });
    const settings = await readBrowserSettings();
    if (!ctx.isInvalid) setVisible(settings.showPdfButtons);
  },
});
