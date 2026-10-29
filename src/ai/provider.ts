import { endpointUrl } from "@/data/model-settings";
import type { Connection } from "@/translation/provider";
import { hasImportOrigin } from "@/document/permissions";
import { safeDetail, TranslationError } from "@/translation/errors";
import { modelSlot, coolModel } from "./limit";
import type { Usage } from "./types";
export interface ModelInput {
  role: "user" | "assistant";
  text: string;
  images?: string[];
}
export interface ModelRequest {
  /** Cancels queued dispatch without aborting requests that have already started. */
  queueSignal?: AbortSignal;
  onDispatch?: () => void;
  /** Runs inside the model slot, before failure releases it to another request. */
  onRequestError?: (error: unknown) => void;
  imageDetail?: 'auto' | 'high' | 'low';
  outputSchema?: { name: string; schema: Record<string, unknown> };
  system: string;
  messages: ModelInput[];
  sessionId: string;
  reasoning?: string;
  onText: (delta: string) => void;
  onUsage?: (usage: Usage) => void;
}
export async function streamModel(
  c: Connection,
  input: ModelRequest,
  signal: AbortSignal,
): Promise<Usage> {
  const queuedSignal = input.queueSignal ? AbortSignal.any([signal, input.queueSignal]) : signal;
  return modelSlot(c, queuedSignal, async () => {
    try {
    const protocol = c.endpoint.protocol,
      base = endpointUrl(c.endpoint.baseUrl),
      started = performance.now();
    let first: number | undefined;
    const max =
        c.view.runtime.maxOutputTokens ??
        (c.model.reasoning.kind === "budget" && input.reasoning
          ? Number(input.reasoning) + 4096
          : Math.min(8192, Math.floor((c.model.contextWindow ?? 256000) / 4))),
      usage: Usage = { elapsedMs: 0 };
    const notify = () => {
      usage.elapsedMs = Math.round(performance.now() - started);
      usage.firstTokenMs = first;
      input.onUsage?.({ ...usage });
    };
    const text = (s: string) => {
      if (!s) return;
      if (first === undefined) first = Math.round(performance.now() - started);
      input.onText(s);
      notify();
    };
    const effort = input.reasoning,
      headers: Record<string, string> = { "Content-Type": "application/json" };
    let url: string, body: unknown;
    const dataImage = (image: string) => {
      const m = image.match(/^data:([^;]+);base64,(.*)$/s);
      if (!m) throw new Error("图片附件格式无效");
      return { mime: m[1]!, data: m[2]! };
    };
    if (protocol === "openai-responses") {
      url = base + "/responses";
      if (c.key) headers.Authorization = `Bearer ${c.key}`;
      body = {
        model: c.model.modelId,
        stream: true,
        store: false,
        prompt_cache_key: input.sessionId,
        instructions: input.system,
        ...(input.outputSchema ? {text:{format:{type:'json_schema',strict:true,...input.outputSchema}}}:{}),
        ...(c.view.runtime.maxOutputTokens ? { max_output_tokens: max } : {}),
        ...(effort ? { reasoning: { effort } } : {}),
        input: input.messages.map((m) => ({
          role: m.role,
          content: [
            {
              type: m.role === "assistant" ? "output_text" : "input_text",
              text: m.text || " ",
            },
            ...(m.images ?? []).map((image) => ({
              type: "input_image",
              image_url: image,
              detail: input.imageDetail ?? "auto",
            })),
          ],
        })),
      };
    } else if (protocol === "openai-chat") {
      url = base + "/chat/completions";
      if (c.key) headers.Authorization = `Bearer ${c.key}`;
      body = {
        model: c.model.modelId,
        stream: true,
        stream_options: { include_usage: true },
        ...(input.outputSchema ? {response_format:{type:'json_schema',json_schema:{strict:true,...input.outputSchema}}}:{}),
        ...(c.view.runtime.maxOutputTokens
          ? { max_completion_tokens: max }
          : {}),
        ...(effort ? { reasoning_effort: effort } : {}),
        metadata: { session_id: input.sessionId },
        messages: [
          { role: "system", content: input.system },
          ...input.messages.map((m) => ({
            role: m.role,
            content: m.images?.length
              ? [
                  { type: "text", text: m.text || " " },
                  ...m.images.map((image) => ({
                    type: "image_url",
                    image_url: { url: image, ...(input.imageDetail ? { detail: input.imageDetail } : {}) },
                  })),
                ]
              : m.text,
          })),
        ],
      };
    } else if (protocol === "anthropic") {
      url = base + "/messages";
      headers["x-api-key"] = c.key;
      headers["anthropic-version"] = "2023-06-01";
      headers["anthropic-dangerous-direct-browser-access"] = "true";
      body = {
        model: c.model.modelId,
        stream: true,
        max_tokens: max,
        system: input.system,
        ...(c.model.reasoning.kind === "effort" && effort
          ? { thinking: { type: "adaptive" } }
          : {}),
        ...((input.outputSchema || (c.model.reasoning.kind==='effort'&&effort)) ? {output_config:{...(c.model.reasoning.kind==='effort'&&effort?{effort}:{}),...(input.outputSchema?{format:{type:'json_schema',schema:input.outputSchema.schema}}:{})}}:{}),
        ...(c.model.reasoning.kind === "budget" && effort && Number(effort) > 0
          ? {
              thinking: {
                type: "enabled",
                budget_tokens: Math.min(Number(effort), max - 1),
              },
            }
          : {}),
        messages: input.messages.map((m) => ({
          role: m.role,
          content: [
            { type: "text", text: m.text || " " },
            ...(m.images ?? []).map((image) => {
              const d = dataImage(image);
              return {
                type: "image",
                source: { type: "base64", media_type: d.mime, data: d.data },
              };
            }),
          ],
        })),
      };
    } else {
      url =
        base +
        `/models/${encodeURIComponent(c.model.modelId)}:streamGenerateContent?alt=sse`;
      headers["x-goog-api-key"] = c.key;
      body = {
        systemInstruction: { parts: [{ text: input.system }] },
        generationConfig: {
          ...(input.outputSchema?{responseFormat:{text:{mimeType:'APPLICATION_JSON',schema:input.outputSchema.schema}}}:{}),
          ...(c.view.runtime.maxOutputTokens ? { maxOutputTokens: max } : {}),
          ...(effort
            ? {
                thinkingConfig:
                  c.model.reasoning.kind === "budget"
                    ? { thinkingBudget: Number(effort) }
                    : { thinkingLevel: effort },
              }
            : {}),
        },
        contents: input.messages.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [
            { text: m.text || " " },
            ...(m.images ?? []).map((image) => {
              const d = dataImage(image);
              return { inlineData: { mimeType: d.mime, data: d.data } };
            }),
          ],
        })),
      };
    }
    if (!(await hasImportOrigin(url)))
      throw new Error("请在模型设置中保存并授予此接口访问权限。");
    signal.throwIfAborted();
    queuedSignal.throwIfAborted();
    const requestSignal = AbortSignal.any([
      signal,
      AbortSignal.timeout(c.view.runtime.timeoutSec * 1000),
    ]);
    input.onDispatch?.();
    const response = await fetch(url, {
      method: "POST",
      credentials: "omit",
      redirect: "error",
      headers,
      body: JSON.stringify(body),
      signal: requestSignal,
    }).catch((e) => {
      if (signal.aborted) throw signal.reason;
      throw new TranslationError(
        e?.name === "TimeoutError" ? "模型请求超时" : "网络连接失败",
        true,
        false,
        5000,
        "service",
      );
    });
    const error = (data: any, status = response.status) => {
      const message =
        safeDetail(data?.error?.message ?? data?.message ?? `HTTP ${status}`, [
          c.key,
        ]) ?? `HTTP ${status}`;
      const tag =
        String(data?.error?.code ?? data?.error?.type ?? "") + " " + message;
      const permanent =
        /insufficient.quota|invalid.api.key|authentication|permission.denied|billing|spend.limit/i.test(
          tag,
        );
      const rate = status === 429 || /rate.limit|too.many.requests/i.test(tag),
        retryable =
          !permanent &&
          ([408, 409, 429, 500, 502, 503, 504].includes(status) ||
            rate ||
            /overloaded/i.test(tag));
      const after = response.headers.get("retry-after"),
        parsed = after
          ? Number.isFinite(Number(after))
            ? Number(after) * 1000
            : Date.parse(after) - Date.now()
          : NaN,
        ms = Number.isFinite(parsed)
          ? Math.max(0, Math.min(parsed, 2147483647))
          : rate
            ? 60000
            : 5000;
      if (retryable) coolModel(c.endpoint.baseUrl, ms);
      return new TranslationError(
        message,
        retryable,
        !retryable,
        ms,
        retryable ? "service" : "none",
        {
          status,
          requestId: response.headers.get("x-request-id") ?? undefined,
          category: rate ? "rate-limit" : "service",
        },
      );
    };
    if (!response.ok) {
      const raw = await response.text();
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        data = { message: `接口返回 HTTP ${response.status}` };
      }
      throw error(data);
    }
    let completed = false,
      received = "",
      stop: string | undefined;
    const add = (delta: string) => {
      received += delta;
      text(delta);
    };
    const openUsage = (u: any) => {
      if (!u) return;
      usage.input = u.input_tokens ?? u.prompt_tokens ?? usage.input;
      usage.output = u.output_tokens ?? u.completion_tokens ?? usage.output;
      usage.cached =
        u.input_tokens_details?.cached_tokens ??
        u.prompt_tokens_details?.cached_tokens ??
        u.cache_read_input_tokens ??
        usage.cached;
      usage.reasoning =
        u.output_tokens_details?.reasoning_tokens ??
        u.completion_tokens_details?.reasoning_tokens ??
        usage.reasoning;
      notify();
    };
    const sequences = new Set<number>();
    const consume = (obj: any) => {
      if (
        protocol === "openai-responses" &&
        typeof obj.sequence_number === "number"
      ) {
        if (sequences.has(obj.sequence_number)) return;
        sequences.add(obj.sequence_number);
      }
      if (obj.error) throw error(obj);
      if (protocol === "openai-responses") {
        if (obj.type === "response.output_text.delta") add(obj.delta ?? "");
        if (
          [
            "response.completed",
            "response.incomplete",
            "response.failed",
          ].includes(obj.type)
        ) {
          const r = obj.response ?? {};
          openUsage(r.usage);
          const final =
            r.output
              ?.filter((x: any) => x.type === "message")
              .flatMap((x: any) => x.content ?? [])
              .filter((x: any) => x.type === "output_text")
              .map((x: any) => x.text ?? "")
              .join("") ?? "";
          if (final.startsWith(received)) add(final.slice(received.length));
          else if (final)
            throw new Error(
              "模型最终内容与已收到的输出不一致，部分内容已保留。",
            );
          if (obj.type !== "response.completed") throw error(r, 400);
          completed = true;
        }
      } else if (protocol === "openai-chat") {
        const choice = obj.choices?.[0];
        add(choice?.delta?.content ?? "");
        if (choice?.finish_reason) {
          stop = choice.finish_reason;
          completed = stop === "stop";
        }
        openUsage(obj.usage);
      } else if (protocol === "anthropic") {
        if (obj.type === "message_start") openUsage(obj.message?.usage);
        if (
          obj.type === "content_block_delta" &&
          obj.delta?.type === "text_delta"
        )
          add(obj.delta.text);
        if (obj.type === "message_delta") {
          openUsage(obj.usage);
          stop = obj.delta?.stop_reason;
        }
        if (obj.type === "message_stop")
          completed = !stop || ["end_turn", "stop_sequence"].includes(stop);
      } else {
        const candidate = obj.candidates?.[0];
        for (const p of candidate?.content?.parts ?? [])
          if (!p.thought && p.text) add(p.text);
        if (candidate?.finishReason) {
          stop = candidate.finishReason;
          completed = stop === "STOP";
        }
        const u = obj.usageMetadata;
        if (u) {
          usage.input = u.promptTokenCount;
          usage.output = u.candidatesTokenCount;
          usage.cached = u.cachedContentTokenCount;
          usage.reasoning = u.thoughtsTokenCount;
          notify();
        }
      }
    };
    if (response.headers.get("content-type")?.includes("text/event-stream")) {
      const reader = response.body!.getReader(),
        decoder = new TextDecoder();
      let buffer = "",
        bytes = 0;
      const event = (block: string) => {
        const raw = block
          .split("\n")
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trim())
          .join("\n");
        if (!raw || raw === "[DONE]") return;
        consume(JSON.parse(raw));
      };
      try {
        while (true) {
          const { value, done } = await reader.read().catch((e) => {
            if (signal.aborted) throw signal.reason;
            throw new TranslationError(
              e?.name === "TimeoutError" ? "模型输出超时" : "模型连接中断",
              true,
              false,
              5000,
              "service",
            );
          });
          if (done) break;
          bytes += value.length;
          if (bytes > 8000000)
            throw new Error("模型返回内容过大，已保留收到的部分。");
          buffer += decoder.decode(value, { stream: true });
          buffer = buffer.replace(/\r\n/g, "\n");
          let end;
          while ((end = buffer.indexOf("\n\n")) >= 0) {
            event(buffer.slice(0, end));
            buffer = buffer.slice(end + 2);
          }
        }
        buffer += decoder.decode();
        if (buffer.trim()) event(buffer);
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
    } else {
      const obj = await response.json();
      if (obj.error) throw error(obj);
      if (protocol === "openai-responses") {
        consume({
          type:
            obj.status === "completed"
              ? "response.completed"
              : "response.incomplete",
          response: obj,
        });
      } else if (protocol === "openai-chat") {
        add(obj.choices?.[0]?.message?.content ?? "");
        openUsage(obj.usage);
        completed = obj.choices?.[0]?.finish_reason === "stop";
      } else if (protocol === "anthropic") {
        add(
          (obj.content ?? [])
            .filter((p: any) => p.type === "text")
            .map((p: any) => p.text)
            .join(""),
        );
        openUsage(obj.usage);
        completed = obj.stop_reason === "end_turn";
      } else consume(obj);
    }
    notify();
    if (completed && !received.trim())
      throw new Error(
        "模型未返回回答，可能拒绝了请求或只返回了思考内容。请检查模型后重试。",
      );
    if (!completed)
      throw new Error("模型输出未正常结束，部分内容已保留，可重新生成新版本。");
    return usage;
    } catch (error) {
      input.onRequestError?.(error);
      throw error;
    }
  });
}
