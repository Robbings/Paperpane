/** Retry only a missing OpenAI route, before any response content reaches a caller. */
export async function fetchModelEndpoint(
  url: string | URL, init: RequestInit, protocol: string, baseUrl: string,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  const response = await fetcher(url, init);
  if (!['openai-chat', 'openai-responses'].includes(protocol) || ![404, 405].includes(response.status)) return response;
  const base = new URL(baseUrl);
  // Versioned paths are explicit choices. Never add another version segment.
  if (base.pathname.split('/').some(part => /^v\d+(?:[a-z]+\d*)?$/i.test(part))) return response;
  const original = new URL(url);
  const prefix = base.pathname.replace(/\/+$/, '');
  if (original.origin !== base.origin || !original.pathname.startsWith(prefix + '/')) return response;
  if (response.headers.get('content-type')?.includes('json')) {
    try {
      const error = (await response.clone().json())?.error;
      // A missing model/deployment is not a missing route.
      if (/model|deployment/i.test(typeof error === 'string' ? error : JSON.stringify(error ?? ''))) return response;
    } catch { return response; }
  }
  init.signal?.throwIfAborted();
  const fallback = new URL(original);
  fallback.pathname = prefix + '/v1' + original.pathname.slice(prefix.length);
  await response.body?.cancel().catch(() => {});
  return fetcher(fallback, init);
}
