import { browser, type Browser } from 'wxt/browser';
import { mountCompletedPdfLink } from './completed-pdf-link';
import { completedPdfUrl, isDownloadOnlyPdf, isPdfResponse, localPdfUrl, pdfReaderUrl, pdfSourceUrl } from './pdf';
import { BROWSER_ENTRY_KEY, normalizeBrowserSettings, readBrowserSettings } from './settings';
interface PdfTab { pageUrl: string; pdfUrl?: string; direct: boolean; completed: boolean; requestId: string }
interface PdfNavigation { url: string; requestId?: string }
const navigationKey = (id: number) => `pdfNavigation:${id}`;
const tabKey = (id: number) => `pdfTab:${id}`;
// Chrome can return from window.open before the new tab commits its blank URL.
async function waitForPdfTab(windowId: number, openerTabId: number, marker: string) {
  const { promise, resolve, reject } = Promise.withResolvers<number>();
  const match = (tab: Browser.tabs.Tab) => {
    if (tab.id !== undefined && tab.windowId === windowId && tab.openerTabId === openerTabId &&
        tab.url === marker && !tab.pendingUrl && tab.status === 'complete') resolve(tab.id);
  };
  const updated: Parameters<typeof browser.tabs.onUpdated.addListener>[0] = (_id, _change, tab) => match(tab);
  browser.tabs.onUpdated.addListener(updated);
  const timeout = setTimeout(() => reject(new Error('新标签页未就绪，请重试。')), 10000);
  try {
    void browser.tabs.query({ windowId }).then(tabs => tabs.forEach(match), reject);
    return await promise;
  } finally {
    clearTimeout(timeout);
    browser.tabs.onUpdated.removeListener(updated);
  }
}

/**
 * Some repositories (Zenodo among them) send a PDF as a download. The browser then
 * saves it instead of showing it, so the reader has to fetch it itself.
 */
async function downloadOnlyPdf(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD', credentials: 'include', redirect: 'follow', signal: AbortSignal.timeout(5000) });
    if (!response.ok) return false;
    return isDownloadOnlyPdf(response.url || url, response.headers.get('content-type') ?? '', response.headers.get('content-disposition') ?? '');
  } catch { return false; }
}
async function allowedFileAccess(): Promise<boolean> {
  try { return await browser.extension.isAllowedFileSchemeAccess(); } catch { return false; }
}
/** The PDF a paper's landing page links to, as its content script reports it. */
async function pagePdfCandidate(tabId: number): Promise<{ url?: string; resources?: string[]; pageUrl?: string }> {
  try {
    return await browser.tabs.sendMessage(tabId, { type: 'PAPERPANE_PAGE_PDF' }, { frameId: 0 }) ?? {};
  } catch { return {}; }
}

/** A new reader is successful only after its import has produced a document. */
async function waitForReaderImport(tabId: number) {
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  const check = (tab: Browser.tabs.Tab) => {
    if (tab.id === tabId && tab.url && new URL(tab.url).searchParams.has('documentId')) resolve();
  };
  const updated: Parameters<typeof browser.tabs.onUpdated.addListener>[0] = (_id, _change, tab) => check(tab);
  const removed = (id: number) => { if (id === tabId) reject(new Error('纸间标签页已关闭，请重试。')); };
  browser.tabs.onUpdated.addListener(updated); browser.tabs.onRemoved.addListener(removed);
  const timeout = setTimeout(() => reject(new Error('PDF 尚未完成导入，请查看纸间标签页中的提示后重试。')), 90000);
  try { check(await browser.tabs.get(tabId)); await promise; }
  finally { clearTimeout(timeout); browser.tabs.onUpdated.removeListener(updated); browser.tabs.onRemoved.removeListener(removed); }
}

export function installBrowserEntry() {
  let settingsTail = Promise.resolve();
  const extensionUrl = browser.runtime.getURL('/');
  const readerUrl = browser.runtime.getURL('/reader.html');
  const tails = new Map<number, Promise<void>>();
  const filter = { urls: ['https://*/*', 'http://*/*'], types: ['main_frame' as const] };
  /** The reader downloads this PDF itself, with the site's session, as the clicked link would. */
  const siteReaderUrl = (pdfUrl: string) => { const target = new URL(pdfReaderUrl(readerUrl, pdfUrl)); target.searchParams.set('session', 'site'); return target.href; };
  /** fromTab: read the bytes from the PDF already shown in that tab; otherwise the reader downloads or reads the file itself. */
  async function openReader(tabId: number, pdfUrl: string, fromTab = true) {
    const local = localPdfUrl(pdfUrl);
    const target = new URL(local ? readerUrl : pdfReaderUrl(readerUrl, pdfUrl));
    if (local) target.searchParams.set('import', local);
    else if (fromTab) target.searchParams.set('browserTab', String(tabId));
    else target.searchParams.set('session', 'site');
    const source = await browser.tabs.get(tabId);
    return await browser.tabs.create({ url: target.href, windowId: source.windowId, openerTabId: tabId });
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
    // HTML readers load their PDFs as resources instead of top-level navigations.
    if (details.type !== 'main_frame') {
      const mime = details.responseHeaders?.find(h => h.name.toLowerCase() === 'content-type')?.value?.split(';')[0]?.trim().toLowerCase();
      if (details.tabId >= 0 && details.statusCode >= 200 && details.statusCode < 300 && mime === 'application/pdf') {
        void browser.tabs.sendMessage(details.tabId, { type: 'PDF_RESOURCE_RESPONSE', url: details.url }, { frameId: 0 }).catch(() => {});
      }
      return;
    }
    enqueue(details.tabId, async () => {
      const direct = isPdfResponse(details);
      const pageUrl = pdfSourceUrl(details.url);
      const value: PdfTab = { pageUrl, pdfUrl: direct ? pageUrl : undefined,
        direct, completed: false, requestId: details.requestId };
      const disposition = details.responseHeaders?.find(header => header.name.toLowerCase() === 'content-disposition');
      if (/^attachment(?:;|$)/i.test(disposition?.value?.trim() ?? '')) await browser.storage.session.remove(navigationKey(details.tabId));
      await browser.storage.session.set({ [tabKey(details.tabId)]: value });
    });
  }, { urls: filter.urls, types: ['main_frame', 'xmlhttprequest', 'sub_frame', 'object'] }, ['responseHeaders']);
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
    if (change.url && !/^https?:/.test(change.url) && !change.url.startsWith('about:blank#paperpane-')) enqueue(tabId, () => browser.storage.session.remove(navigationKey(tabId)));
    if (change.status === 'complete') enqueue(tabId, () => handleReady(tabId));
    // Local files have no web requests to observe; offer the button once the PDF has loaded.
    if (change.status === 'complete') void (async () => {
      // The PDF viewer may still be starting when the tab reports complete: try a few times.
      for (const delay of [0, 400, 1200, 2500]) {
        if (delay) await new Promise(resolve => setTimeout(resolve, delay));
        const tab = await browser.tabs.get(tabId).catch(() => undefined), local = localPdfUrl(tab?.url ?? '');
        if (!local || tab?.status !== 'complete' || !await allowedFileAccess()) return;
        if (await preparePdfPage(tabId, local)) return;
      }
    })();
  });
  browser.tabs.onRemoved.addListener(tabId => {
    enqueue(tabId, async () => { await browser.storage.session.remove([tabKey(tabId), navigationKey(tabId)]); });
  });
  async function currentPdf(tabId: number, inspectExisting = false, resourceUrl?: string) {
    const tab = await browser.tabs.get(tabId), raw = tab.url ?? '';
    if (raw.startsWith(extensionUrl)) return { tabId, title: tab.title ?? '纸间', block: /^\/(reader|reader-proof)\.html$/.test(new URL(raw).pathname)?'in-reader':'in-paperpane' };
    if (raw.startsWith('file:')) {
      const local = localPdfUrl(raw);
      const display = decodeURIComponent(new URL(raw).pathname);
      if (!local) return { tabId, title: tab.title ?? '本地文件', displayUrl: display, block: 'not-pdf' };
      if (!await allowedFileAccess()) return { tabId, title: tab.title ?? '本地文件', displayUrl: display, block: 'file-access' };
      // The address alone could be a missing file; only a loaded PDF document counts.
      const ready = tab.status === 'complete' && !tab.pendingUrl && await preparePdfPage(tabId, local);
      return { tabId, title: tab.title ?? '本地文件', displayUrl: display, pdfUrl: ready ? local : undefined, block: ready ? undefined : 'not-pdf' };
    }
    try { pdfSourceUrl(raw); } catch { return { tabId, title: tab.title ?? '', block: 'restricted' }; }
    const known = (await browser.storage.session.get(tabKey(tabId)))[tabKey(tabId)] as PdfTab | undefined;
    let pdfUrl = completedPdfUrl(tab, known);
    // Scholar's embedded reader can keep the tab 'loading' after the main PDF
    // response completed. A manual action can attest the current top document
    // without waiting for another extension's iframe or changing navigation.
    if (!pdfUrl && inspectExisting && !tab.pendingUrl && known?.direct && known.completed && pdfSourceUrl(raw) === known.pageUrl) {
      if (await preparePdfPage(tabId, known.pageUrl)) pdfUrl = known.pdfUrl;
    }
    // The extension may have been enabled after this PDF was opened. Only a manual
    // action can use this fallback, and only the current top-level PDF may attest it.
    if (inspectExisting && !known && tab.status === 'complete' && !tab.pendingUrl) {
      const expected = pdfSourceUrl(raw);
      if (await preparePdfPage(tabId, expected)) pdfUrl = expected;
    }
    // A paper's landing page: the page script knows which PDF belongs to it.
    let candidateUrl: string | undefined, sourcePageUrl: string | undefined;
    if (!pdfUrl && inspectExisting && !tab.pendingUrl) {
      const page = await pagePdfCandidate(tabId);
      candidateUrl = page.url;
      const resource = resourceUrl ?? page.url;
      if (resource && page.pageUrl === pdfSourceUrl(raw) && page.resources?.includes(resource)) {
        pdfUrl = pdfSourceUrl(resource); sourcePageUrl = page.pageUrl;
      }
    }
    return { tabId, title: tab.title ?? new URL(raw).hostname, displayUrl: new URL(raw).host + new URL(raw).pathname, pdfUrl, candidateUrl, sourcePageUrl, block: pdfUrl || candidateUrl ? undefined : 'not-pdf' };
  }

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const supported = ['OPEN_VIEWER_PDF', 'VIEWER_PDF_READY', 'BEGIN_PDF_NAVIGATION', 'OPEN_CURRENT_PDF', 'OPEN_ARXIV_PAPER', 'OPEN_PDF', 'REPORT_PAGE_PDF', 'GET_PDF_STATE', 'OPEN_TAB_PDF', 'OPEN_ORIGINAL_PDF', 'SET_BROWSER_ENTRY'];
    if (!supported.includes(message?.type)) return;
    void (async () => {
      try {
        if (sender.id !== browser.runtime.id || !sender.url) throw new Error('无效的纸间入口。');
        const fromExtension = sender.url.startsWith(extensionUrl);
        if (message.type === 'OPEN_VIEWER_PDF' || message.type === 'VIEWER_PDF_READY') {
          if (sender.frameId !== 0 || sender.tab?.id === undefined || fromExtension) throw new Error('请从论文网页打开 PDF。');
          const tabId = sender.tab.id;
          await tails.get(tabId);
          const state = await currentPdf(tabId, true, message.type === 'OPEN_VIEWER_PDF' ? pdfSourceUrl(message.pdfUrl) : undefined);
          if (!('sourcePageUrl' in state) || !state.sourcePageUrl || !state.pdfUrl || state.sourcePageUrl !== pdfSourceUrl(sender.url)) {
            if (message.type === 'VIEWER_PDF_READY') { sendResponse({ ok: true }); return; }
            throw new Error('网页中的 PDF 已改变，请刷新原页面后重试。');
          }
          if (message.type === 'VIEWER_PDF_READY') {
            const key = navigationKey(tabId);
            const pending = (await browser.storage.session.get(key))[key] as PdfNavigation | undefined;
            if (!pending || pending.url !== state.sourcePageUrl) { sendResponse({ ok: true }); return; }
            await browser.storage.session.remove(key);
          }
          const reader = await openReader(tabId, state.pdfUrl);
          if (message.type === 'OPEN_VIEWER_PDF' && reader.id !== undefined) await waitForReaderImport(reader.id);
        } else if (message.type === 'BEGIN_PDF_NAVIGATION') {
          if (sender.frameId !== 0 || sender.tab?.id === undefined || fromExtension) throw new Error('请从论文网页打开 PDF。');
          const url = pdfSourceUrl(message.pdfUrl);
          const tabId = sender.tab.id;
          await tails.get(tabId);
          const tab = await browser.tabs.get(tabId);
          if (tab.pendingUrl || pdfSourceUrl(tab.url ?? '') !== pdfSourceUrl(sender.url)) throw new Error('论文页面已改变，请重试。');
          if (typeof message.marker !== 'string' || !/^about:blank#paperpane-(?:\d+-){3}\d+$/.test(message.marker)) throw new Error('打开请求已失效，请重试。');
          const destinationId = await waitForPdfTab(tab.windowId, tabId, message.marker);
          // arXiv shows its PDFs in the browser; probing it would only add a request.
          if (new URL(url).hostname !== 'arxiv.org' && await downloadOnlyPdf(url)) {
            // The new tab goes straight to the reader, which downloads the file itself.
            await browser.tabs.update(destinationId, { url: siteReaderUrl(url) });
            sendResponse({ ok: true, direct: true });
            return;
          }
          await browser.storage.session.set({ [navigationKey(destinationId)]: { url } });
        } else if (message.type === 'OPEN_CURRENT_PDF') {
          if (sender.tab?.id === undefined || sender.frameId !== 0) throw new Error('请从已打开的 PDF 页面导入。');
          await tails.get(sender.tab.id);
          const state = await currentPdf(sender.tab.id, true);
          const senderUrl = localPdfUrl(sender.url) ?? pdfSourceUrl(sender.url);
          if (!('pdfUrl' in state) || !state.pdfUrl || senderUrl !== state.pdfUrl) throw new Error('PDF 页面尚未完成加载，请稍后重试。');
          await openReader(state.tabId, state.pdfUrl);
        } else if (['OPEN_ARXIV_PAPER', 'OPEN_PDF', 'REPORT_PAGE_PDF'].includes(message.type)) {
          throw new Error('请先在浏览器中打开 PDF，再通过纸间扩展弹窗导入。');
        } else {
          if (!fromExtension) throw new Error('请从纸间界面进行此操作。');
          if (message.type === 'GET_PDF_STATE' || message.type === 'OPEN_TAB_PDF') {
            if (!Number.isInteger(message.tabId)) throw new Error('当前标签页已不可用。');
            await tails.get(message.tabId);
            const state = await currentPdf(message.tabId, true, typeof message.pdfUrl === 'string' ? pdfSourceUrl(message.pdfUrl) : undefined);
            if (message.type === 'GET_PDF_STATE') { sendResponse({ ok: true, value: state }); return; }
            if ('pdfUrl' in state && state.pdfUrl) await openReader(state.tabId, state.pdfUrl);
            else if ('candidateUrl' in state && state.candidateUrl) await openReader(state.tabId, state.candidateUrl, false);
            else throw new Error('当前页面没有可打开的 PDF。');
          } else if (message.type === 'OPEN_ORIGINAL_PDF') {
            if (!sender.tab?.id) throw new Error('当前阅读器标签页已关闭。');
            const url = localPdfUrl(message.pdfUrl) ?? pdfSourceUrl(message.pdfUrl);
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
