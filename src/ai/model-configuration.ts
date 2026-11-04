import type { FeatureId, Protocol, SettingsView } from '../ui/settings/types';

export type ModelOperation = 'generation' | 'translation';

// Transport capabilities belong to the model layer. Configuration screens may
// edit protocols; consumers ask for an operation and never interpret protocols.
const adapters = {
  'openai-chat': { generation: true, translation: true },
  'openai-responses': { generation: true, translation: true },
  anthropic: { generation: true, translation: false },
  gemini: { generation: true, translation: false },
} satisfies Record<Protocol, Record<ModelOperation, boolean>>;

export function isModelProtocol(value: string): value is Protocol {
  return Object.hasOwn(adapters, value);
}

export function supportsModelOperation(protocol: string, operation: ModelOperation): boolean {
  return isModelProtocol(protocol) && adapters[protocol][operation];
}

// Zero-width spaces, joiners, word joiner, BOM and soft hyphen survive String#trim()
// and often ride along when an address or key is copied from a web page.
const INVISIBLE = /[\u200B-\u200D\u2060\uFEFF\u00AD]/g;

/** Normalizes a pasted endpoint address or API key: drops invisible characters, then trims. */
export function cleanPasted(raw: string): string {
  return raw.replace(INVISIBLE, '').trim();
}

export function endpointUrl(raw: string): string {
  const url = new URL(cleanPasted(raw));
  if (url.username || url.password || url.search || url.hash || !['http:', 'https:'].includes(url.protocol))
    throw new Error('接口地址应为不含凭据、查询参数的 HTTP(S) 地址。');
  if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    throw new Error('远程模型接口必须使用 HTTPS。');
  return url.href.replace(/\/$/, '').replace(/\/(?:chat\/completions|responses|messages)$/, '').replace(/\/models\/[^/]+:(?:streamGenerateContent|generateContent)$/, '');
}

/** Shared routing for configuration status and actual requests. No I/O or secrets. */
export function resolveConfiguredModel(view: SettingsView, modelId?: string, feature?: FeatureId) {
  const route = feature ? view.features.find(item => item.feature === feature) : undefined;
  if (route?.enabled === false) throw new Error('此 AI 功能已在设置中关闭。');
  const fallback = view.features.find(item => item.feature === 'translate' && item.enabled)?.modelId;
  const selected = modelId ?? route?.modelId ?? view.defaultModelId ?? fallback ?? view.models[0]?.id;
  const model = view.models.find(item => item.id === selected);
  if (!model?.modelId.trim()) throw new Error('所选模型不存在或模型 ID 为空');
  const storedEndpoint = view.endpoints.find(item => item.id === model.endpointId);
  const endpoint = storedEndpoint && {...storedEndpoint, protocol: model.protocolOverride ?? storedEndpoint.protocol};
  if (!endpoint) throw new Error('模型关联的接口不存在');
  endpointUrl(endpoint.baseUrl);
  if (!supportsModelOperation(endpoint.protocol, feature === 'translate' ? 'translation' : 'generation'))
    throw new Error(feature === 'translate' ? '所选模型暂不支持翻译。' : '模型接口暂不可用。');
  return { model, endpoint };
}

export type ModelConfigurationStatus =
  | { state: 'unconfigured' }
  | { state: 'unavailable'; message: string }
  | { state: 'configured'; label: string };

/** Configuration readiness only; never a connectivity check or a paid request. */
export function modelConfigurationStatus(view: SettingsView, feature?: FeatureId): ModelConfigurationStatus {
  if (!view.models.length) return { state: 'unconfigured' };
  try {
    const { model } = resolveConfiguredModel(view, undefined, feature);
    return { state: 'configured', label: model.label.trim() || model.modelId };
  } catch (error) {
    return { state: 'unavailable', message: error instanceof Error ? error.message : '模型配置不可用。' };
  }
}
