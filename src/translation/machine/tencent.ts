import { hex, hmac, sha256 } from './sign';
import { failure, json, request, type Adapter } from './transport';
export const tencent: Adapter = async (api, secret, { texts, from, to, signal }) => {
  const host = 'tmt.tencentcloudapi.com',
    now = new Date(),
    date = now.toISOString().slice(0, 10);
  const timestamp = String(Math.floor(now.getTime() / 1000)),
    scope = date + '/tmt/tc3_request';
  const body = { SourceTextList: texts, Source: from ?? 'auto', Target: to, ProjectId: 0 };
  const signed = 'content-type;host';
  const canonical = [
    'POST',
    '/',
    '',
    'content-type:application/json\nhost:' + host + '\n',
    signed,
    await sha256(JSON.stringify(body)),
  ].join('\n');
  const stringToSign = ['TC3-HMAC-SHA256', timestamp, scope, await sha256(canonical)].join('\n');
  const dateKey = await hmac('TC3' + secret.secretKey, date);
  const signing = await hmac(await hmac(dateKey, 'tmt'), 'tc3_request');
  const signature = hex(await hmac(signing, stringToSign));
  const data = await request<{ Response: { Error?: { Code: string }; TargetTextList?: string[] } }>(
    api,
    'https://' + host,
    json(body, {
      Authorization:
        'TC3-HMAC-SHA256 Credential=' +
        secret.secretId +
        '/' +
        scope +
        ', SignedHeaders=' +
        signed +
        ', Signature=' +
        signature,
      'X-TC-Action': 'TextTranslateBatch',
      'X-TC-Version': '2018-03-21',
      'X-TC-Timestamp': timestamp,
      'X-TC-Region': api.options.region || 'ap-guangzhou',
    }),
    signal,
  );
  if (data.Response?.Error) throw failure(api, data.Response.Error.Code);
  return data.Response?.TargetTextList ?? [];
};
