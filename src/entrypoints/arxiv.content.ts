import { defineContentScript } from 'wxt/utils/define-content-script';
import { browser } from 'wxt/browser';
import { mountArxivButton } from '@/browser-entry/arxiv-button';
import { readBrowserSettings, subscribeBrowserSettings } from '@/browser-entry/settings';

export default defineContentScript({
  matches: ['https://arxiv.org/abs/*', 'https://arxiv.org/html/*'],
  runAt: 'document_idle',
  async main(ctx) {
    const open = async (pdfUrl: string) => {
      const result = await browser.runtime.sendMessage({ type: 'OPEN_ARXIV_PAPER', pdfUrl });
      if (!result?.ok) throw new Error(result?.error || '扩展未响应，请重新加载扩展和论文页面。');
    };
    let cleanup = () => {};
    const apply = (show: boolean) => { cleanup(); cleanup = show ? mountArxivButton(document, open) : () => {}; };
    const unsubscribe = subscribeBrowserSettings(settings => apply(settings.showPdfButtons));
    ctx.onInvalidated(() => { unsubscribe(); cleanup(); });
    const settings = await readBrowserSettings();
    if (!ctx.isInvalid) apply(settings.showPdfButtons);
  },
});
