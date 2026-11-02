import { createMachineTranslator, credentials } from '@/translation/machine';
import { incomplete } from '@/translation/machine/transport';
import { machineSlot } from '@/translation/machine/slot';
import { machineTranslationSettings } from '@/translation/machine-providers';
import { ModelSettingsStore } from "@/data/model-settings";
import { requestImportOrigin } from "@/document/permissions";
import { discoverModels, readJson } from "@/ai/model-discovery";
import {
  bundledCatalog,
  matchCatalog,
  mergeFacts,
  missingFacts,
  normalizeModelId,
  parseCatalog,
  withDefaultFacts,
  presets,
  type Catalog,
  type CatalogModel,
} from "@/ai/model-catalog";
import { streamModel } from "@/ai/provider";
import type {
  EndpointDraft,
  SettingsDraft,
  SettingsView,
} from "@/ui/settings/types";
import { modelProblems } from "@/ai/model-capabilities";
const cacheKey = "paperpane-model-catalog-v2";
export function readCatalog(): Catalog {
  try {
    const data = JSON.parse(localStorage.getItem(cacheKey) ?? "null");
    if (
      data?.version === 1 &&
      typeof data.catalog?.updatedAt === "string" &&
      Array.isArray(data.catalog.models)
    )
      return data.catalog;
  } catch {}
  return bundledCatalog;
}
export async function updateCatalog(signal: AbortSignal): Promise<Catalog> {
  if (!(await requestImportOrigin("https://models.dev/api.json")))
    throw new Error("未获得目录服务访问权限。");
  const catalog = parseCatalog(
    await readJson(
      await fetch("https://models.dev/api.json", {
        credentials: "omit",
        redirect: "error",
        signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]),
      }),
      20_000_000,
    ),
  );
  localStorage.setItem(cacheKey, JSON.stringify({ version: 1, catalog }));
  return catalog;
}
export async function fetchEndpointModels(
  endpoint: EndpointDraft,
  catalog: Catalog,
  signal: AbortSignal,
): Promise<CatalogModel[]> {
  if (!(await requestImportOrigin(endpoint.baseUrl)))
    throw new Error("未获得模型接口访问权限。");
  const db = new ModelSettingsStore();
  try {
    const connection = await db.resolveDraftEndpoint(endpoint);
    signal.throwIfAborted();
    const rows = await discoverModels(
      connection.endpoint.baseUrl,
      endpoint.protocol,
      connection.key,
      AbortSignal.any([signal, AbortSignal.timeout(30000)]),
    );
    const preset = presets.find((p) => p.id === endpoint.presetId);
    // Only official preset destinations inherit catalog facts automatically.
    const trusted = preset && preset.url === connection.endpoint.baseUrl;
    return rows.map((row) => {
      const match = trusted
        ? catalog.models.find(
            (m) =>
              m.provider === preset.provider &&
              m.modelId === row.modelId &&
              m.protocol === endpoint.protocol,
          )
        : undefined;
      if (!match) return row;
      const facts = Object.fromEntries(
        Object.entries(row).filter(
          ([k, v]) =>
            v !== undefined && !["provider", "reasoning", "label"].includes(k),
        ),
      );
      return {
        ...match,
        ...facts,
        label: row.label === row.modelId ? match.label : row.label,
        reasoning:
          row.reasoning.kind === "unknown" ? match.reasoning : row.reasoning,
      };
    });
  } finally {
    await db.close();
  }
}
export async function testConfiguredModel(
  draft: SettingsDraft,
  modelId: string,
  mode: "text" | "image" | "structured",
  signal: AbortSignal,
) {
  const model = draft.models.find((m) => m.id === modelId);
  if (!model) throw new Error("模型不存在。");
  const problems = modelProblems(model);
  if (problems.length) throw new Error(problems[0]);
  const endpoint = draft.endpoints.find((e) => e.id === model.endpointId);
  if (!endpoint) throw new Error("接口不存在。");
  if (!(await requestImportOrigin(endpoint.baseUrl)))
    throw new Error("未获得模型接口访问权限。");
  const db = new ModelSettingsStore();
  try {
    const c = await db.resolveDraftEndpoint(endpoint);
    signal.throwIfAborted();
    // A short test still needs output room for the configured thinking budget.
    const testOutput = Math.max(
      2048,
      model.reasoning.kind === "budget" && model.defaultReasoning
        ? Number(model.defaultReasoning) + 1024
        : 0,
    );
    const view: SettingsView = {
      ...draft,
      revision: "test",
      endpoints: draft.endpoints.map(({ key, hadKey, ...e }) => ({
        ...e,
        hasKey: hadKey,
      })),
      sync: { ...draft.sync, hasPassword: draft.sync.hadPassword },
      translationApis: draft.translationApis.map(({ secret, hadSecret, ...api }) => ({ ...api, hasSecret: hadSecret })),
      runtime: {
        ...draft.runtime,
        maxOutputTokens: Math.min(
          draft.runtime.maxOutputTokens ?? Infinity,
          testOutput,
        ),
      },
    };
    const image = mode === "image" ? makeTestImage() : undefined;
    let text = "";
    const usage = await streamModel(
      {
        view,
        model,
        endpoint: {
          ...c.endpoint,
          protocol: model.protocolOverride ?? endpoint.protocol,
          hasKey: !!c.key,
        },
        key: c.key,
      },
      {
        sessionId: crypto.randomUUID(),
        system: "This is a connection test. Follow the request exactly.",
        messages: [
          {
            role: "user",
            text:
              mode === "structured"
                ? "Return an object with ok equal to true."
                : mode === "image"
                  ? "What is the main color of this image? Answer with one word."
                  : "Reply with exactly OK.",
            images: image ? [image] : undefined,
          },
        ],
        ...(mode === "structured"
          ? {
              outputSchema: {
                name: "connection_test",
                schema: {
                  type: "object",
                  properties: { ok: { type: "boolean" } },
                  required: ["ok"],
                  additionalProperties: false,
                },
              },
            }
          : {}),
        onText: (delta) => (text += delta),
      },
      signal,
    );
    if (!text.trim()) throw new Error("接口没有返回文字。");
    if (mode === "structured" && JSON.parse(text).ok !== true)
      throw new Error("返回数据未通过结构化校验。");
    if (mode === "image" && !/red|红/i.test(text))
      throw new Error("模型未正确识别测试图的红色。");
    return { text, usage, at: new Date().toISOString() };
  } finally {
    await db.close();
  }
}
function makeTestImage() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ff0000";
  ctx.fillRect(0, 0, 64, 64);
  return canvas.toDataURL("image/png");
}

const routerKey = "paperpane-openrouter-models-v1";
const ROUTER_URL = "https://openrouter.ai/api/v1/models";
type RouterFacts = Pick<CatalogModel, "vision" | "contextWindow" | "reasoning">;

/** OpenRouter's public model list (no key): context, image input and thinking support by model. Cached for a day. */
async function routerFacts(signal: AbortSignal): Promise<Map<string, RouterFacts>> {
  let rows: unknown;
  try {
    const cached = JSON.parse(localStorage.getItem(routerKey) ?? "null");
    if (cached && Date.now() - cached.at < 86_400_000) rows = cached.rows;
  } catch {}
  if (!rows) {
    if (!(await requestImportOrigin(ROUTER_URL))) throw new Error("未获得模型资料查询的访问权限。");
    const response = await fetch(ROUTER_URL, { credentials: "omit", redirect: "error", signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]) });
    rows = ((await readJson(response, 20_000_000)) as { data?: unknown })?.data;
    if (!Array.isArray(rows)) throw new Error("模型资料格式不正确。");
    try {
      localStorage.setItem(routerKey, JSON.stringify({ at: Date.now(), rows }));
    } catch {}
  }
  const facts = new Map<string, RouterFacts>();
  for (const row of rows as any[]) {
    if (!row || typeof row.id !== "string") continue;
    const key = normalizeModelId(row.id);
    const context = Number.isInteger(row.context_length) && row.context_length > 0 ? row.context_length : undefined;
    const inputs: unknown[] = Array.isArray(row.architecture?.input_modalities) ? row.architecture.input_modalities : [];
    const params: unknown[] = Array.isArray(row.supported_parameters) ? row.supported_parameters : [];
    const next: RouterFacts = {
      vision: inputs.length ? inputs.includes("image") : undefined,
      contextWindow: context,
      reasoning: params.length ? (params.includes("reasoning") ? { kind: "auto" } : { kind: "none" }) : { kind: "unknown" },
    };
    const known = facts.get(key);
    // The same model on several routes: keep the smaller context.
    if (!known || (next.contextWindow ?? Infinity) < (known.contextWindow ?? Infinity)) facts.set(key, next);
  }
  return facts;
}

/**
 * Looks up what a model can do before it is added: the models.dev catalog under
 * any provider, then OpenRouter's public list, then defaults (marked for review).
 * Lookups that fail fall through to the defaults instead of blocking the add.
 */
export async function completeCapabilities(items: CatalogModel[], catalog: Catalog, signal: AbortSignal): Promise<CatalogModel[]> {
  let completed = items.map((item) => {
    if (!missingFacts(item)) return item;
    const match = matchCatalog(catalog, item.modelId);
    return match ? mergeFacts(item, match) : item;
  });
  if (completed.some(missingFacts)) {
    try {
      const facts = await routerFacts(signal);
      completed = completed.map((item) => {
        const found = missingFacts(item) ? facts.get(normalizeModelId(item.modelId)) : undefined;
        return found ? mergeFacts(item, found) : item;
      });
    } catch (error) {
      if (signal.aborted) throw error;
    }
  }
  return completed.map(withDefaultFacts);
}

/**
 * Translates "Hello, world." with a machine translation service as the draft has it (typed or saved
 * credentials) and returns the translation.
 */
export async function testTranslationApi(
  draft: SettingsDraft,
  apiId: string,
  signal: AbortSignal,
): Promise<{ text: string; elapsedMs: number }> {
  signal.throwIfAborted();
  const api = draft.translationApis.find(a => a.id === apiId);
  if (!api) throw new Error('翻译服务不存在。');
  const db = new ModelSettingsStore();
  try {
    const secret = api.secret.kind === 'keep' ? await db.translationApiSecret(apiId) :
      credentials(api.secret.kind === 'replace' ? api.secret.value : undefined);
    const translator = createMachineTranslator(api, secret);
    const start = performance.now();
    const [text] = await machineSlot(apiId, machineTranslationSettings(draft.runtime), signal,
      () => translator.translate({texts:['Hello, world.'],from:'en',to:'zh-CN',signal}));
    if (!text?.trim()) throw incomplete();
    return {text,elapsedMs:Math.round(performance.now()-start)};
  } finally { await db.close(); }
}
