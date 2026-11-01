import snapshot from "./model-catalog-data.json" with { type: "json" };
import type {
  ModelConfigView,
  Protocol,
  ReasoningCapability,
} from "../ui/settings/types";

import { presets, catalogProviders } from "./model-providers.ts";
export { presets, protocols } from "./model-providers.ts";
export interface CatalogModel {
  provider: string;
  protocol?: Protocol;
  modelId: string;
  label: string;
  vision?: boolean;
  reasoning: ReasoningCapability;
  contextWindow?: number;
  inputLimit?: number;
  maxOutputTokens?: number;
  status?: string;
  releaseDate?: string;
  /** Some facts are defaults, not looked up: the reader should check them. */
  guessed?: boolean;
}
export interface Catalog {
  updatedAt: string;
  models: CatalogModel[];
}
export const bundledCatalog = snapshot as Catalog;
export const metadataFields = [
  "vision",
  "visionKnown",
  "reasoning",
  "contextWindow",
  "inputLimit",
  "maxOutputTokens",
] as const;
export function newModel(
  endpointId: string,
  item: CatalogModel,
  updatedAt: string,
): ModelConfigView {
  return {
    id: crypto.randomUUID(),
    endpointId,
    modelId: item.modelId,
    label: item.label,
    vision: item.vision ?? false,
    visionKnown: item.vision !== undefined,
    reasoning: item.reasoning,
    contextWindow: item.contextWindow,
    inputLimit: item.inputLimit,
    maxOutputTokens: item.maxOutputTokens,
    showInDiscussion: true,
    ...(item.guessed ? { capabilitiesGuessed: true } : {}),
    metadataSource: item.provider ? "catalog" : "endpoint",
    ...(item.provider
      ? {
          catalogRef: {
            provider: item.provider,
            modelId: item.modelId,
            updatedAt,
          },
          protocolOverride: item.protocol,
        }
      : {}),
    overrides: [],
  };
}
export function refreshModel(
  model: ModelConfigView,
  item: CatalogModel,
  updatedAt: string,
): ModelConfigView {
  const suggested = newModel(model.endpointId, item, updatedAt),
    next = { ...model };
  // Pre-existing models have no field provenance; their explicit values remain user choices.
  const overrides = new Set(model.overrides ?? metadataFields);
  for (const field of metadataFields)
    if (!overrides.has(field))
      Object.assign(next, { [field]: suggested[field] });
  return { ...next, catalogRef: suggested.catalogRef ?? model.catalogRef };
}
const limit = (v: unknown) =>
  typeof v === "number" && Number.isInteger(v) && v > 0 && v <= 10_000_000
    ? v
    : undefined;
/** Parse the public v1 API defensively. Missing facts remain unknown. */
export function parseCatalog(data: unknown): Catalog {
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new Error("模型目录格式不正确。");
  const models: CatalogModel[] = [];
  for (const provider of catalogProviders) {
    const group = (data as Record<string, any>)[provider]?.models;
    if (!group || typeof group !== "object") continue;
    for (const [id, m] of Object.entries(group) as [string, any][]) {
      if (models.length >= 5000) throw new Error("模型目录过大。");
      if (
        !m ||
        typeof m !== "object" ||
        id.length > 300 ||
        !id.trim() ||
        !Array.isArray(m.modalities?.output) ||
        !m.modalities.output.includes("text")
      )
        continue;
      const options = Array.isArray(m.reasoning_options)
        ? m.reasoning_options
        : [];
      const effort = options
        .find((o: any) => o?.type === "effort")
        ?.values?.filter((v: unknown) => typeof v === "string");
      const budget = options.find((o: any) => o?.type === "budget_tokens");
      const reasoning: ReasoningCapability =
        Array.isArray(effort) &&
        effort.length &&
        effort.length <= 16 &&
        effort.every((x: unknown) => typeof x === "string" && x.length < 40)
          ? { kind: "effort", values: effort }
          : limit(budget?.max) &&
              Number.isFinite(budget?.min ?? 0) &&
              Math.max(0, budget.min ?? 0) <= budget.max
            ? {
                kind: "budget",
                minTokens: Math.max(0, budget.min ?? 0),
                maxTokens: budget.max,
                presets: [
                  ...new Set([Math.max(0, budget.min ?? 0), budget.max]),
                ],
              }
            : options.some((o: any) => o?.type === "toggle")
              ? { kind: "toggle" }
              : m.reasoning === false
                ? { kind: "none" }
                : m.reasoning === true
                  ? { kind: "auto" }
                  : { kind: "unknown" };
      models.push({
        provider,
        modelId: id,
        label: typeof m.name === "string" ? m.name.slice(0, 200) : id,
        protocol: presets.find((p) => p.provider === provider)?.protocol,
        vision: Array.isArray(m.modalities?.input)
          ? m.modalities.input.some(
              (x: unknown) =>
                typeof x === "string" &&
                (x === "image" || x.startsWith("image/")),
            )
          : undefined,
        reasoning,
        contextWindow: limit(m.limit?.context),
        inputLimit: limit(m.limit?.input),
        maxOutputTokens: limit(m.limit?.output),
        status: typeof m.status === "string" ? m.status : "active",
        releaseDate: typeof m.release_date === "string" ? m.release_date : "",
      });
    }
  }
  if (!models.length) throw new Error("目录没有可用的文字模型，保留现有目录。");
  return { updatedAt: new Date().toISOString(), models };
}

/** Context assumed for a model nobody could describe: a common size that suits most current models. */
export const DEFAULT_CONTEXT_WINDOW = 128_000;

/** "openai/gpt-4o-2024-08-06:free" → "gpt-4o": the part that names the model across hosts. */
export function normalizeModelId(id: string): string {
  return id
    .trim()
    .toLowerCase()
    .replace(/^.*\//, "")
    .replace(/:.*$/, "")
    .replace(/-(\d{4}-\d{2}-\d{2}|\d{8}|\d{4}|latest)$/, "");
}

/** Whether the item still misses a fact the reader would otherwise have to fill in. */
export function missingFacts(item: CatalogModel): boolean {
  return item.vision === undefined || item.contextWindow === undefined || item.reasoning.kind === "unknown";
}

/**
 * The catalog entry for a model id served by any host (relays, proxies). Exact ids
 * first, then the normalised name. When several match, the smallest context wins:
 * hosts often offer a model at more than one size, and the smaller one is safe.
 */
export function matchCatalog(catalog: Catalog, modelId: string): CatalogModel | undefined {
  const exact = catalog.models.filter((m) => m.modelId.toLowerCase() === modelId.trim().toLowerCase());
  const key = normalizeModelId(modelId);
  const candidates = exact.length ? exact : catalog.models.filter((m) => normalizeModelId(m.modelId) === key);
  return candidates.sort((a, b) => (a.contextWindow ?? Infinity) - (b.contextWindow ?? Infinity))[0];
}

/** Fills what is still unknown from another description of the same model, keeping what is known. */
export function mergeFacts(item: CatalogModel, from: Partial<CatalogModel>): CatalogModel {
  return {
    ...item,
    vision: item.vision ?? from.vision,
    contextWindow: item.contextWindow ?? from.contextWindow,
    inputLimit: item.inputLimit ?? from.inputLimit,
    maxOutputTokens: item.maxOutputTokens ?? from.maxOutputTokens,
    reasoning: item.reasoning.kind === "unknown" && from.reasoning ? from.reasoning : item.reasoning,
  };
}

/** Last resort: automatic thinking, image input on, a common context size; marked for the reader to check. */
export function withDefaultFacts(item: CatalogModel): CatalogModel {
  if (!missingFacts(item)) return item;
  return {
    ...item,
    vision: item.vision ?? true,
    contextWindow: item.contextWindow ?? DEFAULT_CONTEXT_WINDOW,
    reasoning: item.reasoning.kind === "unknown" ? { kind: "auto" } : item.reasoning,
    guessed: true,
  };
}
