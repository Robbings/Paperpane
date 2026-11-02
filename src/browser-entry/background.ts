import { browser } from 'wxt/browser';
import { mountCompletedPdfLink } from './completed-pdf-link';
import { completedPdfUrl, isPdfResponse, pdfReaderUrl, pdfSourceUrl } from './pdf';
import { BROWSER_ENTRY_KEY, normalizeBrowserSettings, readBrowserSettings } from './settings';
interface PdfTab { pageUrl: string; pdfUrl?: string; direct: boolean; completed: boolean; requestId: string }
interface PdfNavigation { url: string; requestId?: string }
const navigationKey = (id: number) => `pdfNavigation:${id}`;
const tabKey = (id: number) => `pdfTab:${id}`;
export function installBrowserEntry() {
  let settingsTail = Promise.resolve();
  const extensionUrl = browser.runtime.getURL('/');
  const readerUrl = browser.runtime.getURL('/reader.html');
  const tails = new Map<number, Promise<void>>();
  const filter = { urls: ['https://*/*', 'http://*/*'], types: ['main_frame' as const] };
  async function openReader(tabId: number, pdfUrl: string) {
    const target = new URL(pdfReaderUrl(readerUrl, pdfUrl));
    target.searchParams.set('browserTab', String(tabId));
    const source = await browser.tabs.get(tabId);
    await browser.tabs.create({ url: target.href, windowId: source.windowId, openerTabId: tabId });
  }

  async function preparePdfPage(tabId: number, url: string) {
    const [frame] = await browser.scripting.executeScript({
      target: { tabId }, func: mountCompletedPdfLink, args: [url],
    }).catch(() => []);
    return frame?.result === true;
  }

  async function handleReady(tabId: number) {
    const state = await currentPdf(tabId);
    if (!('pdfUrl' in state) || !state.pdfUrl) return;
    if (!await preparePdfPage(tabId, state.pdfUrl)) return;
    const key = navigationKey(tabId);
    const pending = (await browser.storage.session.get(key))[key] as PdfNavigation | undefined;
    if (pending?.requestId && pending.url === state.pdfUrl) {
      await openReader(tabId, state.pdfUrl);
      await browser.storage.session.remove(key);
    }
  }
  const badge = (tabId: number, text: string) => browser.action.setBadgeText({ tabId, text }).catch(() => {});
  function enqueue(tabId: number, task: () => Promise<void>) {
    if (tabId < 0) return;
    const next = (tails.get(tabId) ?? Promise.resolve()).then(task).catch(() => {});
    tails.set(tabId, next);
    void next.then(() => { if (tails.get(tabId) === next) tails.delete(tabId); });
  }
  // A click arms one tab before the source document follows its PDF link. Redirects
  // keep the request ID. Login forms and interstitials can start a new navigation
  // from the last site in that chain. An unrelated address-bar navigation cancels it.
  browser.webRequest.onBeforeRequest.addListener(details => {
    enqueue(details.tabId, async () => {
      const key = navigationKey(details.tabId);
      const pending = (await browser.storage.session.get(key))[key] as PdfNavigation | undefined;
      if (pending) {
        const url = pdfSourceUrl(details.url);
        const redirect = pending.requestId === details.requestId;
        const fromInterstitial = pending.requestId !== undefined && details.initiator === new URL(pending.url).origin;
        const follows = pending.url === url || redirect || fromInterstitial;
        if (follows) await browser.storage.session.set({ [key]: { url, requestId: details.requestId } });
        else await browser.storage.session.remove(key);
      }
      await browser.storage.session.remove(tabKey(details.tabId));
      await badge(details.tabId, '');
    });
  }, filter);
  browser.webRequest.onHeadersReceived.addListener(details => {
    enqueue(details.tabId, async () => {
      const direct = isPdfResponse(details);
      const value: PdfTab = { pageUrl: details.url, pdfUrl: direct ? details.url : undefined,
        direct, completed: false, requestId: details.requestId };
      const disposition = details.responseHeaders?.find(header => header.name.toLowerCase() === 'content-disposition');
      if (/^attachment(?:;|$)/i.test(disposition?.value?.trim() ?? '')) await browser.storage.session.remove(navigationKey(details.tabId));
      await browser.storage.session.set({ [tabKey(details.tabId)]: value });
    });
  }, filter, ['responseHeaders']);
  browser.webRequest.onCompleted.addListener(details => {
    enqueue(details.tabId, async () => {
      const key = tabKey(details.tabId);
      const known = (await browser.storage.session.get(key))[key] as PdfTab | undefined;
      if (known?.requestId !== details.requestId || !known.direct) return;
      await browser.storage.session.set({ [key]: { ...known, completed: true } });
      await badge(details.tabId, 'PDF');
      await handleReady(details.tabId);
    });
  }, filter);
  browser.webRequest.onErrorOccurred.addListener(details => {
    enqueue(details.tabId, async () => {
      const key = tabKey(details.tabId);
      const known = (await browser.storage.session.get(key))[key] as PdfTab | undefined;
      if (known?.requestId === details.requestId) await browser.storage.session.remove(key);
      await badge(details.tabId, '');
    });
  }, filter);
  browser.tabs.onUpdated.addListener((tabId, change) => {
    if (change.url && !/^https?:/.test(change.url)) enqueue(tabId, () => browser.storage.session.remove(navigationKey(tabId)));
    if (change.status === 'complete') enqueue(tabId, () => handleReady(tabId));
  });
  browser.tabs.onRemoved.addListener(tabId => {
    enqueue(tabId, async () => { await browser.storage.session.remove([tabKey(tabId), navigationKey(tabId)]); });
  });
  async function currentPdf(tabId: number, inspectExisting = false) {
    const tab = await browser.tabs.get(tabId), raw = tab.url ?? '';
    if (raw.startsWith(extensionUrl)) return { tabId, title: tab.title ?? '纸窗', block: /^\/(reader|reader-proof)\.html$/.test(new URL(raw).pathname)?'in-reader':'in-paperpane' };
    if (raw.startsWith('file:')) return { tabId, title: tab.title ?? '本地文件', block: 'file-access' };
    try { pdfSourceUrl(raw); } catch { return { tabId, title: tab.title ?? '', block: 'restricted' }; }
    const known = (await browser.storage.session.get(tabKey(tabId)))[tabKey(tabId)] as PdfTab | undefined;
    let pdfUrl = completedPdfUrl(tab, known);
    // The extension may have been enabled after this PDF was opened. Only a manual
    // action can use this fallback, and only the current top-level PDF may attest it.
    if (inspectExisting && !known && tab.status === 'complete' && !tab.pendingUrl) {
      const expected = pdfSourceUrl(raw);
      if (await preparePdfPage(tabId, expected)) pdfUrl = expected;
    }
    return { tabId, title: tab.title ?? new URL(raw).hostname, displayUrl: new URL(raw).host + new URL(raw).pathname, pdfUrl, block: pdfUrl ? undefined : 'not-pdf' };
  }

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const supported = ['BEGIN_PDF_NAVIGATION', 'OPEN_CURRENT_PDF', 'OPEN_ARXIV_PAPER', 'OPEN_PDF', 'REPORT_PAGE_PDF', 'GET_PDF_STATE', 'OPEN_TAB_PDF', 'OPEN_ORIGINAL_PDF', 'SET_BROWSER_ENTRY'];
    if (!supported.includes(message?.type)) return;
    void (async () => {
      try {
        if (sender.id !== browser.runtime.id || !sender.url) throw new Error('无效的纸窗入口。');
        const fromExtension = sender.url.startsWith(extensionUrl);
        if (message.type === 'BEGIN_PDF_NAVIGATION') {
          if (sender.frameId !== 0 || sender.tab?.id === undefined || fromExtension) throw new Error('请从论文网页打开 PDF。');
          const url = pdfSourceUrl(message.pdfUrl);
          const tabId = sender.tab.id;
          await tails.get(tabId);
          const tab = await browser.tabs.get(tabId);
          if (tab.pendingUrl || pdfSourceUrl(tab.url ?? '') !== pdfSourceUrl(sender.url)) throw new Error('论文页面已改变，请重试。');
          await browser.storage.session.set({ [navigationKey(tabId)]: { url } });
        } else if (message.type === 'OPEN_CURRENT_PDF') {
          if (sender.tab?.id === undefined || sender.frameId !== 0) throw new Error('请从已打开的 PDF 页面导入。');
          await tails.get(sender.tab.id);
          const state = await currentPdf(sender.tab.id, true);
          if (!('pdfUrl' in state) || !state.pdfUrl || pdfSourceUrl(sender.url) !== state.pdfUrl) throw new Error('PDF 页面尚未完成加载，请稍后重试。');
          await openReader(state.tabId, state.pdfUrl);
        } else if (['OPEN_ARXIV_PAPER', 'OPEN_PDF', 'REPORT_PAGE_PDF'].includes(message.type)) {
          throw new Error('请先在浏览器中打开 PDF，再通过纸窗扩展弹窗导入。');
        } else {
          if (!fromExtension) throw new Error('请从纸窗界面进行此操作。');
          if (message.type === 'GET_PDF_STATE' || message.type === 'OPEN_TAB_PDF') {
            if (!Number.isInteger(message.tabId)) throw new Error('当前标签页已不可用。');
            await tails.get(message.tabId);
            const state = await currentPdf(message.tabId, true);
            if (message.type === 'GET_PDF_STATE') { sendResponse({ ok: true, value: state }); return; }
            if (!('pdfUrl' in state) || !state.pdfUrl) throw new Error('当前页面没有可打开的 PDF。');
            await openReader(state.tabId, state.pdfUrl);
          } else if (message.type === 'OPEN_ORIGINAL_PDF') {
            if (!sender.tab?.id) throw new Error('当前阅读器标签页已关闭。');
            const url = pdfSourceUrl(message.pdfUrl);
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
