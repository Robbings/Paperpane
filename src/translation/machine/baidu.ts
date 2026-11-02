import { md5 } from '@/zotero/md5';
import { bytes } from './sign';
import { failure, form, request, type Adapter } from './transport';
export const baidu: Adapter = async (api, secret, { texts, from, to, signal }) => {
  const q = texts.join('\n'),
    salt = crypto.randomUUID(),
    appid = secret.appId!;
  const data = await request<{ error_code?: string; trans_result?: { dst: string }[] }>(
    api,
    'https://fanyi-api.baidu.com/api/trans/vip/translate',
    form(
      new URLSearchParams({
        q,
        from: from ?? 'auto',
        to,
        appid,
        salt,
        sign: md5(bytes(appid + q + salt + secret.secretKey)),
      }),
    ),
    signal,
  );
  if (data.error_code) throw failure(api, data.error_code);
  const lines = Array.isArray(data.trans_result) ? data.trans_result.map((row) => row?.dst ?? '') : [];
  return texts.length === 1 ? [lines.join('\n')] : lines;
};
