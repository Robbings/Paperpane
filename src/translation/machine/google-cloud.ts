import { json, request, type Adapter } from './transport';
export const googleCloud: Adapter = async (api, secret, { texts, from, to, signal }) => {
  const data = await request<{ data?: { translations: { translatedText: string }[] } }>(
    api,
    'https://translation.googleapis.com/language/translate/v2',
    json({ q: texts, target: to, source: from, format: 'text' }, { 'X-Goog-Api-Key': secret.apiKey! }),
    signal,
  );
  return Array.isArray(data.data?.translations)
    ? data.data.translations.map((row) => row?.translatedText ?? '')
    : [];
};
