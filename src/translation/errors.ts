import type { TranslationDiagnostics } from '@/contracts/translation';
export type Recovery = 'service' | 'content' | 'none';
/** Error classification belongs to the transport, not to a catch-all retry loop. */
export class TranslationError extends Error {
  constructor(message: string, readonly retryable = false, readonly fatal = false,
    readonly retryAfterMs = 0, readonly recovery: Recovery = retryable ? 'service' : 'none',
    readonly diagnostics?: TranslationDiagnostics) { super(message); }
}
export function retryPolicy(error: unknown): TranslationError {
  if (error instanceof TranslationError) return error;
  // Transport catches network TypeErrors. A TypeError elsewhere is a programming failure.
  return new TranslationError(error instanceof Error ? error.message : '翻译请求失败。', false, true);
}
export function safeDetail(value: unknown, secrets: string[] = []): string | undefined {
  if (typeof value !== 'string') return undefined;
  let text = value;
  for (const secret of secrets) if (secret) text = text.split(secret).join('[已隐藏]');
  return text.replace(/Bearer\s+[^\s"<>]+/gi, 'Bearer [已隐藏]')
    .replace(/\bsk-[A-Za-z0-9_-]+/g, '[已隐藏]')
    .replace(/https?:\/\/[^\s"<>]+/g, '[地址]')
    .replace(/[\u0000-\u001f]+/g, ' ').slice(0, 600);
}
