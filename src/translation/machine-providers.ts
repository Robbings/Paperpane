import { MACHINE_TRANSLATION_DEFAULTS, type MachineTranslationConfig, type RuntimeConfig } from '@/ui/settings/types';
import type { TranslationLanguage } from './languages';

// 机器翻译服务目录：每种服务的名称、需要填写的字段、单次请求的上限和语言代码。
// 设置页按这里生成表单、提示不支持的语言；请求适配器按 kind 实现 MachineTranslator，对外只暴露统一的 translate()。
// 无公开条数上限的服务使用保守批量值；供应商的字节限制在发送前另行计算。

/** Our language code → the service's. A language missing here cannot be translated into. */
export type LanguageCodes = Readonly<Partial<Record<TranslationLanguage, string>>>;

const sameCodes: LanguageCodes = {
  'zh-CN': 'zh-CN', 'zh-TW': 'zh-TW', en: 'en', ja: 'ja', ko: 'ko', fr: 'fr', de: 'de', es: 'es',
  pt: 'pt', it: 'it', ru: 'ru', ar: 'ar', hi: 'hi', id: 'id', vi: 'vi', tr: 'tr',
};
/** The usual short codes, with the two Chinese variants spelled per service. */
const shortCodes = (zh: string, zhTw: string, overrides: LanguageCodes = {}): LanguageCodes => ({ ...sameCodes, 'zh-CN': zh, 'zh-TW': zhTw, ...overrides });

export interface MachineField {
  key: string;
  label: string;
  /** Kept with the other credentials, never shown again once saved. */
  secret?: boolean;
  placeholder?: string;
  /** A fixed set of values (shown as a choice) instead of free text. */
  choices?: readonly { value: string; label: string }[];
  /** Used when the reader leaves it empty. */
  default?: string;
}

export interface MachineProvider {
  kind: string;
  name: string;
  /** Short, for the card: what the service is. */
  vendor: string;
  /** Brand colour for the monogram. */
  color: string;
  fields: readonly MachineField[];
  /** Characters one request may carry; the effective limit is the smaller of this and the setting. */
  maxCharacters: number;
  /** Texts one request may carry. */
  maxTexts: number;
  maxTextLength?: number;
  /** The service takes one text: several are sent joined by line breaks and split again on return. */
  joinLines?: boolean;
  /** Target language codes. */
  languages: LanguageCodes;
  /** Source language codes, where they differ from the target ones. Without a source, the service detects it. */
  sourceLanguages?: LanguageCodes;
  /** Takes a glossary of fixed term translations. */
  glossary?: boolean;
  /** Works without an account; may stop working without notice. */
  unofficial?: boolean;
}

export const machineProviders: readonly MachineProvider[] = [
  { kind: 'google-free', name: '谷歌翻译', vendor: 'Google · 免密钥', color: '#4285f4', fields: [], maxCharacters: 5000, maxTexts: 50, joinLines: true, languages: sameCodes, unofficial: true },
  {
    kind: 'google-cloud',
    name: 'Google Cloud 翻译',
    vendor: 'Google Cloud Translation v2',
    color: '#4285f4',
    fields: [{ key: 'apiKey', label: 'API Key', secret: true }],
    maxCharacters: 30000,
    maxTexts: 128,
    languages: sameCodes,
  },
  {
    kind: 'microsoft',
    name: '微软翻译',
    vendor: 'Azure AI Translator',
    color: '#0078d4',
    fields: [
      { key: 'apiKey', label: '密钥', secret: true },
      { key: 'region', label: '区域', placeholder: 'eastasia', default: 'global' },
    ],
    maxCharacters: 50000,
    maxTexts: 1000,
    languages: shortCodes('zh-Hans', 'zh-Hant'),
    glossary: true,
  },
  {
    kind: 'deepl',
    name: 'DeepL',
    vendor: 'DeepL API',
    color: '#0f2b46',
    fields: [
      { key: 'apiKey', label: 'Authentication Key', secret: true },
      { key: 'plan', label: '套餐', choices: [{ value: 'free', label: 'Free' }, { value: 'pro', label: 'Pro' }], default: 'free' },
    ],
    maxCharacters: 100000,
    maxTexts: 50,
    languages: { 'zh-CN': 'ZH-HANS', 'zh-TW': 'ZH-HANT', en: 'EN-US', ja: 'JA', ko: 'KO', fr: 'FR', de: 'DE', es: 'ES', pt: 'PT-BR', it: 'IT', ru: 'RU', ar: 'AR', hi: 'HI', vi: 'VI', id: 'ID', tr: 'TR' },
    sourceLanguages: { 'zh-CN': 'ZH', 'zh-TW': 'ZH', en: 'EN', ja: 'JA', ko: 'KO', fr: 'FR', de: 'DE', es: 'ES', pt: 'PT', it: 'IT', ru: 'RU', ar: 'AR', hi: 'HI', vi: 'VI', id: 'ID', tr: 'TR' },
    glossary: true,
  },
  {
    kind: 'baidu',
    name: '百度翻译',
    vendor: '百度翻译开放平台',
    color: '#2932e1',
    fields: [
      { key: 'appId', label: 'APP ID', secret: true },
      { key: 'secretKey', label: '密钥', secret: true },
    ],
    maxCharacters: 6000,
    maxTexts: 50,
    joinLines: true,
    languages: shortCodes('zh', 'cht', { ja: 'jp', ko: 'kor', fr: 'fra', es: 'spa', ar: 'ara', vi: 'vie' }),
  },
  {
    kind: 'tencent',
    name: '腾讯翻译',
    vendor: '腾讯云机器翻译',
    color: '#0052d9',
    fields: [
      { key: 'secretId', label: 'SecretId', secret: true },
      { key: 'secretKey', label: 'SecretKey', secret: true },
      { key: 'region', label: '地域', placeholder: 'ap-guangzhou', default: 'ap-guangzhou' },
    ],
    maxCharacters: 5999,
    maxTexts: 50,
    languages: shortCodes('zh', 'zh-TW'),
  },
  {
    kind: 'alibaba',
    name: '阿里翻译',
    vendor: '阿里云机器翻译',
    color: '#ff6a00',
    fields: [
      { key: 'accessKeyId', label: 'AccessKey ID', secret: true },
      { key: 'accessKeySecret', label: 'AccessKey Secret', secret: true },
      { key: 'region', label: '地域', placeholder: 'cn-hangzhou', default: 'cn-hangzhou' },
    ],
    maxCharacters: 8000,
    maxTextLength: 1000,
    maxTexts: 50,
    languages: shortCodes('zh', 'zh-tw'),
  },
  {
    kind: 'youdao',
    name: '有道翻译',
    vendor: '有道智云',
    color: '#e93d34',
    fields: [
      { key: 'appKey', label: '应用 ID', secret: true },
      { key: 'appSecret', label: '应用密钥', secret: true },
    ],
    maxCharacters: 5000,
    maxTexts: 50,
    languages: shortCodes('zh-CHS', 'zh-CHT'),
  },
  {
    kind: 'volcengine',
    name: '火山翻译',
    vendor: '火山引擎机器翻译',
    color: '#3370ff',
    fields: [
      { key: 'accessKeyId', label: 'Access Key ID', secret: true },
      { key: 'secretAccessKey', label: 'Secret Access Key', secret: true },
    ],
    maxCharacters: 5000,
    maxTexts: 16,
    languages: shortCodes('zh', 'zh-Hant'),
  },
];

export const machineProvider = (kind: string) => machineProviders.find((p) => p.kind === kind);

/** The target languages a service can translate into, in our codes. */
export const machineTargets = (kind: string) => Object.keys(machineProvider(kind)?.languages ?? {}) as TranslationLanguage[];

/** The one shape every machine translation service is called through; adapters hide each API's format and signing. */
export interface MachineTranslator {
  kind: string;
  /** Translates the texts in order and returns one translation per text. */
  translate(request: {
    texts: readonly string[];
    /** Source language; omitted to let the service detect it. */
    from?: string;
    to: string;
    glossary?: Readonly<Record<string, string>>;
    signal: AbortSignal;
  }): Promise<string[]>;
}

export const MACHINE_TRANSLATION_LIMITS = {
  concurrency: [1, 12],
  requestsPerMinute: [1, 600],
  maxCharacters: [500, 100000],
} as const;

/** The saved machine translation settings, with defaults for anything missing or out of range. */
export function machineTranslationSettings(runtime: RuntimeConfig): MachineTranslationConfig {
  const saved = runtime.machineTranslation;
  const number = (key: keyof typeof MACHINE_TRANSLATION_LIMITS) => {
    const value = saved?.[key], [min, max] = MACHINE_TRANSLATION_LIMITS[key];
    return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : MACHINE_TRANSLATION_DEFAULTS[key];
  };
  return {
    concurrency: number('concurrency'),
    requestsPerMinute: number('requestsPerMinute'),
    maxCharacters: number('maxCharacters'),
    protectSpans: saved?.protectSpans ?? MACHINE_TRANSLATION_DEFAULTS.protectSpans,
    useGlossary: saved?.useGlossary ?? MACHINE_TRANSLATION_DEFAULTS.useGlossary,
  };
}
