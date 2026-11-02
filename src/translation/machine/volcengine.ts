import { hex, hmac, sha256 } from './sign';
import { failure, json, request, type Adapter } from './transport';
export const volcengine: Adapter = async (api, secret, { texts, from, to, signal }) => {
  const host = 'translate.volcengineapi.com',
    query = 'Action=TranslateText&Version=2020-06-01';
  const time = new Date().toISOString().replace(/[:-]|\.\d{3}/g, ''),
    date = time.slice(0, 8);
  const scope = date + '/cn-north-1/translate/request',
    signed = 'content-type;host;x-content-sha256;x-date';
  const body = { TargetLanguage: to, SourceLanguage: from, TextList: texts };
  const hash = await sha256(JSON.stringify(body));
  const headers = [
    'content-type:application/json',
    'host:' + host,
    'x-content-sha256:' + hash,
    'x-date:' + time,
    '',
  ].join('\n');
  const canonical = ['POST', '/', query, headers, signed, hash].join('\n');
  const stringToSign = ['HMAC-SHA256', time, scope, await sha256(canonical)].join('\n');
  const regionKey = await hmac(await hmac(secret.secretAccessKey!, date), 'cn-north-1');
  const signing = await hmac(await hmac(regionKey, 'translate'), 'request');
  const signature = hex(await hmac(signing, stringToSign));
  const data = await request<{
    ResponseMetadata?: { Error?: { Code: string } };
    TranslationList?: { Translation: string }[];
  }>(
    api,
    'https://' + host + '/?' + query,
    json(body, {
      'X-Content-Sha256': hash,
      'X-Date': time,
      Authorization:
        'HMAC-SHA256 Credential=' +
        secret.accessKeyId +
        '/' +
        scope +
        ', SignedHeaders=' +
        signed +
        ', Signature=' +
        signature,
    }),
    signal,
  );
  if (data.ResponseMetadata?.Error) throw failure(api, String(data.ResponseMetadata.Error.Code));
  return Array.isArray(data.TranslationList) ? data.TranslationList.map((row) => row?.Translation ?? '') : [];
};
