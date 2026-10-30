import type { LocalSaveState, SelectionMenuLook, SyncState } from '@/ui/components';

// 设置界面的视图模型。字段按设置接口草案（v0.1）对应；正式契约确认后由容器映射，
// 界面只认这里的形状。

// ---- A. Preferences: this device, applied at once, kept in step across tabs ----------

export type UiLocale = 'zh-CN' | 'en';

/** What the bar over selected text can hold: the highlight colours and the actions. */
export type SelectionBarItem = 'colors' | 'comment' | 'translate' | 'explain' | 'ask' | 'copy';

export interface SelectionBarPrefs {
  /** Every item, in the order shown. */
  order: SelectionBarItem[];
  /** Items left out of the bar. */
  hidden: SelectionBarItem[];
  look: SelectionMenuLook;
}

export const DEFAULT_SELECTION_BAR: SelectionBarPrefs = {
  order: ['colors', 'comment', 'translate', 'explain', 'ask', 'copy'],
  hidden: [],
  look: 'text',
};

export interface Preferences {
  elementDetection: boolean;
  detectPictures: boolean;
  detectTables: boolean;
  detectFormulas: boolean;
  formulaPreprocess: boolean;
  formulaPreprocessLimit: number;
  formulaCopyMode: 'formula' | 'image';
  tableCopyFormat: 'image' | 'markdown' | 'latex' | 'excel';
  /** Default target for new PDF and selection translations; independent of AI answers. */
  translationLanguage: import('@/translation/languages').TranslationLanguage;
  theme: 'system' | 'light' | 'dark';
  pdfTheme: 'auto' | 'original' | 'dark' | 'black' | 'sepia';
  pdfScroll: 'vertical' | 'horizontal' | 'page';
  pdfSpread: 'none' | 'odd' | 'even';
  /** Interface language. */
  locale: UiLocale;
  /** Language of AI answers; only affects tasks started afterwards. */
  answerLanguage: UiLocale;
  /** 14–24, default 16: reading text in panels, notes and answers. Not the toolbar, not PDF zoom. */
  uiFontSize: number;
  /** UI scale in percent; independent of the PDF coordinate system. */
  uiScale: number;
  /** 14–24, or null to follow uiFontSize. */
  translationFontSize: number | null;
  /** How copied formulas are delimited: \(…\) \[…\], $…$ $$…$$, or bare LaTeX. */
  mathDelimiter: 'brackets' | 'dollars' | 'none';
  /** The bar over selected text and highlights: what it shows, in what order, and how. */
  selectionBar: SelectionBarPrefs;
}

export interface PreferencesState {
  preferences: Preferences;
  local: LocalSaveState;
  /** Why the last save failed; the new value stays in effect on this page. */
  error?: string;
}

export const DEFAULT_PREFERENCES: Preferences = {
  elementDetection: true, detectPictures: true, detectTables: true, detectFormulas: true,
  formulaPreprocess: true, formulaPreprocessLimit: 45,
  formulaCopyMode: 'formula', tableCopyFormat: 'image',
  theme: 'system',
  pdfTheme: 'auto',
  pdfScroll: 'vertical',
  pdfSpread: 'none',
  locale: 'zh-CN',
  answerLanguage: 'zh-CN',
  translationLanguage: 'zh-CN',
  uiFontSize: 16,
  uiScale: 100,
  translationFontSize: null,
  mathDelimiter: 'brackets',
  selectionBar: DEFAULT_SELECTION_BAR,
};

export const UI_SCALE = { min: 80, max: 150, default: 100, step: 10 } as const;

export const FONT_SIZE = { min: 14, max: 24, default: 16 } as const;

// ---- B. Configuration: one draft, saved as a whole against a revision ----------------

export type Protocol = 'openai-responses' | 'openai-chat' | 'anthropic' | 'gemini';

/** A stored secret is never read back: keep it, clear it, or replace it with a new one. */
export type SecretEdit = { kind: 'keep' } | { kind: 'clear' } | { kind: 'replace'; value: string };

export interface EndpointView {
  presetId?: string;
  id: string;
  name: string;
  protocol: Protocol;
  baseUrl: string;
  hasKey: boolean;
}
export interface EndpointDraft extends Omit<EndpointView, 'hasKey'> {
  /** Was there a saved key when the draft started (for the "已设置" hint). */
  hadKey: boolean;
  key: SecretEdit;
}

export type ReasoningCapability =
  | { kind: 'unknown' | 'auto' | 'toggle' }
  | { kind: 'none' }
  | { kind: 'effort'; values: readonly string[] }
  | { kind: 'budget'; minTokens: number; maxTokens: number; presets: readonly number[] };

export type ReasoningChoice = { kind: 'default' } | { kind: 'effort'; value: string } | { kind: 'budget'; tokens: number };

export interface ModelConfigView {
  inputLimit?: number;
  maxOutputTokens?: number;
  protocolOverride?: Protocol;
  defaultReasoning?: string;
  visionKnown?: boolean;
  catalogRef?: { provider: string; modelId: string; updatedAt: string };
  metadataSource?: 'catalog' | 'endpoint' | 'manual';
  overrides?: string[];
  /** Known capacity; unknown models use a conservative runtime budget without inventing metadata. */
  contextWindow?: number;
  id: string;
  endpointId: string;
  /** The id sent to the endpoint. */
  modelId: string;
  label: string;
  vision: boolean;
  reasoning: ReasoningCapability;
  showInDiscussion: boolean;
}

/** AI features. "ai-highlight" is the AI's own marking, not the toolbar's highlight-on-select tool. */
export type FeatureId = 'translate' | 'explain' | 'discuss' | 'overview' | 'ai-highlight' | 'cite';

export interface FeatureRouteView {
  feature: FeatureId;
  enabled: boolean;
  /** null: the global default model. */
  modelId: string | null;
  reasoning: ReasoningChoice;
  activeProfileId: string;
}

export interface PromptProfileView {
  id: string;
  feature: FeatureId;
  name: string;
  text: string;
  readonly: boolean;
}

export interface RuntimeConfig {
  /** 10–900. */
  timeoutSec: number;
  /** 1–12. */
  concurrency: number;
  /** null: the model's own default. */
  maxOutputTokens: number | null;
  /** LLM translation only. Missing values use conservative defaults. */
  translation?: { batchSentences: number; batchCharacters: number; requestsPerMinute: number };
}

export interface SyncConfigView {
  enabled: boolean;
  webdavUrl: string;
  username: string;
  hasPassword: boolean;
  uploadPdfs: boolean;
}
export interface SyncConfigDraft extends Omit<SyncConfigView, 'hasPassword'> {
  hadPassword: boolean;
  password: SecretEdit;
}

export interface SettingsView {
  revision: string;
  endpoints: readonly EndpointView[];
  models: readonly ModelConfigView[];
  defaultModelId: string | null;
  features: readonly FeatureRouteView[];
  prompts: readonly PromptProfileView[];
  runtime: RuntimeConfig;
  sync: SyncConfigView;
}

/** What the settings page edits: the snapshot with secrets as edits. */
export interface SettingsDraft extends Omit<SettingsView, 'revision' | 'endpoints' | 'sync'> {
  endpoints: EndpointDraft[];
  sync: SyncConfigDraft;
}

export interface SettingsProblem {
  /** Dotted path into the draft, e.g. "runtime.timeoutSec" or "models.3.reasoning". */
  path: string;
  message: string;
}

export type SaveSettingsResult =
  | { ok: true; value: SettingsView }
  | { ok: false; reason: 'conflict'; latest: SettingsView }
  | { ok: false; reason: 'invalid'; problems: readonly SettingsProblem[] }
  | { ok: false; reason: 'permission-denied' | 'save-failed' | 'busy'; message: string };

// ---- D. Status shared by the settings page, quick settings and the popup ----------------

export interface StatusSummary {
  local: LocalSaveState;
  sync: SyncState;
  /** Only moves on a successful sync. */
  lastSyncedAt: string | null;
  /** "configured" means there is a setup new tasks can use, not that it was just checked. */
  modelAvailability: 'checking' | 'unconfigured' | 'configured' | 'unavailable';
  modelLabel?: string;
  modelMessage?: string;
  settingsState?: 'loading' | 'ready' | 'failed';
  /** A saved sync configuration alone never implies that a sync engine has run. */
  syncImplemented?: boolean;
  syncConfigured?: boolean;
  syncMessage?: string;
}

export type SettingsSection = 'general' | 'models' | 'features' | 'sync' | 'advanced' | 'privacy';

/** Turns a saved snapshot into an editable draft: every secret starts as "keep". */
export function toDraft(view: SettingsView): SettingsDraft {
  const { revision: _revision, endpoints, sync, ...rest } = view;
  const { hasPassword, ...syncRest } = sync;
  return {
    ...rest,
    endpoints: endpoints.map(({ hasKey, ...endpoint }) => ({ ...endpoint, hadKey: hasKey, key: { kind: 'keep' } })),
    sync: { ...syncRest, hadPassword: hasPassword, password: { kind: 'keep' } },
  };
}
