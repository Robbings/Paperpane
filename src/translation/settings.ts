import type { RuntimeConfig } from '@/ui/settings/types';
export const LLM_TRANSLATION_DEFAULTS = { batchSentences: 24, batchCharacters: 6000, requestsPerMinute: 10 };
export const LLM_TRANSLATION_LIMITS = { batchSentences: [1, 64], batchCharacters: [500, 12000], requestsPerMinute: [1, 120] } as const;
export function llmTranslationSettings(runtime: RuntimeConfig) {
  const saved = runtime.translation;
  return Object.fromEntries(Object.entries(LLM_TRANSLATION_DEFAULTS).map(([key, fallback]) => {
    const k = key as keyof typeof LLM_TRANSLATION_DEFAULTS, value = saved?.[k], [min, max] = LLM_TRANSLATION_LIMITS[k];
    return [k, typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : fallback];
  })) as typeof LLM_TRANSLATION_DEFAULTS;
}
