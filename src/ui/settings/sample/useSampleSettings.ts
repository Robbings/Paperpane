import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SelectOption } from '@/ui/components';
import { applyAppearance } from '@/ui/theme';
import { runtimeProblems } from '../sections/AdvancedSection';
import {
  DEFAULT_PREFERENCES,
  type Preferences,
  type PreferencesState,
  type SaveSettingsResult,
  type SecretEdit,
  type SettingsDraft,
  type SettingsView,
  type StatusSummary,
} from '../types';

// 示例接线：偏好与配置存在本页的 localStorage 里，设置页和阅读器之间通过 storage 事件同步，
// 用来演示"改了立即生效、其他标签页跟着变"。真实保存、版本号与密钥由逻辑层负责。
// ?demo=conflict：第一次保存时模拟"其他窗口已先保存"。

const PREFERENCES_KEY = 'pp-sample-preferences';
const SETTINGS_KEY = 'pp-sample-settings';

export const sampleSettings: SettingsView = {
  revision: '1',
  endpoints: [
    { id: 'ep-1', name: '示例供应商甲', protocol: 'openai-responses', baseUrl: 'https://api.provider-one.example/v1', hasKey: true },
    { id: 'ep-2', name: '示例供应商乙', protocol: 'anthropic', baseUrl: 'https://api.provider-two.example', hasKey: true },
  ],
  models: [
    { id: 'm-a', endpointId: 'ep-1', modelId: 'model-a', label: '示例模型 A', vision: true, reasoning: { kind: 'effort', values: ['low', 'medium', 'high'] }, showInDiscussion: true },
    { id: 'm-a-mini', endpointId: 'ep-1', modelId: 'model-a-mini', label: '示例模型 A mini', vision: false, reasoning: { kind: 'none' }, showInDiscussion: true },
    { id: 'm-b', endpointId: 'ep-2', modelId: 'model-b', label: '示例模型 B', vision: true, reasoning: { kind: 'budget', minTokens: 1024, maxTokens: 32000, presets: [2048, 8192, 16000] }, showInDiscussion: true },
  ],
  defaultModelId: 'm-a',
  features: [],
  prompts: [],
  runtime: { timeoutSec: 120, concurrency: 2, maxOutputTokens: null },
  sync: { enabled: false, webdavUrl: '', username: '', hasPassword: false, uploadPdfs: true },
};

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? { ...fallback, ...(JSON.parse(raw) as T) } : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Sample only: without storage the change still applies to this page.
  }
}

/** Follows changes another tab writes. */
function useStored<T>(key: string, fallback: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => read(key, fallback));
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === key) setValue(read(key, fallback));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [key]); // fallback is a constant
  const set = useCallback(
    (next: T) => {
      setValue(next);
      write(key, next);
    },
    [key],
  );
  return [value, set];
}

const forcedTheme = new URLSearchParams(window.location.search).get('theme');

/** Preferences: applied at once to this page, saved, and followed in other tabs. */
export function useSamplePreferences() {
  const [preferences, store] = useStored<Preferences>(PREFERENCES_KEY, DEFAULT_PREFERENCES);
  const [local, setLocal] = useState<PreferencesState['local']>('unmodified');

  useEffect(() => {
    // ?theme= in the address wins, for reviewing both themes.
    const theme = forcedTheme === 'light' || forcedTheme === 'dark' ? forcedTheme : preferences.theme;
    applyAppearance({ ...preferences, theme });
  }, [preferences]);

  const setPreference = useCallback(
    <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
      setLocal('saving');
      store({ ...read(PREFERENCES_KEY, DEFAULT_PREFERENCES), [key]: value });
      window.setTimeout(() => setLocal('saved'), 200);
    },
    [store],
  );

  const state: PreferencesState = { preferences, local };
  return { state, setPreference };
}

const nextSecret = (had: boolean, edit: SecretEdit) => (edit.kind === 'replace' ? true : edit.kind === 'clear' ? false : had);

/** The configuration: one snapshot with a revision, saved as a whole. */
export function useSampleSettings() {
  const [settings, store] = useStored<SettingsView>(SETTINGS_KEY, sampleSettings);
  const [conflictOnce, setConflictOnce] = useState(() => new URLSearchParams(window.location.search).get('demo') === 'conflict');

  const save = useCallback(
    async (draft: SettingsDraft, baseRevision: string): Promise<SaveSettingsResult> => {
      await new Promise((resolve) => window.setTimeout(resolve, 500));
      const current = read(SETTINGS_KEY, sampleSettings);
      if (conflictOnce) {
        setConflictOnce(false);
        const latest = { ...current, revision: String(Number(current.revision) + 1), defaultModelId: 'm-b' };
        store(latest);
        return { ok: false, reason: 'conflict', latest };
      }
      if (current.revision !== baseRevision) return { ok: false, reason: 'conflict', latest: current };
      const problems = runtimeProblems(draft.runtime);
      if (problems.length > 0) return { ok: false, reason: 'invalid', problems };
      const { endpoints, sync, translationApis, ...rest } = draft;
      const { hadPassword, password, ...syncRest } = sync;
      const next: SettingsView = {
        ...rest,
        revision: String(Number(current.revision) + 1),
        endpoints: endpoints.map(({ hadKey, key, ...endpoint }) => ({ ...endpoint, hasKey: nextSecret(hadKey, key) })),
        sync: { ...syncRest, hasPassword: nextSecret(hadPassword, password) },
        translationApis: translationApis.map(({ hadSecret, secret, ...api }) => ({ ...api, hasSecret: nextSecret(hadSecret, secret) })),
      };
      store(next);
      return { ok: true, value: next };
    },
    [store, conflictOnce],
  );

  /** The quick switch in the reader: changes only the default model, against the current revision. */
  const setDefaultModel = useCallback(
    (modelId: string | null) => {
      const current = read(SETTINGS_KEY, sampleSettings);
      store({ ...current, revision: String(Number(current.revision) + 1), defaultModelId: modelId });
    },
    [store],
  );

  const status = useMemo<StatusSummary>(
    () => ({
      local: 'saved',
      sync: settings.sync.enabled ? 'synced' : 'unconfigured',
      lastSyncedAt: settings.sync.enabled ? new Date(Date.now() - 5 * 60000).toISOString() : null,
      modelAvailability: settings.models.length > 0 ? 'configured' : 'unconfigured',
    }),
    [settings],
  );

  return { settings, save, setDefaultModel, status };
}

/** Models for a picker, grouped by the service they belong to. */
export function modelOptions(settings: SettingsView): SelectOption<string>[] {
  return settings.models.map((model) => {
    const endpoint = settings.endpoints.find((e) => e.id === model.endpointId);
    return { value: model.id, label: endpoint ? `${model.label} · ${endpoint.name}` : model.label, shortLabel: model.label, group: model.endpointId };
  });
}
