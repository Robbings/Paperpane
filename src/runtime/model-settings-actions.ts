import { ModelSettingsStore } from "@/data/model-settings";
import { requestImportOrigin } from "@/document/permissions";
import { discoverModels, readJson } from "@/ai/model-discovery";
import {
  bundledCatalog,
  parseCatalog,
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
