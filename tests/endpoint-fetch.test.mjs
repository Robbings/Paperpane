import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchModelEndpoint } from '../src/ai/endpoint-fetch.ts';

for (const route of ['/chat/completions', '/responses', '/models']) test(`missing route ${route} retries once at the same origin`, async () => {
  const calls = [], signal = new AbortController().signal, init = { method: 'POST', body: '{}', headers: { Authorization: 'Bearer fixture' }, redirect: 'error', signal };
  const fetcher = async (url, options) => { calls.push([String(url), options]); return new Response('', { status: calls.length === 1 ? 404 : 200 }); };
  assert.equal((await fetchModelEndpoint('https://fixture.test/api' + route, init, 'openai-chat', 'https://fixture.test/api/', fetcher)).status, 200);
  assert.deepEqual(calls.map(c => c[0]), ['https://fixture.test/api' + route, 'https://fixture.test/api/v1' + route]);
  assert(calls.every(c => c[1] === init));
});
test('success, auth, rate limits, outages, explicit versions and other protocols never change paths', async () => {
  for (const [status, protocol, base, body] of [
    [200, 'openai-chat', '', ''], [401, 'openai-chat', '', ''], [403, 'openai-chat', '', ''], [429, 'openai-chat', '', ''], [500, 'openai-chat', '', ''],
    [404, 'anthropic', '', ''], [404, 'gemini', '', ''], [404, 'openai-chat', '/v1', ''], [404, 'openai-chat', '/api/v4', ''], [404, 'openai-chat', '/v1beta', ''],
    [404, 'openai-chat', '', JSON.stringify({ error: { code: 'model_not_found' } })],
  ]) {
    let calls = 0;
    await fetchModelEndpoint('https://fixture.test' + base + '/responses', {}, protocol, 'https://fixture.test' + base, async () => { calls++; return new Response(body, { status, headers: body ? { 'content-type': 'application/json' } : {} }); });
    assert.equal(calls, 1, `${status} ${protocol} ${base} ${body}`);
  }
});
test('network errors and aborts never dispatch a fallback; fallback failures do not loop', async () => {
  let calls = 0;
  await assert.rejects(fetchModelEndpoint('https://fixture.test/responses', {}, 'openai-responses', 'https://fixture.test', async () => { calls++; throw new TypeError('network'); }));
  assert.equal(calls, 1);
  const abort = new AbortController(); calls = 0;
  await assert.rejects(fetchModelEndpoint('https://fixture.test/responses', { signal: abort.signal }, 'openai-responses', 'https://fixture.test', async () => { calls++; abort.abort(); return new Response('', { status: 404 }); }));
  assert.equal(calls, 1); calls = 0;
  assert.equal((await fetchModelEndpoint('https://fixture.test/responses', {}, 'openai-responses', 'https://fixture.test', async () => { calls++; return new Response('', { status: 405 }); })).status, 405);
  assert.equal(calls, 2);
});
