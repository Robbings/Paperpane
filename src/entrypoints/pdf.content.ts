import { defineContentScript } from 'wxt/utils/define-content-script';
import { browser } from 'wxt/browser';
import { mountPdfPage } from '@/browser-entry/page-buttons';
import { readBrowserSettings, subscribeBrowserSettings } from '@/browser-entry/settings';

export default defineContentScript({
  matches: ['https://*/*', 'http://*/*'],
  runAt: 'document_idle',
  async main(ctx) {
    if (document.documentElement.dataset.paperpanePdfMounted) return;
    document.documentElement.dataset.paperpanePdfMounted = 'true';
    const page = mountPdfPage(document, async pdfUrl => {
      const result = await browser.runtime.sendMessage({ type: 'OPEN_PDF', pdfUrl });
      if (!result?.ok) throw new Error(result?.error ?? '无法打开纸窗。');
    }, (pdfUrl, direct) => { void browser.runtime.sendMessage({ type: 'REPORT_PAGE_PDF', pdfUrl, direct }).catch(() => {}); });
    const unsubscribe = subscribeBrowserSettings(settings => page.setVisible(settings.showPdfButtons));
    ctx.onInvalidated(() => { unsubscribe(); page.dispose(); delete document.documentElement.dataset.paperpanePdfMounted; });
    const settings = await readBrowserSettings();
    if (!ctx.isInvalid) page.setVisible(settings.showPdfButtons);
  },
});
