import { defineContentScript } from 'wxt/utils/define-content-script';
import { browser } from 'wxt/browser';
import { mountArxivButton } from '@/browser-entry/arxiv-button';
import { mountPdfPage } from '@/browser-entry/page-buttons';
import { readBrowserSettings, subscribeBrowserSettings } from '@/browser-entry/settings';

export default defineContentScript({
  matches: ['https://*/*', 'http://*/*'],
  runAt: 'document_idle',
  async main(ctx) {
    if (document.contentType !== 'text/html' && document.contentType !== 'application/xhtml+xml') return;
    const open = async (pdfUrl: string) => {
      // Keep the navigation in the clicked site's browser context (cookies and referrer).
      const marker = 'about:blank#paperpane-' + crypto.getRandomValues(new Uint32Array(4)).join('-');
      const destination = window.open(marker, '_blank');
      if (!destination) throw new Error('请允许此页面打开新窗口后重试。');
      try {
        const result = await browser.runtime.sendMessage({ type: 'BEGIN_PDF_NAVIGATION', pdfUrl, marker });
        if (!result?.ok) throw new Error(result?.error ?? '请刷新页面后重试。');
        // Only navigate our blank page. The user may already have closed or reused it.
        if (destination.closed || destination.location.href !== marker) throw new Error('新窗口已关闭或页面已改变。');
        destination.opener = null;
        destination.location.replace(pdfUrl);
      } catch (error) {
        try {
          if (!destination.closed && destination.location.href === marker) destination.close();
        } catch { /* The destination is already on another origin. */ }
        throw error;
      }
    };
    const isArxiv = location.hostname === 'arxiv.org' && /^\/(abs|html)\//.test(location.pathname);
    let dispose: (() => void) | undefined;
    function setVisible(show: boolean) {
      if (!show) { dispose?.(); dispose = undefined; }
      else if (!dispose) dispose = isArxiv ? mountArxivButton(document, open) : mountPdfPage(document, open);
    }
    const unsubscribe = subscribeBrowserSettings(settings => setVisible(settings.showPdfButtons));
    ctx.onInvalidated(() => { unsubscribe(); dispose?.(); });
    const settings = await readBrowserSettings();
    if (!ctx.isInvalid) setVisible(settings.showPdfButtons);
  },
});
