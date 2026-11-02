import { ImportFault } from './errors';

// Extension pages share localStorage, so a new tab cannot immediately bypass a
// server's Retry-After. Only origins and expiration timestamps are stored.
const deadlines = new Map<string, number>();
const key = (url: URL) => `paperpane:pdf-download-cooldown:${url.origin}`;
export function downloadBlockedUntil(url: URL, now = Date.now()): number {
  let stored = 0;
  try { stored = Number(globalThis.localStorage?.getItem(key(url))) || 0; } catch { /* Memory fallback. */ }
  const until = Math.max(deadlines.get(url.origin) ?? 0, Number.isSafeInteger(stored) ? stored : 0);
  if (until > now) return until;
  deadlines.delete(url.origin);
  try { globalThis.localStorage?.removeItem(key(url)); } catch { /* Memory fallback. */ }
  return 0;
}
export function deferDownload(url: URL, retryAfter: string | null, now = Date.now()): number {
  const value = retryAfter?.trim() ?? '';
  const parsed = /^\d+$/.test(value) ? now + Number(value) * 1000 : Date.parse(value);
  const requested = Number.isSafeInteger(parsed) ? Math.max(now + 1000, parsed) : now + 10000;
  const until = Math.max(downloadBlockedUntil(url, now), requested);
  deadlines.set(url.origin, until);
  try { globalThis.localStorage?.setItem(key(url), String(until)); } catch { /* Memory fallback. */ }
  return until;
}
export function rateLimitedDownload(until: number, now = Date.now()): ImportFault {
  const seconds = Math.max(1, Math.ceil((until - now) / 1000));
  return new ImportFault({ code: 'RATE_LIMITED', message: `站点暂时限制下载或服务不可用，请约 ${seconds} 秒后重试，或先下载 PDF 到本机再导入`, recovery: ['retry', 'choose-file'] });
}
