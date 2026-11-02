import { machineProvider, type MachineProvider, type MachineTranslator } from '../machine-providers';
import { translationLanguageLabel, type TranslationLanguage } from '../languages';
import { TranslationError, safeDetail } from '../errors';
import { type Adapter, type Api, type Credentials, incomplete } from './transport';
import { googleFree } from './google-free';
import { googleCloud } from './google-cloud';
import { microsoft } from './microsoft';
import { deepl } from './deepl';
import { baidu } from './baidu';
import { tencent } from './tencent';
import { alibaba } from './alibaba';
import { youdao } from './youdao';
import { volcengine } from './volcengine';

const adapters: Record<string, { send: Adapter; version: number }> = {
  'google-free': { send: googleFree, version: 1 },
  'google-cloud': { send: googleCloud, version: 1 },
  microsoft: { send: microsoft, version: 1 },
  deepl: { send: deepl, version: 1 },
  baidu: { send: baidu, version: 1 },
  tencent: { send: tencent, version: 1 },
  alibaba: { send: alibaba, version: 1 },
  youdao: { send: youdao, version: 1 },
  volcengine: { send: volcengine, version: 1 },
};
export function credentials(raw?: string): Credentials {
  if (!raw) return {};
  try {
    const data = JSON.parse(raw);
    return Object.fromEntries(
      Object.entries(data)
        .filter((pair): pair is [string, string] => typeof pair[1] === 'string')
        .map(([k, v]) => [k, v.trim()]),
    );
  } catch {
    return {};
  }
}
export function languageCode(provider: MachineProvider, language: string, source = false) {
  const table = source ? (provider.sourceLanguages ?? provider.languages) : provider.languages;
  const code = table[language as TranslationLanguage];
  if (!code)
    throw new TranslationError(
      provider.name +
        (source ? ' 不支持原文语言 ' : ' 不支持翻译到 ') +
        translationLanguageLabel(language) +
        '。',
      false,
      true,
    );
  return code;
}
export function createMachineTranslator(
  api: Api,
  secret: Credentials,
): MachineTranslator & { version: string } {
  const provider = machineProvider(api.kind),
    adapter = adapters[api.kind];
  if (!provider || !adapter) throw new Error('不支持这个翻译服务。');
  if (provider.fields.some((field) => field.secret && !secret[field.key]))
    throw new Error('请先在设置中填写 ' + (api.name || provider.name) + ' 的密钥。');
  return {
    kind: api.kind,
    version: api.kind + '-' + adapter.version,
    async translate(input) {
      input.signal.throwIfAborted();
      const from = input.from && input.from !== 'auto' ? languageCode(provider, input.from, true) : undefined;
      let translated: string[];
      try {
        translated = await adapter.send(api, secret, {
          ...input,
          from,
          to: languageCode(provider, input.to),
        });
      } catch (error) {
        if (!(error instanceof TranslationError)) throw error;
        const secrets = Object.values(secret);
        throw new TranslationError(
          safeDetail(error.message, secrets) ?? '翻译请求失败。',
          error.retryable,
          error.fatal,
          error.retryAfterMs,
          error.recovery,
          { ...error.diagnostics, code: safeDetail(error.diagnostics?.code, secrets) },
        );
      }
      input.signal.throwIfAborted();
      // Missing positions can only be trusted when the vendor explicitly supplied their indices.
      if (!Array.isArray(translated) || translated.length !== input.texts.length) throw incomplete();
      return translated.map((s) => (typeof s === 'string' ? s : ''));
    },
  };
}
