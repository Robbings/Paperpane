import { browser } from 'wxt/browser';
import { arxivPdfUrl, readerImportUrl } from './arxiv';
import { isPdfLink, isPdfResponse, pdfReaderUrl, pdfSourceUrl, shouldAutoOpen } from './pdf';
import { BROWSER_ENTRY_KEY, normalizeBrowserSettings, readBrowserSettings } from './settings';
import { sourcePdfUrl } from './source-urls';

interface PdfTab { pageUrl: string; pdfUrl?: string; direct: boolean }
const tabKey = (id: number) => `pdfTab:${id}`;
const bypassKey = (id: number) => `pdfBypass:${id}`;

export function installBrowserEntry() {
  let settingsTail = Promise.resolve();
  const navigating = new Set<number>();
  const redirectTails = new Map<number, Promise<void>>();
  const extensionUrl = browser.runtime.getURL('/');
  const readerUrl = browser.runtime.getURL('/reader.html');
  const badge = (tabId: number, text: string) => browser.action.setBadgeText({ tabId, text }).catch(() => {});
  async function remember(tabId: number, value: PdfTab) {
    await browser.storage.session.set({ [tabKey(tabId)]: value });
    await badge(tabId, value.pdfUrl ? 'PDF' : '');
  }
  async function directPdf(tabId: number, raw: string) {
    if (tabId < 0 || navigating.has(tabId)) return;
    const url = pdfSourceUrl(raw);
    const tab = await browser.tabs.get(tabId);
    const current = tab.pendingUrl ?? tab.url;
    if (current && pdfSourceUrl(current) !== url) return;
    const settings = await readBrowserSettings();
    await redirectTails.get(tabId);
    const stored = await browser.storage.session.get(bypassKey(tabId));
    const bypass = stored[bypassKey(tabId)];
    if (!shouldAutoOpen(settings, url, typeof bypass === 'string' ? bypass : undefined)) return;
    const latest = await browser.tabs.get(tabId);
    if (pdfSourceUrl(latest.pendingUrl ?? latest.url ?? '') !== url) return;
    navigating.add(tabId);
    try { await browser.tabs.update(tabId, { url: pdfReaderUrl(readerUrl, url) }); }
    finally { navigating.delete(tabId); }
  }

  // MV3 observation only: never block or rewrite a site's response.
  browser.webRequest.onBeforeRedirect.addListener(details => {
    if (details.tabId < 0) return;
    // Carry the original-view bypass across every hop of this navigation.
    // Serializing it also makes header and tab-update handlers wait for the final URL.
    const task = (redirectTails.get(details.tabId) ?? Promise.resolve()).then(async () => {
      const key = bypassKey(details.tabId);
      const bypass = (await browser.storage.session.get(key))[key];
      if (typeof bypass === 'string' && bypass === pdfSourceUrl(details.url)) {
        await browser.storage.session.set({ [key]: pdfSourceUrl(details.redirectUrl) });
      }
    }).catch(() => {});
    redirectTails.set(details.tabId, task);
  }, { urls: ['https://*/*', 'http://*/*'], types: ['main_frame'] });

  browser.webRequest.onHeadersReceived.addListener(details => {
    if (details.tabId < 0) return;
    if (isPdfResponse(details)) {
      void remember(details.tabId, { pageUrl: details.url, pdfUrl: details.url, direct: true })
        .then(() => directPdf(details.tabId, details.url)).catch(() => {});
    }
    else if (details.statusCode >= 200 && details.statusCode < 300) {
      void remember(details.tabId, { pageUrl: details.url, direct: false }).catch(() => {});
    }
  }, { urls: ['https://*/*', 'http://*/*'], types: ['main_frame'] }, ['responseHeaders']);

  browser.tabs.onUpdated.addListener((tabId, change) => {
    if (change.url) {
      void (async () => {
        const known = (await browser.storage.session.get(tabKey(tabId)))[tabKey(tabId)] as PdfTab | undefined;
        if (known?.pageUrl !== change.url) await badge(tabId, '');
      })().catch(() => {});
    }
    if (change.status === 'complete') {
      void (async () => {
        await redirectTails.get(tabId);
        const known = (await browser.storage.session.get(tabKey(tabId)))[tabKey(tabId)] as PdfTab | undefined;
        const current = await browser.tabs.get(tabId);
        if (current.status !== 'complete') return;
        const key = bypassKey(tabId), bypass = (await browser.storage.session.get(key))[key];
        let same = false;
        try { same = typeof bypass === 'string' && pdfSourceUrl(current.url ?? '') === bypass; } catch { /* Extension or browser page. */ }
        if (bypass && !same) await browser.storage.session.remove(key);
        if (known?.direct && known.pdfUrl && current.url && pdfSourceUrl(current.url) === known.pageUrl) {
          // A redirect can still be pending at header time; retry only after its final URL commits.
          await directPdf(tabId, known.pdfUrl);
        }
        const latest = await browser.tabs.get(tabId);
        if (known?.direct && latest.url === known.pageUrl && (await readBrowserSettings()).showPdfButtons) {
          // Native PDF injection may be restricted; the toolbar popup remains available.
          await browser.scripting.executeScript({ target: { tabId }, files: ['/content-scripts/pdf.js'] });
        }
      })().catch(() => {});
    }
  });
  browser.tabs.onRemoved.addListener(tabId => { redirectTails.delete(tabId); void browser.storage.session.remove([tabKey(tabId), bypassKey(tabId)]).catch(() => {}); });

  async function currentPdf(tabId: number) {
    const tab = await browser.tabs.get(tabId), raw = tab.url ?? '';
    if (raw.startsWith(extensionUrl)) return { tabId, title: tab.title ?? '纸窗', block: /^\/(reader|reader-proof)\.html$/.test(new URL(raw).pathname)?'in-reader':'in-paperpane' };
    if (raw.startsWith('file:')) return { tabId, title: tab.title ?? '本地文件', block: 'file-access' };
    let pageUrl: string;
    try { pageUrl = pdfSourceUrl(raw); } catch { return { tabId, title: tab.title ?? '', block: 'restricted' }; }
    const known = (await browser.storage.session.get(tabKey(tabId)))[tabKey(tabId)] as PdfTab | undefined;
    let pdfUrl = known?.pageUrl === pageUrl ? known.pdfUrl : undefined;
    if (!pdfUrl) { try { pdfUrl = arxivPdfUrl(raw); } catch { /* Generic page. */ } }
    pdfUrl??=sourcePdfUrl(raw);
    if (!pdfUrl && known?.pageUrl !== pageUrl && isPdfLink(raw)) pdfUrl = pageUrl;
    return { tabId, title: tab.title ?? new URL(raw).hostname, displayUrl: new URL(raw).host + new URL(raw).pathname, pdfUrl, block: pdfUrl ? undefined : 'not-pdf' };
  }

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const supported = ['OPEN_ARXIV_PAPER', 'OPEN_PDF', 'REPORT_PAGE_PDF', 'GET_PDF_STATE', 'OPEN_TAB_PDF', 'OPEN_ORIGINAL_PDF', 'SET_BROWSER_ENTRY'];
    if (!supported.includes(message?.type)) return;
    void (async () => {
      try {
        if (sender.id !== browser.runtime.id || !sender.url) throw new Error('无效的纸窗入口。');
        const fromExtension = sender.url.startsWith(extensionUrl);
        if (message.type === 'OPEN_ARXIV_PAPER') {
          const url = arxivPdfUrl(message.pdfUrl);
          if (!sender.tab || arxivPdfUrl(sender.url) !== url) throw new Error('论文链接与当前页面不一致，请刷新后重试。');
          await browser.tabs.create({ url: readerImportUrl(readerUrl, url) });
        } else if (message.type === 'OPEN_PDF' || message.type === 'REPORT_PAGE_PDF') {
          if (!sender.tab?.id || sender.frameId !== 0) throw new Error('请从顶层网页打开 PDF。');
          pdfSourceUrl(sender.url);
          if (message.type === 'OPEN_PDF') await browser.tabs.create({ url: pdfReaderUrl(readerUrl, pdfSourceUrl(message.pdfUrl)) });
          else {
            const pageUrl = pdfSourceUrl(sender.url), url = message.pdfUrl ? pdfSourceUrl(message.pdfUrl) : undefined;
            const known = (await browser.storage.session.get(tabKey(sender.tab.id)))[tabKey(sender.tab.id)] as PdfTab | undefined;
            await remember(sender.tab.id, { pageUrl, pdfUrl: url, direct: !!url && (message.direct === true || (known?.pageUrl === pageUrl && known.direct)) });
          }
        } else {
          if (!fromExtension) throw new Error('请从纸窗界面进行此操作。');
          if (message.type === 'GET_PDF_STATE' || message.type === 'OPEN_TAB_PDF') {
            if (!Number.isInteger(message.tabId)) throw new Error('当前标签页已不可用。');
            const state = await currentPdf(message.tabId);
            if (message.type === 'GET_PDF_STATE') { sendResponse({ ok: true, value: state }); return; }
            if (!('pdfUrl' in state) || !state.pdfUrl) throw new Error('当前页面没有可打开的 PDF。');
            await browser.tabs.create({ url: pdfReaderUrl(readerUrl, state.pdfUrl) });
          } else if (message.type === 'OPEN_ORIGINAL_PDF') {
            if (!sender.tab?.id) throw new Error('当前阅读器标签页已关闭。');
            const url = pdfSourceUrl(message.pdfUrl);
            await browser.storage.session.set({ [bypassKey(sender.tab.id)]: url });
            await browser.tabs.update(sender.tab.id, { url });
          } else if (message.type === 'SET_BROWSER_ENTRY') {
            const patch = message.patch;
            if (!patch || Object.keys(patch).some(key => !['autoOpenPdf', 'showPdfButtons'].includes(key) || typeof patch[key] !== 'boolean')) throw new Error('无效的浏览器设置。');
            const next = settingsTail.then(async () => {
              const value = normalizeBrowserSettings({ ...await readBrowserSettings(), ...patch });
              await browser.storage.local.set({ [BROWSER_ENTRY_KEY]: value });
            });
            settingsTail = next.catch(() => {});
            await next;
          }
        }
        sendResponse({ ok: true });
      } catch (error) { sendResponse({ ok: false, error: error instanceof Error ? error.message : '无法完成操作。' }); }
    })();
    return true;
  });
}
