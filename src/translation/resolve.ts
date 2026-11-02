import {noModel,removedEngine} from './problems';
import type { Connection } from '@/ai/connection';
import { resolveConfiguredModel } from '@/ai/model-configuration';
import type { TranslationRun } from '@/contracts/translation';
import type { TranslationApiView, SettingsView, MachineTranslationConfig } from '@/ui/settings/types';
import {
  effectiveSelectionValue,
  paperEngineValue,
  engineOptions,
  engineName,
} from '@/ui/settings/engine-options';
import { createMachineTranslator, credentials } from './machine';
import {
  machineProvider,
  machineTranslationSettings,
  type MachineProvider,
  type MachineTranslator,
} from './machine-providers';

export type ResolvedMachine = {
  kind: 'machine';
  key: string;
  label: string;
  api: TranslationApiView;
  provider: MachineProvider;
  translator: MachineTranslator;
  settings: MachineTranslationConfig;
  revision: string;
  adapterVersion: string;
};
export type ResolvedEngine =
  ResolvedMachine | { kind: 'llm'; key: string; label: string; connection: Connection; revision: string };

export const savedEngineKey = (profile: TranslationRun['profile']) =>
  profile.engine?.key ?? 'llm:' + profile.modelId;

/** Resolve the generic picker entry to the actual default model, independently of the paper route. */
export function concreteKey(view: SettingsView, value: string) {
  if (value !== 'llm:') return value;
  return (
    'llm:' +
    (view.defaultModelId ??
      view.features.find((f) => f.feature === 'translate' && f.enabled)?.modelId ??
      view.models[0]?.id ??
      '')
  );
}
export function resolveEngine(
  view: SettingsView,
  keys: Record<string, string>,
  purpose: 'paper' | 'selection',
  override?: string,
): ResolvedEngine {
  const value =
    override ?? (purpose === 'selection' ? effectiveSelectionValue(view) : paperEngineValue(view));
  const key = concreteKey(view, value);
  const label = engineName(engineOptions(view), key),
    revision = view.revision;
  if (key.startsWith('llm:')) {
    if (!view.models.length && !key.slice(4)) throw new Error(noModel);
    if (key.slice(4) && !view.models.some(model=>model.id===key.slice(4))) throw new Error(removedEngine);
    const { model, endpoint } = resolveConfiguredModel(view, key.slice(4) || undefined, 'translate');
    return {
      kind: 'llm',
      key: 'llm:' + model.id,
      label,
      revision,
      connection: { view, model, endpoint, key: keys[endpoint.id] ?? '' },
    };
  }
  const api = view.translationApis?.find((a) => 'mt:' + a.id === key);
  if (!api) throw new Error(removedEngine);
  const provider = machineProvider(api.kind);
  if (!provider) throw new Error('不支持这个翻译服务。');
  const translator = createMachineTranslator(api, credentials(keys['translation-api:' + api.id]));
  return {
    kind: 'machine',
    key,
    label,
    revision,
    api,
    provider,
    translator,
    adapterVersion: translator.version,
    settings: machineTranslationSettings(view.runtime),
  };
}
