import { json, request, type Adapter } from './transport';
export const microsoft: Adapter = async (api, secret, { texts, from, to, signal }) => {
  const query = new URLSearchParams({ 'api-version': '3.0', to });
  if (from) query.set('from', from);
  const headers: Record<string, string> = { 'Ocp-Apim-Subscription-Key': secret.apiKey! };
  if (api.options.region && api.options.region !== 'global')
    headers['Ocp-Apim-Subscription-Region'] = api.options.region;
  const rows = await request<{ translations: { text: string }[] }[]>(
    api,
    'https://api.cognitive.microsofttranslator.com/translate?' + query,
    json(
      texts.map((Text) => ({ Text })),
      headers,
    ),
    signal,
  );
  return Array.isArray(rows) ? rows.map((row) => row?.translations?.[0]?.text ?? '') : [];
};
