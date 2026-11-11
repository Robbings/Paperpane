import { form, incomplete, request, type Adapter } from './transport';
export const googleFree: Adapter = async (api, _secret, { texts, from, to, signal }) => {
  const params = new URLSearchParams({
    client: 'gtx',
    dt: 't',
    sl: from ?? 'auto',
    tl: to,
    q: texts.join('\n'),
  });
  const result = await request<unknown[]>(
    api,
    'https://translate.googleapis.com/translate_a/single',
    form(params),
    signal,
  );
  if (!Array.isArray(result[0])) throw incomplete();
  const text = result[0]
    .map((row) => {
      if (!Array.isArray(row) || typeof row[0] !== 'string') throw incomplete();
      return row[0];
    })
    .join('');
  return texts.length === 1 ? [text] : text.trimEnd().split(/\r?\n/);
};
