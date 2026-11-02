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
      const result = await browser.runtime.sendMessage({ type: 'BEGIN_PDF_NAVIGATION', pdfUrl });
      if (!result?.ok) throw new Error(result?.error ?? '请刷新页面后重试。');
      location.assign(pdfUrl);
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
