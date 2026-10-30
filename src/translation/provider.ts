import { modelSlot, coolModel } from '@/ai/limit';
import type { TranslationDiagnostics } from '@/contracts/translation';
import { TranslationError, safeDetail } from './errors';
import { ModelSettingsStore, endpointUrl } from '@/data/model-settings';
import { hasImportOrigin } from '@/document/permissions';
export type Connection = Awaited<ReturnType<ModelSettingsStore['resolveConnection']>>;
interface ResponseBody { status?: string; output?: { type?: string; content?: { type?: string; text?: string }[] }[] }
interface RequestContext { sessionId: string; onDiagnostics?: (value: TranslationDiagnostics) => void }
const responseText = (body: ResponseBody) => body.output?.filter(item => item.type === 'message').flatMap(item => item.content ?? []).filter(content => content.type === 'output_text').map(content => content.text ?? '').join('') ?? '';
const object = (v: unknown): Record<string, unknown> => v && typeof v === 'object' ? v as Record<string, unknown> : {};
/** One transport attempt only. The task scheduler owns backoff and circuit breaking. */
export async function streamTranslationText(connection: Connection, messages: { role: 'system' | 'user'; content: string }[], signal: AbortSignal, onText: (text: string) => Promise<void>, context: RequestContext) {
  return modelSlot(connection, signal, () => streamTranslationAttempt(connection, messages, signal, onText, context));
}
async function streamTranslationAttempt(connection: Connection, messages: { role: 'system' | 'user'; content: string }[], signal: AbortSignal, onText: (text: string) => Promise<void>, context: RequestContext) {
  const responses = connection.endpoint.protocol === 'openai-responses';
  if (!responses && connection.endpoint.protocol !== 'openai-chat') throw new TranslationError('当前翻译暂不支持此接口协议。', false, true);
  const url = endpointUrl(connection.endpoint.baseUrl) + (responses ? '/responses' : '/chat/completions');
  if (!await hasImportOrigin(url)) throw new TranslationError('请在模型设置中保存并授予此接口的访问权限。', false, true);
  const timeout = AbortSignal.timeout(connection.view.runtime.timeoutSec * 1000);
  const combined = AbortSignal.any([signal, timeout]);
  let diagnostics: TranslationDiagnostics = {};
  const clean = (v: unknown) => safeDetail(v, [connection.key]);
  const report = (value: TranslationDiagnostics) => { diagnostics = { ...diagnostics, ...value }; context.onDiagnostics?.(diagnostics); };
  const transport = async <T>(action: () => Promise<T>): Promise<T> => {
    try { return await action(); }
    catch (e) {
      if (signal.aborted) throw signal.reason;
      const text = timeout.aborted ? '模型请求超时。' : '网络连接失败或响应中断；浏览器未提供 HTTP 状态。';
      report({ category: timeout.aborted ? 'timeout' : 'network', message: text });
      throw new TranslationError(text, true, false, 0, 'service', diagnostics);
    }
  };
  const failure = (value: unknown, fallback: string, status?: number, reason?: string): TranslationError => {
    const root = object(value), nested = object(root.error ?? object(root.response).error);
    const detail = Object.keys(nested).length ? nested : root;
    const code = clean(detail.code ?? reason), type = clean(detail.type), msg = clean(detail.message ?? (typeof root.error === 'string' ? root.error : undefined));
    const tag = `${code ?? ''} ${type ?? ''} ${msg ?? ''}`;
    const permanent = /insufficient_quota|spend_limit|usage_limit_exceeded|invalid_api_key|authentication|permission_denied|model_not_found|billing|余额不足|额度不足/i.test(tag);
    const length = status === 413 || /max_output_tokens|length_limit|context_length_exceeded|too_many_tokens/i.test(tag);
    const rateLimited = status === 429 || /rate[_ -]?limit|too_many_requests|限流|请求过于频繁/i.test(tag);
    const httpTemporary = status !== undefined && [408, 409, 429, 500, 502, 503, 504].includes(status);
    const invalid = /invalid_request_error|unsupported_parameter|invalid_parameter|invalid_argument/i.test(tag);
    const fatal = permanent || (!length && !rateLimited && (invalid || (status !== undefined && status >= 400 && status < 500 && !httpTemporary)));
    const retryable = !fatal && (length || rateLimited || httpTemporary || status === undefined || status === 200);
    const category = fatal ? 'configuration' : length ? 'content' : rateLimited ? 'rate-limit' : 'service';
    if(retryable&&!length)coolModel(connection.endpoint.baseUrl,Math.max(diagnostics.retryAfterMs??0,rateLimited?60000:5000));
    report({ ...(status !== undefined ? { status } : {}), code, type, message: msg ?? fallback, category });
    const text = [fallback, code ? `错误码：${code}` : '', msg ?? '', diagnostics.requestId ? `请求标识：${diagnostics.requestId}` : ''].filter(Boolean).join(' ');
    return new TranslationError(text, retryable, fatal, diagnostics.retryAfterMs ?? 0, length ? 'content' : retryable ? 'service' : 'none', diagnostics);
  };
  const limit = connection.view.runtime.maxOutputTokens;
  const body = responses ? {
    model: connection.model.modelId, stream: true, store: false,
    // Task UUID stays stable across chunks, concurrent requests, pause/resume and retries.
    prompt_cache_key: context.sessionId,
    instructions: messages.filter(m => m.role === 'system').map(m => m.content).join('\n'),
    input: messages.filter(m => m.role === 'user').map(m => ({ role: 'user', content: [{ type: 'input_text', text: m.content }] })),
    ...(limit ? { max_output_tokens: limit } : {}),
  } : { model: connection.model.modelId, messages, stream: true, metadata: { session_id: context.sessionId }, ...(limit ? { max_completion_tokens: limit } : {}) };
  const response = await transport(() => fetch(url, { method: 'POST', credentials: 'omit', redirect: 'error', signal: combined, headers: { 'Content-Type': 'application/json', ...(connection.key ? { Authorization: `Bearer ${connection.key}` } : {}) }, body: JSON.stringify(body) }));
  const header = response.headers.get('retry-after');
  const retryAfter = header ? (/^\d+(\.\d+)?$/.test(header) ? Number(header) * 1000 : Date.parse(header) - Date.now()) : 0;
  report({ status: response.status, requestId: clean(response.headers.get('x-request-id') ?? response.headers.get('request-id') ?? response.headers.get('cf-ray')), retryAfterMs: Number.isFinite(retryAfter) ? Math.max(0, Math.min(retryAfter, 2147483647)) : 0 });
  const readBounded = async (max: number) => {
    if (!response.body) return '';
    const reader = response.body.getReader(), decoder = new TextDecoder(); let raw = '';
    try {
      while (raw.length < max) { const { done, value } = await transport(() => reader.read()); if (done) break; raw += decoder.decode(value, { stream: true }); }
      return (raw + decoder.decode()).slice(0, max);
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  };
  if (!response.ok) {
    const raw = await readBounded(16384); let detail: unknown;
    try { detail = JSON.parse(raw); } catch { detail = {}; }
    throw failure(detail, `模型接口返回 HTTP ${response.status}。`, response.status);
  }
  if (!response.body) throw failure({}, '模型接口没有返回正文。');
  if (!response.headers.get('content-type')?.includes('text/event-stream')) {
    const raw = await readBounded(2_000_000); let data;
    try { data = JSON.parse(raw); } catch { throw failure({}, '模型响应不是有效 JSON。'); }
    if (data.error || data.status === 'failed') throw failure(data, '模型接口报告请求失败。');
    const text = responses ? responseText(data) : data?.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text) throw failure(data, '模型未返回译文。');
    await onText(text);
    if (responses ? data.status !== 'completed' : data?.choices?.[0]?.finish_reason !== 'stop')
      throw failure(data, '模型输出未正常完成，部分结果已保留。', undefined, data.incomplete_details?.reason ?? data?.choices?.[0]?.finish_reason);
    return;
  }
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = '', finished = false, finishReason: string | undefined, bytes = 0, received = '';
  const seenSequences = new Set<number>();
  const emit = async (text: string) => { received += text; await onText(text); };
  const reconcile = async (body: ResponseBody) => {
    const text = responseText(body); if (!text || text === received) return;
    if (text.startsWith(received)) await emit(text.slice(received.length));
    else throw new TranslationError('接口的最终输出与流式内容不一致，已保留收到的内容。', true, false, 0, 'content', diagnostics);
  };
  const event = async (block: string) => {
    const data = block.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n'); if (!data) return;
    if (data === '[DONE]') { if (!responses) finished = true; return; }
    let obj; try { obj = JSON.parse(data); } catch { throw failure({}, '流式响应格式无效，已接收内容仍会保留。'); }
    if (responses) {
      if (typeof obj.sequence_number === 'number') { if (seenSequences.has(obj.sequence_number)) return; seenSequences.add(obj.sequence_number); }
      if (obj.response?.id) report({ responseId: clean(obj.response.id) });
      if (obj.type === 'response.output_text.delta' && typeof obj.delta === 'string') await emit(obj.delta);
      else if (obj.type === 'response.completed') {
        await reconcile(obj.response ?? {});
        if (obj.response?.status && obj.response.status !== 'completed') throw failure(obj, 'Responses 任务未完成。');
        finished = true;
      } else if (obj.type === 'response.incomplete') {
        await reconcile(obj.response ?? {});
        throw failure(obj, '模型输出未完成，部分结果已保留。', undefined, obj.response?.incomplete_details?.reason);
      } else if (obj.type === 'response.failed' || obj.type === 'error' || obj.error) throw failure(obj, 'Responses 接口报告请求失败，已接收内容仍会保留。');
      else if (obj.type === 'response.refusal.delta') throw new TranslationError('模型拒绝了翻译请求。', false, true, 0, 'none', diagnostics);
    } else {
      if (obj.error) throw failure(obj, '模型接口报告请求失败。');
      const c = obj.choices?.[0]; if (typeof c?.delta?.content === 'string') await emit(c.delta.content); if (c?.finish_reason) finishReason = c.finish_reason;
    }
  };
  try {
    while (!finished) {
      const { done, value } = await transport(() => reader.read()); if (done) break;
      bytes += value.length; if (bytes > 4_000_000) throw new TranslationError('模型返回内容过大。', false, true);
      buffer += decoder.decode(value, { stream: true });
      // Preserve a trailing CR across network chunks before normalizing CRLF.
      buffer = buffer.replace(/\r\n/g, '\n');
      let end; while ((end = buffer.indexOf('\n\n')) >= 0) { const block = buffer.slice(0, end); buffer = buffer.slice(end + 2); await event(block); }
      if (buffer.length > 1_000_000) throw new TranslationError('流式响应帧过大。', false, true);
    }
    buffer += decoder.decode(); if (buffer.trim()) await event(buffer);
    if (!finished && (responses || finishReason !== 'stop')) throw failure({}, '连接在模型完成前断开。');
    if (finishReason && finishReason !== 'stop') throw failure({}, '模型输出被截断或拒绝，部分结果已保留。', undefined, finishReason === 'length' ? 'max_output_tokens' : finishReason);
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
