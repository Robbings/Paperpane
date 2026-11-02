import { TranslationError, safeDetail } from '../errors';
import type { MachineTranslator } from '../machine-providers';
import type { TranslationApiView } from '@/ui/settings/types';

export type Api = Pick<TranslationApiView, 'id' | 'name' | 'kind' | 'options'>;
export type Credentials = Record<string, string>;
export type Input = Parameters<MachineTranslator['translate']>[0];
export type Adapter = (api: Api, secret: Credentials, input: Input) => Promise<string[]>;
export const incomplete = () =>
  new TranslationError('翻译服务返回的结果不完整，将只重试未完成的句子。', true, false, 0, 'content');

export function failure(api: Api, code: string, status = 200, retryAfterMs = 0): TranslationError {
  const name = api.name || api.kind;
  const diagnostics = { status, code: /^[\w.-]{1,80}$/.test(code) ? safeDetail(code) : undefined };
  if (
    status === 456 ||
    (api.kind === 'youdao' && code === '401') ||
    code === '54004' ||
    /NoFreeAmount|Balance|Arrears|DailyLimit|dailyLimitExceeded|quotaExceeded/i.test(code)
  )
    return new TranslationError(name + ' 的额度已用完。', false, true, 0, 'none', diagnostics);
  if (
    status === 429 ||
    (api.kind === 'google-free' && status === 403) ||
    /^(54003|54005|411|412|-429)$|RequestLimit|Throttl|RateLimit|rateLimitExceeded|userRateLimitExceeded/i.test(
      code,
    )
  )
    return new TranslationError(name + ' 请求太频繁，稍后自动重试。', true, false, retryAfterMs, 'service', {
      ...diagnostics,
      category: 'rate-limit',
    });
  if (
    /^(58001|102|10005|-415|UnsupportedLanguage|400035|400036)$|Lang(uage)?(Pair)?NotSupport|Unsupported.*Lang/i.test(
      code,
    )
  )
    return new TranslationError(name + ' 不支持这个翻译语向。', false, true, 0, 'none', diagnostics);
  if (
    status === 401 ||
    status === 403 ||
    /^(52003|54001|58000|90107|10009|108|110|111|202|203|205|206)$|AuthFailure|Signature|AccessKey|Unauthorized|Forbidden|keyInvalid|API_KEY_INVALID/i.test(
      code,
    )
  )
    return new TranslationError(
      name + ' 的密钥无效或没有权限，请在设置中检查。',
      false,
      true,
      0,
      'none',
      diagnostics,
    );
  if (
    status >= 500 ||
    status === 408 ||
    /^(52001|52002|10001|10002|10012|302|303|41101|-500)$|InternalError|ServiceUnavailable/i.test(code)
  )
    return new TranslationError(
      name + ' 暂时不可用，稍后自动重试。',
      true,
      false,
      retryAfterMs,
      'service',
      diagnostics,
    );
  if (status === 413 || (api.kind === 'alibaba' && ['10006', '10007', '10008'].includes(code)) || code === '103') return incomplete();
  return new TranslationError(
    name + ' 拒绝了翻译请求（' + (diagnostics.code || status) + '）。',
    false,
    true,
    0,
    'none',
    diagnostics,
  );
}

export async function request<T>(api: Api, url: string, init: RequestInit, signal: AbortSignal): Promise<T> {
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(45000)]);
  let response: Response, body: string;
  try {
    deadline.throwIfAborted();
    response = await fetch(url, {
      ...init,
      signal: deadline,
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    });
    body = await response.text();
  } catch {
    signal.throwIfAborted();
    throw new TranslationError(api.name + ' 暂时无法连接，稍后自动重试。', true, false);
  }
  let data;
  try {
    data = JSON.parse(body);
  } catch {
    /* HTTP errors can be HTML */
  }
  if (!response.ok) {
    const retry = response.headers.get('Retry-After');
    const delay = retry
      ? /^\d+$/.test(retry)
        ? Number(retry) * 1000
        : Math.max(0, Date.parse(retry) - Date.now())
      : 0;
    const code =
      data?.error?.details?.find?.((detail: { reason?: string }) => detail?.reason)?.reason ??
      data?.error?.errors?.[0]?.reason ??
      data?.error?.code ??
      data?.ResponseMetadata?.Error?.Code ??
      data?.Code ??
      '';
    throw failure(api, String(code), response.status, Number.isFinite(delay) ? delay : 0);
  }
  if (!data && api.kind === 'google-free' && /captcha|unusual traffic|recaptcha/i.test(body))
    throw failure(api, '', 429);
  if (!data) throw incomplete();
  return data;
}

export function json(body: unknown, headers: Record<string, string> = {}): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  };
}
export const form = (body: URLSearchParams): RequestInit => ({ method: 'POST', body });
