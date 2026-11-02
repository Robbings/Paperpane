import { json, request, type Adapter } from './transport';
export const deepl: Adapter = async (api, secret, { texts, from, to, signal }) => {
  const host = api.options.plan === 'pro' ? 'api.deepl.com' : 'api-free.deepl.com';
  const data = await request<{ translations?: { text: string }[] }>(
    api,
    'https://' + host + '/v2/translate',
    json(
      { text: texts, source_lang: from, target_lang: to },
      { Authorization: 'DeepL-Auth-Key ' + secret.apiKey },
    ),
    signal,
  );
  return Array.isArray(data.translations) ? data.translations.map((row) => row?.text ?? '') : [];
};
