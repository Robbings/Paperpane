import { ImportFault, abortIfNeeded } from './errors';
/** A bounded first import implementation: avoids multiple unbounded in-memory copies. */
export const MAX_PDF_BYTES = 256 * 1024 * 1024;
export function parseSourceUrl(raw: string): URL {
  let url: URL;
  try { url = new URL(raw.trim()); } catch { throw new ImportFault({ code: 'INVALID_INPUT', message: '请输入完整的 PDF 链接', recovery: [] }); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new ImportFault({ code: 'INVALID_INPUT', message: '仅支持不包含用户名或口令的 HTTP(S) 链接', recovery: [] });
  url.hash = ''; return url;
}
export function safeFilename(raw: string): string {
  const name = raw.replace(/[\u0000-\u001f\u007f/\\:*?"<>|]/g, '_').trim().slice(0, 160);
  return /\.pdf$/i.test(name) ? name : `${name || '论文'}.pdf`;
}
function filenameFromUrl(url: string): string {
  try { return safeFilename(decodeURIComponent(new URL(url).pathname.split('/').at(-1) || '论文.pdf')); }
  catch { return '论文.pdf'; }
}
export interface TransferProgress { completed: number; total?: number; unit: 'bytes' }
export async function readPdfBytes(blob: Blob, signal: AbortSignal, progress: (value: TransferProgress) => void): Promise<Uint8Array> {
  if (!blob.size || blob.size > MAX_PDF_BYTES) throw new ImportFault({ code: 'UNSUPPORTED_FILE', message: '请选择非空且不超过 256 MiB 的 PDF', recovery: ['choose-file'] });
  return readStream(blob.stream(), blob.size, signal, progress);
}
async function readStream(stream: ReadableStream<Uint8Array>, total: number | undefined, signal: AbortSignal, progress: (value: TransferProgress) => void): Promise<Uint8Array> {
  abortIfNeeded(signal);
  const reader = stream.getReader(); const chunks: Uint8Array[] = []; let completed = 0;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    progress({ completed, total, unit: 'bytes' });
    while (true) {
      const result = await reader.read(); abortIfNeeded(signal);
      if (result.done) break;
      completed += result.value.byteLength;
      if (completed > MAX_PDF_BYTES) throw new ImportFault({ code: 'UNSUPPORTED_FILE', message: '文件超过本轮支持的 256 MiB 上限', recovery: ['choose-file'] });
      chunks.push(result.value);
      progress({ completed, total: total !== undefined && completed <= total ? total : undefined, unit: 'bytes' });
    }
    if (!completed) throw new ImportFault({ code: 'UNSUPPORTED_FILE', message: '下载或选择的文件为空', recovery: ['choose-file', 'retry'] });
    const data = new Uint8Array(completed); let offset = 0;
    for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
    return data;
  } finally { signal.removeEventListener('abort', cancel); await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
export async function downloadPdf(url: URL, signal: AbortSignal, progress: (value: TransferProgress) => void): Promise<{ bytes: Uint8Array; filename: string; sourceUrl: string }> {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), 120_000);
  const combined = AbortSignal.any([signal, timeout.signal]);
  try {
    // No cookies/auth forwarding. Login pages are rejected instead of being stored as PDFs.
    const response = await fetch(url.href, { signal: combined, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', redirect: 'follow' });
    if (!response.ok) {
      void response.body?.cancel().catch(() => {});
      throw new ImportFault({ code: response.status === 401 || response.status === 403 ? 'ACCESS_DENIED' : 'NETWORK', message: `下载失败（HTTP ${response.status}）。需要登录的文件请先下载到本机再导入`, recovery: ['retry', 'choose-file'] });
    }
    const type = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
    if (type === 'text/html' || type === 'application/xhtml+xml' || type === 'application/json') {
      void response.body?.cancel().catch(() => {});
      throw new ImportFault({ code: 'UNSUPPORTED_FILE', message: '链接返回的是网页或登录页面，请提供直接 PDF 链接，或先下载再导入', recovery: ['choose-file'] });
    }
    const finalUrl = parseSourceUrl(response.url || url.href);
    const length = Number(response.headers.get('content-length'));
    const total = !response.headers.get('content-encoding') && Number.isSafeInteger(length) && length > 0 ? length : undefined;
    if (total !== undefined && total > MAX_PDF_BYTES) { void response.body?.cancel().catch(() => {}); throw new ImportFault({ code: 'UNSUPPORTED_FILE', message: '文件超过 256 MiB 上限', recovery: ['choose-file'] }); }
    if (!response.body) throw new ImportFault({ code: 'NETWORK', message: '没有收到文件内容', recovery: ['retry'] });
    return { bytes: await readStream(response.body, total, combined, progress), filename: filenameFromUrl(finalUrl.href), sourceUrl: url.href };
  } catch (error) {
    abortIfNeeded(signal);
    if (error instanceof ImportFault) throw error;
    throw new ImportFault({ code: 'NETWORK', message: timeout.signal.aborted ? '下载超时，请重试或先下载到本机' : '无法下载。请检查网络和站点权限；重定向到其他站点或需要登录的链接可先下载到本机', recovery: ['retry', 'choose-file'] });
  } finally { clearTimeout(timer); }
}
