import { hmac, percent } from './sign';
import { failure, form, request, type Adapter } from './transport';
// Regional public endpoints published for the 2018-10-12 RPC API.
const regionalHosts: Record<string, string> = {
  'cn-hangzhou': 'mt.cn-hangzhou.aliyuncs.com',
  'ap-southeast-1': 'mt.ap-southeast-1.aliyuncs.com',
  'me-central-1': 'mt.me-central-1.aliyuncs.com',
  'me-east-1': 'alimt.me-east-1.aliyuncs.com',
};
const globalRegions = new Set([
  'cn-shenzhen',
  'cn-qingdao',
  'cn-huhehaote',
  'cn-hongkong',
  'cn-chengdu',
  'ap-southeast-3',
  'ap-northeast-1',
  'cn-beijing',
  'cn-shanghai',
  'cn-zhangjiakou',
  'eu-central-1',
  'eu-west-1',
  'us-east-1',
  'us-west-1',
  'cn-beijing-finance-1',
  'cn-hangzhou-finance',
  'cn-north-2-gov-1',
  'cn-shanghai-finance-1',
  'cn-shenzhen-finance-1',
]);
export const alibaba: Adapter = async (api, secret, { texts, from, to, signal }) => {
  const region = api.options.region || 'cn-hangzhou';
  const host = Object.hasOwn(regionalHosts, region)
    ? regionalHosts[region]
    : globalRegions.has(region)
      ? 'mt.aliyuncs.com'
      : undefined;
  if (!host) throw new Error('阿里翻译地域无效。');
  const params = {
    Action: 'GetBatchTranslate',
    Version: '2018-10-12',
    Format: 'JSON',
    Timestamp: new Date().toISOString().replace(/\.\d{3}/, ''),
    SignatureMethod: 'HMAC-SHA1',
    SignatureVersion: '1.0',
    SignatureNonce: crypto.randomUUID(),
    AccessKeyId: secret.accessKeyId!,
    FormatType: 'text',
    SourceLanguage: from ?? 'auto',
    TargetLanguage: to,
    Scene: 'general',
    ApiType: 'translate_standard',
    SourceText: JSON.stringify(Object.fromEntries(texts.map((text, index) => [index, text]))),
  };
  const canonical = Object.entries(params)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => percent(k) + '=' + percent(v))
    .join('&');
  const signature = await hmac(secret.accessKeySecret + '&', 'POST&%2F&' + percent(canonical), 'SHA-1');
  const body = new URLSearchParams({
    ...params,
    Signature: btoa(String.fromCharCode(...new Uint8Array(signature))),
  });
  const data = await request<{
    Code: string | number;
    TranslatedList?: { index: string; code: string; translated: string }[];
  }>(api, 'https://' + host + '/', form(body), signal);
  if (String(data.Code) !== '200') throw failure(api, String(data.Code));
  const entries = Array.isArray(data.TranslatedList) ? data.TranslatedList.filter(Boolean) : [];
  if (entries.length && entries.every((row) => String(row.code) !== '200'))
    throw failure(api, String(entries[0]!.code));
  const rows = new Map(
    entries.filter((row) => String(row.code) === '200').map((row) => [String(row.index), row.translated]),
  );
  return texts.map((_, index) => rows.get(String(index)) ?? '');
};
