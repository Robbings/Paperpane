import type { TranslationRun, TranslationSentence, SentenceTranslation } from '@/contracts/translation';
import type { ResolvedEngine } from './resolve';
import { savedEngineKey } from './resolve';
import { createLlmEngine, PROMPT_VERSION } from './engines/llm';
import { createMachineEngine } from './engines/machine';
import { llmTranslationSettings } from './settings';
import { languageCode } from './machine';

export function prepareTranslation(resolved: ResolvedEngine, language: string, sourceLanguage?: string) {
  const common = { configRevision: resolved.revision, language, sourceLanguage };
  if (resolved.kind === 'machine') {
    const { key, api, provider, adapterVersion, settings } = resolved;
    languageCode(provider, language);
    if (sourceLanguage && sourceLanguage !== 'auto') languageCode(provider, sourceLanguage, true);
    const profile: TranslationRun['profile'] = {
      ...common,
      engine: { kind: 'machine', key, apiId: api.id, apiKind: api.kind, adapterVersion },
      modelId: api.id,
      modelName: api.kind,
      endpointId: api.id,
      endpointUrl: '',
      protocol: 'machine',
      promptVersion: adapterVersion,
    };
    return {
      engine: createMachineEngine(resolved),
      profile,
      concurrency: settings.concurrency,
      rpm: settings.requestsPerMinute,
      characters: Math.min(provider.maxCharacters, settings.maxCharacters),
      sentences: provider.maxTexts,
      overhead: 20,
    };
  }
  const { connection: c, key } = resolved,
    runtime = c.view.runtime,
    settings = llmTranslationSettings(runtime);
  const profile: TranslationRun['profile'] = {
    ...common,
    engine: { kind: 'llm', key },
    modelId: c.model.id,
    modelName: c.model.modelId,
    endpointId: c.endpoint.id,
    endpointUrl: c.endpoint.baseUrl,
    protocol: c.endpoint.protocol,
    promptVersion: PROMPT_VERSION,
  };
  const characters = Math.min(
    settings.batchCharacters,
    runtime.maxOutputTokens ? Math.max(500, runtime.maxOutputTokens * 0.85) : Infinity,
  );
  return {
    engine: createLlmEngine(c),
    profile,
    concurrency: runtime.concurrency,
    rpm: settings.requestsPerMinute,
    characters,
    sentences: settings.batchSentences,
    overhead: 0,
  };
}

export function packBatches(selected: TranslationSentence[], limits: ReturnType<typeof prepareTranslation>) {
  const batches: TranslationSentence[][] = [];
  let size = 0;
  for (const sentence of selected) {
    const length = sentence.source.length + limits.overhead;
    let batch = batches.at(-1);
    if (
      !batch ||
      batch[0]!.anchor.pages[0]?.pageIndex !== sentence.anchor.pages[0]?.pageIndex ||
      batch.length >= limits.sentences ||
      size + length >= limits.characters
    ) {
      batch = [];
      batches.push(batch);
      size = 0;
    }
    batch.push(sentence);
    size += length;
  }
  return batches;
}

export function carryOutputs(
  latest: TranslationRun,
  sameEngine: boolean,
): Record<string, SentenceTranslation> {
  const outputs: Record<string, SentenceTranslation> = {};
  for (const [id, value] of Object.entries(latest.outputs)) {
    if (value.state === 'done' || sameEngine)
      outputs[id] = { ...value, engine: value.engine ?? savedEngineKey(latest.profile) };
  }
  return outputs;
}
