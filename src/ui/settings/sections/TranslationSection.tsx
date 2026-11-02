import { useRef, useState, type ReactNode } from 'react';
import { TRANSLATION_LANGUAGES, translationLanguageLabel } from '@/translation/languages';
import { LLM_TRANSLATION_LIMITS, llmTranslationSettings } from '@/translation/settings';
import { MACHINE_TRANSLATION_LIMITS, machineProvider, machineTranslationSettings, type MachineProvider } from '@/translation/machine-providers';
import { Button, Dialog, EmptyState, IconButton, Segmented, Select, Spinner, Stepper, Switch, TextField, toast } from '@/ui/components';
import { testTranslationApi } from '@/runtime/model-settings-actions';
import { SAME_ENGINE, engineName, engineOptions, paperEngineValue, selectionChoice, selectionEngineValue, unsupportedLanguage } from '../engine-options';
import { SettingGroup, SettingRow } from '../SettingRow';
import { SettingsHeader } from '../SettingsHeader';
import { RUNTIME_LIMITS } from './AdvancedSection';
import { TranslatorList, TranslatorLogo, TranslatorPicker } from './translation/TranslatorParts';
import { FONT_SIZE, type Preferences, type SettingsDraft, type TranslationApiDraft } from '../types';
import './models/models.css';
import './models/model-detail.css';

interface TranslationSectionProps {
  draft: SettingsDraft;
  onChange: (draft: SettingsDraft) => void;
  problems: ReadonlyMap<string, string>;
  preferences: Preferences;
  onPreference: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  renderSaveBar: (layout: 'floating' | 'inline') => ReactNode;
}

const autoOptions = [
  { value: 'off', label: '关闭' },
  { value: 'on-add', label: '添加文档时' },
  { value: 'on-open', label: '打开时' },
] as const;

/** The secret fields typed so far in this draft (a replace edit carries them as JSON). */
const typedSecrets = (api: TranslationApiDraft): Record<string, string> => {
  if (api.secret.kind !== 'replace') return {};
  try {
    return JSON.parse(api.secret.value) as Record<string, string>;
  } catch {
    return {};
  }
};

/** Translation: the engine, when to translate on its own, request limits, and the machine translation services. */
export function TranslationSection({ draft, onChange, problems, preferences, onPreference, renderSaveBar }: TranslationSectionProps) {
  const [active, setActive] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState(false);
  const api = draft.translationApis.find((a) => a.id === active);

  const route = draft.features.find((f) => f.feature === 'translate') ?? {
    feature: 'translate' as const,
    enabled: true,
    modelId: null,
    reasoning: { kind: 'default' as const },
    activeProfileId: 'default',
  };
  const engine = draft.translationEngine ?? { kind: 'llm' as const };
  const engineValue = paperEngineValue(draft);
  const selectionValue = selectionEngineValue(draft);
  const setEngine = (value: string) => {
    if (value.startsWith('mt:')) onChange({ ...draft, translationEngine: { kind: 'machine', apiId: value.slice(3) } });
    else
      onChange({
        ...draft,
        translationEngine: { kind: 'llm' },
        features: [...draft.features.filter((f) => f.feature !== 'translate'), { ...route, modelId: value.slice(4) || null }],
      });
  };
  const options = engineOptions(draft);
  const selectionOptions = [{ value: SAME_ENGINE, label: '与全文相同', group: 'same' }, ...options];
  /** Shown on an engine row whose engine cannot translate into the default language. */
  const languageProblem = (value: string) =>
    unsupportedLanguage(options, value, preferences.translationLanguage)
      ? `${engineName(options, value)}不支持翻译到${translationLanguageLabel(preferences.translationLanguage)}`
      : undefined;

  const llm = llmTranslationSettings(draft.runtime);
  const setLlm = (patch: Partial<typeof llm>) => onChange({ ...draft, runtime: { ...draft.runtime, translation: { ...llm, ...patch } } });
  const machine = machineTranslationSettings(draft.runtime);
  const setMachine = (patch: Partial<typeof machine>) => onChange({ ...draft, runtime: { ...draft.runtime, machineTranslation: { ...machine, ...patch } } });

  const patchApi = (patch: Partial<TranslationApiDraft>) =>
    onChange({ ...draft, translationApis: draft.translationApis.map((a) => (a.id === active ? { ...a, ...patch } : a)) });
  const addApi = (provider: MachineProvider) => {
    const id = crypto.randomUUID();
    const options = Object.fromEntries(provider.fields.filter((f) => !f.secret && f.default).map((f) => [f.key, f.default!]));
    onChange({ ...draft, translationApis: [...draft.translationApis, { id, kind: provider.kind, name: provider.name, options, hadSecret: false, secret: { kind: 'keep' } }] });
    setAdding(false);
    setActive(id);
  };
  const removeApi = () => {
    onChange({
      ...draft,
      translationApis: draft.translationApis.filter((a) => a.id !== active),
      translationEngine: engine.kind === 'machine' && engine.apiId === active ? { kind: 'llm' } : draft.translationEngine,
      selectionTranslationEngine: selectionValue === `mt:${active}` ? { kind: 'same' } : draft.selectionTranslationEngine,
    });
    setRemoving(false);
    setActive(null);
  };

  if (api) {
    const provider = machineProvider(api.kind);
    const typed = typedSecrets(api);
    const setSecret = (key: string, value: string) => {
      const next = { ...typed, [key]: value };
      patchApi({ secret: Object.values(next).some(Boolean) ? { kind: 'replace', value: JSON.stringify(next) } : { kind: 'keep' } });
    };
    return (
      <>
        <SettingsHeader
          title={api.name || provider?.name || '翻译服务'}
          leading={
            <>
              <IconButton icon="chevronLeft" label="返回翻译" size="md" onClick={() => setActive(null)} />
              <TranslatorLogo kind={api.kind} size="sm" />
            </>
          }
          actions={<IconButton icon="trash" label="移除此服务" size="md" className="pp-model-remove" onClick={() => setRemoving(true)} />}
          saveBar={renderSaveBar('inline')}
        />
        <SettingGroup title="连接">
          <SettingRow label="服务名称">
            <TextField label="服务名称" hideLabel value={api.name} onChange={(name) => patchApi({ name })} />
          </SettingRow>
          {provider?.fields.map((field) =>
            field.secret ? (
              <SettingRow key={field.key} label={field.label} hint="只保存在本机，保存后不再显示" error={problems.get(`translationApis.${api.id}.secret`)}>
                <TextField
                    label={field.label}
                    hideLabel
                    type="password"
                    autoComplete="new-password"
                    value={typed[field.key] ?? ''}
                    placeholder={api.secret.kind === 'clear' ? '保存后清除' : api.hadSecret && api.secret.kind === 'keep' ? '已设置，留空保持不变' : field.placeholder ?? ''}
                    onChange={(value) => setSecret(field.key, value)}
                  />
              </SettingRow>
            ) : field.choices ? (
              <SettingRow key={field.key} label={field.label}>
                <Segmented
                  label={field.label}
                  size="sm"
                  options={field.choices}
                  value={api.options[field.key] ?? field.default ?? field.choices[0]!.value}
                  onChange={(value) => patchApi({ options: { ...api.options, [field.key]: value } })}
                />
              </SettingRow>
            ) : (
              <SettingRow key={field.key} label={field.label}>
                <TextField
                  label={field.label}
                  hideLabel
                  value={api.options[field.key] ?? ''}
                  placeholder={field.placeholder}
                  onChange={(value) => patchApi({ options: { ...api.options, [field.key]: value } })}
                />
              </SettingRow>
            ),
          )}
          <ConnectionCheck draft={draft} apiId={api.id} />
          {provider?.fields.some((f) => f.secret) && api.hadSecret && (
            <SettingRow label="清除密钥">
              <Button size="sm" variant="quiet" onClick={() => patchApi({ secret: { kind: 'clear' } })}>
                清除
              </Button>
            </SettingRow>
          )}
        </SettingGroup>
        <Dialog
          open={removing}
          onClose={() => setRemoving(false)}
          title={`移除「${api.name}」`}
          description="保存后生效；如果它是默认翻译引擎，会改用默认模型。"
          footer={
            <>
              <Button onClick={() => setRemoving(false)}>取消</Button>
              <Button variant="danger" onClick={removeApi}>
                移除
              </Button>
            </>
          }
        />
      </>
    );
  }

  return (
    <>
      <SettingsHeader title="翻译" saveBar={renderSaveBar('inline')} />

      <SettingGroup title="翻译">
        <SettingRow label="全文翻译引擎" hint="翻译本页和全文；可以选大模型，也可以选下面添加的翻译服务" error={languageProblem(engineValue)}>
          <Select label="全文翻译引擎" value={engineValue} options={options} onChange={setEngine} />
        </SettingRow>
        <SettingRow label="选区翻译引擎" hint="划选文字后的翻译" error={selectionValue === SAME_ENGINE ? undefined : languageProblem(selectionValue)}>
          <Select
            label="选区翻译引擎"
            value={selectionValue}
            options={selectionOptions}
            onChange={(value) => onChange({ ...draft, selectionTranslationEngine: selectionChoice(value) })}
          />
        </SettingRow>
        <SettingRow label="默认翻译到">
          <Select label="默认翻译到" value={preferences.translationLanguage} options={TRANSLATION_LANGUAGES} onChange={(v) => onPreference('translationLanguage', v)} />
        </SettingRow>
        <SettingRow label="自动翻译" hint="自动翻译会请求模型或翻译服务，可能产生费用">
          <Segmented label="自动翻译" size="sm" options={autoOptions} value={preferences.autoTranslate} onChange={(v) => onPreference('autoTranslate', v)} />
        </SettingRow>
        <SettingRow label="译文字号跟随内容字号">
          <Switch
            label="译文字号跟随内容字号"
            hideLabel
            checked={preferences.translationFontSize === null}
            onChange={(follow) => onPreference('translationFontSize', follow ? null : preferences.uiFontSize)}
          />
        </SettingRow>
        {preferences.translationFontSize !== null && (
          <SettingRow label="译文字号">
            <Stepper label="译文字号" value={preferences.translationFontSize} min={FONT_SIZE.min} max={FONT_SIZE.max} onChange={(v) => onPreference('translationFontSize', v)} />
          </SettingRow>
        )}
      </SettingGroup>

      <SettingGroup title="大模型翻译设置" collapsible>
        <SettingRow label="最大并发数" error={problems.get('runtime.concurrency')}>
          <Stepper
            label="最大并发数"
            value={draft.runtime.concurrency}
            min={RUNTIME_LIMITS.concurrency.min}
            max={RUNTIME_LIMITS.concurrency.max}
            onChange={(concurrency) => onChange({ ...draft, runtime: { ...draft.runtime, concurrency } })}
          />
        </SettingRow>
        <SettingRow label="每批句数" hint="同页相邻的句子合并成一次请求，仍按句保存">
          <Stepper label="每批句数" value={llm.batchSentences} min={LLM_TRANSLATION_LIMITS.batchSentences[0]} max={LLM_TRANSLATION_LIMITS.batchSentences[1]} onChange={(batchSentences) => setLlm({ batchSentences })} />
        </SettingRow>
        <SettingRow label="每批字符上限">
          <Stepper label="每批字符上限" value={llm.batchCharacters} min={LLM_TRANSLATION_LIMITS.batchCharacters[0]} max={LLM_TRANSLATION_LIMITS.batchCharacters[1]} step={500} onChange={(batchCharacters) => setLlm({ batchCharacters })} />
        </SettingRow>
        <SettingRow label="每分钟请求上限" hint="每项翻译任务各自计算，包括重试">
          <Stepper label="每分钟请求上限" value={llm.requestsPerMinute} min={LLM_TRANSLATION_LIMITS.requestsPerMinute[0]} max={LLM_TRANSLATION_LIMITS.requestsPerMinute[1]} onChange={(requestsPerMinute) => setLlm({ requestsPerMinute })} />
        </SettingRow>
      </SettingGroup>

      <SettingGroup title="机器翻译设置" collapsible>
        <SettingRow label="最大并发数">
          <Stepper label="机器翻译最大并发数" value={machine.concurrency} min={MACHINE_TRANSLATION_LIMITS.concurrency[0]} max={MACHINE_TRANSLATION_LIMITS.concurrency[1]} onChange={(concurrency) => setMachine({ concurrency })} />
        </SettingRow>
        <SettingRow label="每分钟请求上限">
          <Stepper label="机器翻译每分钟请求上限" value={machine.requestsPerMinute} min={MACHINE_TRANSLATION_LIMITS.requestsPerMinute[0]} max={MACHINE_TRANSLATION_LIMITS.requestsPerMinute[1]} step={10} onChange={(requestsPerMinute) => setMachine({ requestsPerMinute })} />
        </SettingRow>
        <SettingRow label="每次请求字符上限" hint="还会受各服务自己的上限限制">
          <Stepper label="每次请求字符上限" value={machine.maxCharacters} min={MACHINE_TRANSLATION_LIMITS.maxCharacters[0]} max={MACHINE_TRANSLATION_LIMITS.maxCharacters[1]} step={500} onChange={(maxCharacters) => setMachine({ maxCharacters })} />
        </SettingRow>
        <SettingRow label="保护公式与引用" hint="公式、引用编号和链接不送去翻译，原样放回">
          <Switch label="保护公式与引用" hideLabel checked={machine.protectSpans} onChange={(protectSpans) => setMachine({ protectSpans })} />
        </SettingRow>
        {/* 术语表还没有来源和管理界面，开关先不显示；useGlossary 仍保存在设置里。 */}
      </SettingGroup>

      <SettingGroup
        title="翻译服务"
        actions={
          <Button size="sm" variant="quiet" icon="plus" onClick={() => setAdding(true)}>
            添加翻译服务
          </Button>
        }
      >
        <TranslatorList apis={draft.translationApis} engineId={engine.kind === 'machine' ? engine.apiId : undefined} onSelect={setActive} />
        {!draft.translationApis.length && (
          <div className="pp-set-empty">
            <EmptyState icon="translate" title="还没有翻译服务" />
          </div>
        )}
      </SettingGroup>

      {adding && <TranslatorPicker onClose={() => setAdding(false)} onSelect={addApi} />}
    </>
  );
}

/** Translates a short text with the service as typed (saved or not) and reports how it went. */
function ConnectionCheck({ draft, apiId }: { draft: SettingsDraft; apiId: string }) {
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController>(undefined);
  const check = async () => {
    abort.current?.abort();
    const controller = (abort.current = new AbortController());
    setBusy(true);
    try {
      const result = await testTranslationApi(structuredClone(draft), apiId, controller.signal);
      toast.show({ tone: 'success', message: `连接正常 · ${Math.round(result.elapsedMs)} ms · ${result.text}`, duration: 4000 });
    } catch (e) {
      if (!controller.signal.aborted) toast.show({ tone: 'error', message: e instanceof Error ? e.message : '没能连上这个服务' });
    } finally {
      if (abort.current === controller) setBusy(false);
    }
  };
  return (
    <SettingRow label="检查连接" hint="翻译一句短文本，可能计费">
      {busy && <Spinner size={14} />}
      <Button size="sm" disabled={busy} onClick={() => void check()}>
        检查
      </Button>
    </SettingRow>
  );
}

/** Checks the page can make before saving: credentials typed in full. */
export function translationProblems(draft: SettingsDraft): { path: string; message: string }[] {
  return draft.translationApis.flatMap((api) => {
    const secrets = machineProvider(api.kind)?.fields.filter((f) => f.secret) ?? [];
    if (api.secret.kind !== 'replace') return [];
    const typed = typedSecrets(api);
    return secrets.some((f) => !typed[f.key]?.trim())
      ? [{ path: `translationApis.${api.id}.secret`, message: `请填写${secrets.map((f) => f.label).join('和')}。` }]
      : [];
  });
}
