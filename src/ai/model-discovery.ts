import type { CatalogModel } from "./model-catalog";
import type { Protocol } from "../ui/settings/types";

export async function readJson(
  response: Response,
  maxBytes = 2_000_000,
): Promise<any> {
  if (!response.ok)
    throw new Error(
      response.status === 401 || response.status === 403
        ? "鉴权失败，请检查密钥与访问权限。"
        : response.status === 404
          ? "此端点没有模型列表接口，可从常用目录或手动添加。"
          : response.status === 429
            ? "请求过于频繁，请稍后重试。"
            : `接口返回 HTTP ${response.status}。`,
    );
  const reader = response.body?.getReader();
  if (!reader) throw new Error("接口未返回数据。");
  const decoder = new TextDecoder();
  let text = "",
    size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error("返回数据过大。");
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text);
  } catch (e) {
    if (e instanceof SyntaxError) throw new Error("接口返回的不是有效 JSON。");
    throw e;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
export function apiHeaders(
  protocol: Protocol,
  key: string,
): Record<string, string> {
  if (protocol === "anthropic")
    return {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    };
  if (protocol === "gemini") return { "x-goog-api-key": key };
  return key ? { Authorization: `Bearer ${key}` } : {};
}
const cap = (v: unknown) =>
  typeof v === "number" && Number.isInteger(v) && v > 0 && v <= 10_000_000
    ? v
    : undefined;
/** Discovery never makes a generation request and never follows credential-bearing redirects. */
export async function discoverModels(
  baseUrl: string,
  protocol: Protocol,
  key: string,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<CatalogModel[]> {
  const base = baseUrl.replace(/\/$/, "");
  const found = new Map<string, CatalogModel>();
  let cursor = "";
  const seen = new Set<string>();
  for (let page = 0; page < 30; page++) {
    signal.throwIfAborted();
    const url = new URL(base + "/models");
    if (cursor)
      url.searchParams.set(
        protocol === "gemini" ? "pageToken" : "after_id",
        cursor,
      );
    const data = await readJson(
      await fetcher(url, {
        headers: apiHeaders(protocol, key),
        credentials: "omit",
        redirect: "error",
        signal,
      }),
    );
    const rows = protocol === "gemini" ? data.models : data.data;
    if (!Array.isArray(rows)) throw new Error("模型列表格式不正确。");
    for (const m of rows) {
      if (
        protocol === "gemini" &&
        Array.isArray(m.supportedGenerationMethods) &&
        !m.supportedGenerationMethods.includes("generateContent")
      )
        continue;
      const id =
        protocol === "gemini" ? m.name?.replace(/^models\//, "") : m.id;
      if (typeof id !== "string" || !id.trim() || id.length > 300) continue;
      const effort = m.capabilities?.effort;
      const levels =
        effort && typeof effort === "object"
          ? Object.entries(effort)
              .filter(
                ([k, v]) => k !== "supported" && (v as any)?.supported === true,
              )
              .map(([k]) => k)
          : [];
      const name = m.display_name ?? m.displayName;
      found.set(id, {
        provider: "",
        modelId: id,
        label: typeof name === "string" ? name.slice(0, 200) : id,
        protocol,
        vision:
          typeof m.capabilities?.image_input?.supported === "boolean"
            ? m.capabilities.image_input.supported
            : undefined,
        reasoning: levels.length
          ? { kind: "effort", values: levels }
          : { kind: "unknown" },
        inputLimit: cap(m.max_input_tokens ?? m.inputTokenLimit),
        maxOutputTokens: cap(m.max_tokens ?? m.outputTokenLimit),
      });
    }
    if (found.size > 5000)
      throw new Error("模型列表超过 5000 项，请使用目录筛选或手动添加。");
    cursor =
      protocol === "gemini"
        ? data.nextPageToken
        : data.has_more
          ? data.last_id
          : "";
    if (!cursor) return [...found.values()];
    if (typeof cursor !== "string" || seen.has(cursor))
      throw new Error("模型列表分页异常。");
    seen.add(cursor);
  }
  throw new Error("模型列表分页过多，请使用目录或手动添加。");
}
