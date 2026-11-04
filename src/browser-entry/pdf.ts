export interface BrowserEntrySettings { autoOpenPdf: boolean; showPdfButtons: boolean }
export const browserEntryDefaults: BrowserEntrySettings = { autoOpenPdf: false, showPdfButtons: true };

export function pdfSourceUrl(raw: string): string {
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('仅支持不含账号口令的 HTTP(S) PDF 链接。');
  url.hash = '';
  return url.href;
}

/** A PDF opened from this device (file://…/x.pdf), without its fragment; undefined otherwise. */
export function localPdfUrl(raw: string): string | undefined {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'file:' || !/\.pdf$/i.test(url.pathname)) return;
    url.hash = '';
    return url.href;
  } catch { return; }
}

/** Response headers of a site that hands out a PDF as a download instead of showing it. */
export function isDownloadOnlyPdf(url: string, type: string, disposition: string): boolean {
  const mime = type.split(';')[0]?.trim().toLowerCase() ?? '';
  if (mime === 'text/html' || mime === 'application/xhtml+xml' || mime === 'application/json') return false;
  const attachment = /^attachment(?:;|$)/i.test(disposition.trim());
  const pdfName = /filename\*?=[^;]*\.pdf\b/i.test(disposition) || /\.pdf\/?$/i.test(new URL(url).pathname);
  const generic = ['', 'application/octet-stream', 'binary/octet-stream', 'application/x-download', 'application/force-download', 'application/download'].includes(mime);
  return (attachment && (mime === 'application/pdf' || pdfName)) || (generic && pdfName);
}

export function isPdfLink(raw: string, type = ''): boolean {
  try {
    const url = new URL(pdfSourceUrl(raw));
    return type.split(';')[0]?.trim().toLowerCase() === 'application/pdf'
      || /\.pdf\/?$/i.test(url.pathname)
      || (url.hostname === 'arxiv.org' && /^\/pdf\/.+/.test(url.pathname));
  } catch { return false; }
}

interface PdfResponse {
  url: string; type: string; statusCode: number;
  responseHeaders?: { name: string; value?: string }[];
}
export function isPdfResponse(details: PdfResponse): boolean {
  if (details.type !== 'main_frame' || details.statusCode < 200 || details.statusCode >= 300) return false;
  const header = (name: string) => details.responseHeaders?.find(h => h.name.toLowerCase() === name)?.value ?? '';
  return isPdfLink(details.url, header('content-type')) && header('content-type').split(';')[0]?.trim().toLowerCase() === 'application/pdf'
    && !/^attachment(?:;|$)/i.test(header('content-disposition').trim());
}

export function shouldAutoOpen(_settings: BrowserEntrySettings, _raw: string, _bypass?: string): boolean {
  // Retained for compatibility with older callers; navigation is always manual.
  return false;
}

export function pdfReaderUrl(reader: string, pdf: string): string {
  const url = new URL(reader);
  url.searchParams.set('import', pdfSourceUrl(pdf));
  url.searchParams.set('source', new URL(pdf).hostname);
  return url.href;
}

/** Header observation plus completed navigation; never infer readiness from a URL. */
export function completedPdfUrl(
  tab: { url?: string; pendingUrl?: string; status?: string },
  known?: { pageUrl: string; pdfUrl?: string; direct: boolean; completed?: boolean },
): string | undefined {
  if (tab.status !== 'complete' || tab.pendingUrl || !known?.direct || !known.completed || !known.pdfUrl) return;
  try { return pdfSourceUrl(tab.url ?? '') === known.pageUrl ? known.pdfUrl : undefined; }
  catch { return; }
}
