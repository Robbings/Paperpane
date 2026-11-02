import { sha256 } from './sign';
import { failure, form, request, type Adapter } from './transport';
export const youdao: Adapter = async (api, secret, { texts, from, to, signal }) => {
  const q = [...texts.join('')],
    salt = crypto.randomUUID(),
    curtime = String(Math.floor(Date.now() / 1000));
  const input = q.length <= 20 ? q.join('') : q.slice(0, 10).join('') + q.length + q.slice(-10).join('');
  const sign = await sha256(secret.appKey + input + salt + curtime + secret.appSecret);
  const params = new URLSearchParams({
    from: from ?? 'auto',
    to,
    appKey: secret.appKey!,
    sign,
    signType: 'v3',
    salt,
    curtime,
  });
  texts.forEach((text) => params.append('q', text));
  const data = await request<{
    errorCode: string;
    translateResults?: { query: string; translation: string }[];
  }>(api, 'https://openapi.youdao.com/v2/api', form(params), signal);
  if (String(data.errorCode) !== '0' && !data.translateResults?.length)
    throw failure(api, String(data.errorCode));
  const rows = Array.isArray(data.translateResults) ? data.translateResults.filter(Boolean) : [];
  const results = new Map(rows.map((row) => [row.query, row.translation]));
  return texts.map((text) => results.get(text) ?? '');
};
