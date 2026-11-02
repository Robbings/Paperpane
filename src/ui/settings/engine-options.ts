import { machineProvider, machineTargets } from '@/translation/machine-providers';
import type { ModelConfigView, SelectionEngineChoice, TranslationEngineChoice } from './types';

// 翻译引擎的选项：设置页、译文栏和选区翻译窗口共用一套取值和名称。
// 取值：'llm:'（默认模型）、'llm:<模型 id>'、'mt:<翻译服务 id>'；选区另有 'same'（与全文相同）。

export interface TranslationEngineOption {
  value: string;
  label: string;
  /** For the closed control, when the label also names the service. */
  shortLabel?: string;
  group: 'llm' | 'machine';
  /** Languages it can translate into; missing: any. */
  languages?: readonly string[];
  disabled?: boolean;
}

/** The engine a reader picked, with everything a picker needs to show it. */
export interface TranslationEngineView {
  value: string;
  options: readonly TranslationEngineOption[];
}

interface EngineSource {
  models: readonly Pick<ModelConfigView, 'id' | 'label' | 'modelId' | 'endpointId'>[];
  endpoints: readonly { id: string; name: string }[];
  translationApis?: readonly { id: string; kind: string; name: string }[];
  features: readonly { feature: string; modelId: string | null }[];
  translationEngine?: TranslationEngineChoice;
  selectionTranslationEngine?: SelectionEngineChoice;
}

export const SAME_ENGINE = 'same';

/** Every engine the settings offer: the default model, each model, each machine translation service. */
export function engineOptions(settings: EngineSource): TranslationEngineOption[] {
  return [
    { value: 'llm:', label: '跟随默认模型', shortLabel: '默认模型', group: 'llm' },
    ...settings.models.map((m) => ({
      value: `llm:${m.id}`,
      label: `${m.label || m.modelId} · ${settings.endpoints.find((e) => e.id === m.endpointId)?.name ?? ''}`,
      shortLabel: m.label || m.modelId,
      group: 'llm' as const,
    })),
    ...(settings.translationApis ?? []).map((a) => ({
      value: `mt:${a.id}`,
      label: a.name || machineProvider(a.kind)?.name || '翻译服务',
      group: 'machine' as const,
      languages: machineTargets(a.kind),
    })),
  ];
}

/** What translates papers, as an option value. */
export function paperEngineValue(settings: EngineSource): string {
  const engine = settings.translationEngine;
  if (engine?.kind === 'machine') return `mt:${engine.apiId}`;
  return `llm:${settings.features.find((f) => f.feature === 'translate')?.modelId ?? ''}`;
}

/** What translates selections, as an option value; 'same' follows the paper engine. */
export function selectionEngineValue(settings: EngineSource): string {
  const engine = settings.selectionTranslationEngine;
  if (!engine || engine.kind === 'same') return SAME_ENGINE;
  return engine.kind === 'machine' ? `mt:${engine.apiId}` : `llm:${engine.modelId ?? ''}`;
}

/** The engine a selection is actually translated with. */
export function effectiveSelectionValue(settings: EngineSource): string {
  const value = selectionEngineValue(settings);
  return value === SAME_ENGINE ? paperEngineValue(settings) : value;
}

export function selectionChoice(value: string): SelectionEngineChoice {
  if (value === SAME_ENGINE) return { kind: 'same' };
  if (value.startsWith('mt:')) return { kind: 'machine', apiId: value.slice(3) };
  return { kind: 'llm', modelId: value.slice(4) || null };
}

/** Short name of an engine, for labels such as "第 3 页 · DeepL". */
export function engineName(options: readonly TranslationEngineOption[], value: string): string {
  const option = options.find((o) => o.value === value);
  return option?.shortLabel ?? option?.label ?? '翻译引擎';
}

/** Set when the engine cannot translate into this language. */
export function unsupportedLanguage(options: readonly TranslationEngineOption[], value: string, language: string): boolean {
  const languages = options.find((o) => o.value === value)?.languages;
  return !!languages && !languages.includes(language);
}
