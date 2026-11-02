import { browser } from 'wxt/browser';
import { ImportFault, abortIfNeeded } from './errors';
import { MAX_PDF_BYTES, safeFilename, type TransferProgress } from './download';

export interface BrowserPdfSource { tabId: number; documentId: string; url: string }

/** Close only the PDF document that supplied the bytes for this reader. */
export async function closeImportedPdf(source: BrowserPdfSource) {
  const reader = await browser.tabs.getCurrent();
  if (reader?.openerTabId !== source.tabId) return;
  const [frame] = await browser.scripting.executeScript({
    target: { tabId: source.tabId, documentIds: [source.documentId] },
    func: (url: string) => document.contentType === 'application/pdf' && location.href.split('#')[0] === url,
    args: [source.url],
  });
  if (!frame?.result) return;
  const tab = await browser.tabs.get(source.tabId);
  if (!tab.pendingUrl && tab.url?.split('#')[0] === source.url) await browser.tabs.remove(source.tabId);
}

/** Serialized into the original PDF tab. Bytes stay there until read in bounded chunks. */
async function tabPdfTransfer(url: string, token: string, operation: 'start' | 'read' | 'drop', offset: number) {
  type Entry = { controller: AbortController; bytes?: Uint8Array; timer: ReturnType<typeof setTimeout> };
  const scope = globalThis as typeof globalThis & { __paperpaneTransfers?: Map<string, Entry> };
  const entries = scope.__paperpaneTransfers ??= new Map();
  const drop = () => { const entry = entries.get(token); if (entry) { entry.controller.abort(); clearTimeout(entry.timer); entries.delete(token); } };
  if (operation === 'drop') { drop(); return { size: 0 }; }
  if (location.href.split('#')[0] !== url || document.contentType !== 'application/pdf') throw new Error('PDF 页面已改变，请重新打开论文后重试。');
  if (operation === 'read') {
    const bytes = entries.get(token)?.bytes;
    if (!bytes) throw new Error('PDF 传输已过期，请重试。');
    return { size: bytes.length, chunk: Array.from(bytes.subarray(offset, offset + 65536)) };
  }
  const controller = new AbortController();
  const entry: Entry = { controller, timer: setTimeout(drop, 120000) };
  entries.set(token, entry);
  try {
    // Same website context: preserve its verified session and prefer its HTTP cache.
    const response = await fetch(url, { credentials: 'include', cache: 'force-cache', signal: controller.signal });
    if (!response.ok) throw new Error(`原 PDF 页面读取失败（HTTP ${response.status}），请在原页面下载后导入。`);
    const type = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
    if (type === 'text/html' || type === 'application/xhtml+xml' || type === 'application/json') {
      await response.body?.cancel(); throw new Error('网站返回了验证页面，请完成验证后重试，或下载 PDF 后导入。');
    }
    if (!response.body) throw new Error('原页面没有返回 PDF 内容。');
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        const part = await reader.read(); if (part.done) break;
        size += part.value.length;
        if (size > 256 * 1024 * 1024) throw new Error('PDF 超过 256 MiB 上限。');
        chunks.push(part.value);
      }
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    if (!size) throw new Error('PDF 内容为空。');
    const bytes = new Uint8Array(size); let position = 0;
    for (const chunk of chunks) { bytes.set(chunk, position); position += chunk.length; }
    entry.bytes = bytes;
    return { size };
  } catch (error) { drop(); throw error; }
}

export async function readBrowserPdf(tabId: number, url: string, signal: AbortSignal, progress: (value: TransferProgress) => void) {
  abortIfNeeded(signal);
  const state = await browser.runtime.sendMessage({ type: 'GET_PDF_STATE', tabId });
  if (!state?.ok || state.value?.pdfUrl !== url) throw new ImportFault({ code: 'NETWORK', message: '原 PDF 标签页已关闭、改变或尚未加载完成，请返回原页面重试。', recovery: ['retry', 'choose-file'] });
  abortIfNeeded(signal);
  const token = crypto.randomUUID();
  let documentId: string | undefined;
  const execute = (operation: 'start' | 'read' | 'drop', offset = 0) => browser.scripting.executeScript({
    target: documentId ? { tabId, documentIds: [documentId] } : { tabId, frameIds: [0] },
    func: tabPdfTransfer, args: [url, token, operation, offset],
  });
  const cancel = () => { void execute('drop').catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    progress({ completed: 0, unit: 'bytes' });
    const [initial] = await execute('start');
    documentId = initial?.documentId;
    abortIfNeeded(signal);
    const size = initial?.result?.size;
    if (!Number.isSafeInteger(size) || !size || size > MAX_PDF_BYTES) throw new Error('无法从原页面获取 PDF，请下载文件后导入。');
    const bytes = new Uint8Array(size);
    for (let offset = 0; offset < size;) {
      abortIfNeeded(signal);
      const [part] = await execute('read', offset);
      const chunk = part?.result?.chunk;
      if (!chunk?.length || offset + chunk.length > size || !chunk.every((value): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 255)) throw new Error('PDF 传输不完整，请重试。');
      bytes.set(chunk as number[], offset); offset += chunk.length;
      progress({ completed: offset, total: size, unit: 'bytes' });
    }
    abortIfNeeded(signal);
    const browserSource = documentId ? { tabId, documentId, url } : undefined;
    return { bytes, filename: safeFilename(new URL(url).pathname.split('/').at(-1) || '论文'), sourceUrl: url, browserSource };
  } catch (error) {
    abortIfNeeded(signal);
    throw new ImportFault({ code: 'NETWORK', message: error instanceof Error && /PDF|原页面|验证|HTTP/.test(error.message) ? error.message : '无法读取原 PDF 页面，请在浏览器下载后导入。', recovery: ['retry', 'choose-file'] });
  } finally { signal.removeEventListener('abort', cancel); await execute('drop').catch(() => {}); }
}
