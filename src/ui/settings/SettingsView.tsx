import { useEffect, useMemo, useRef, useState } from 'react';
import { EmptyState, GlassSurface, Icon, ScrollArea, type IconName } from '@/ui/components';
import { SaveBar, type SaveBarState } from './SaveBar';
import { AdvancedSection, runtimeProblems } from './sections/AdvancedSection';
import { GeneralSection } from './sections/GeneralSection';
import { StatusLine } from './StatusLine';
import {
  toDraft,
  type Preferences,
  type PreferencesState,
  type SaveSettingsResult,
  type SettingsDraft,
  type SettingsSection,
  type SettingsView as SettingsSnapshot,
  type StatusSummary,
} from './types';
import './settings.css';

interface SettingsViewProps {
  section: SettingsSection;
  onSection: (section: SettingsSection) => void;
  /** A: applied and saved one field at a time. */
  preferences: PreferencesState;
  onPreference: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  onRetryPreferences?: () => void;
  /** B: the saved, redacted snapshot. The page edits a draft of it and saves the whole draft. */
  settings: SettingsSnapshot;
  onSave: (draft: SettingsDraft, baseRevision: string) => Promise<SaveSettingsResult>;
  status: StatusSummary;
}

const sections: { id: SettingsSection; label: string; icon: IconName; description: string }[] = [
  { id: 'general', label: '通用', icon: 'settings', description: '外观、语言和复制格式。只对这台设备生效，改了立即生效。' },
  { id: 'models', label: '模型', icon: 'model', description: '模型服务的地址和密钥，以及每个服务下可用的模型。' },
  { id: 'features', label: '功能', icon: 'explain', description: '翻译、解释、讨论、概览等功能是否开启，各用哪个模型和提示词。' },
  { id: 'sync', label: '同步与备份', icon: 'sync', description: '用 WebDAV 在设备之间同步，或导出一份备份。' },
  { id: 'advanced', label: '高级', icon: 'sliders', description: '超时、同时进行的请求数和输出长度。' },
  { id: 'privacy', label: '数据与隐私', icon: 'lock', description: '存储用量、操作记录、权限，以及数据会发到哪里。' },
];

/** Draft comparison that tells an emptied number field (NaN) apart from "use the default" (null). */
const fingerprint = (draft: SettingsDraft) => JSON.stringify(draft, (_key, value: unknown) => (typeof value === 'number' && Number.isNaN(value) ? 'NaN' : value));

/**
 * After a conflict: the parts of the draft this page changed, laid over the newer
 * settings; everything this page did not touch keeps the other window's values.
 */
function mergeOnto(latest: SettingsSnapshot, base: SettingsSnapshot, draft: SettingsDraft): SettingsDraft {
  const from = toDraft(base);
  const merged = toDraft(latest);
  for (const key of Object.keys(draft) as (keyof SettingsDraft)[]) {
    if (JSON.stringify(draft[key]) !== JSON.stringify(from[key])) Object.assign(merged, { [key]: draft[key] });
  }
  return merged;
}

/** Problems the page can find before saving; the logic layer checks everything again. */
const localProblems = (draft: SettingsDraft) => runtimeProblems(draft.runtime);

export function SettingsView(props: SettingsViewProps) {
  const { section, settings } = props;
  const [draft, setDraft] = useState<SettingsDraft>(() => toDraft(settings));
  const [base, setBase] = useState(settings);
  const [bar, setBar] = useState<SaveBarState | null>(null);
  const [problems, setProblems] = useState<ReadonlyMap<string, string>>(new Map());
  // A conflict's newer settings, kept until the reader chooses what to do.
  const latest = useRef<SettingsSnapshot | null>(null);

  const dirty = useMemo(() => fingerprint(draft) !== fingerprint(toDraft(base)), [draft, base]);

  // Saved elsewhere (another window, or the reader's quick default-model switch):
  // an untouched draft simply follows; a draft with changes stays, and saving will ask.
  useEffect(() => {
    if (settings.revision === base.revision) return;
    if (!dirty) {
      setDraft(toDraft(settings));
      setBase(settings);
    }
  }, [settings]); // only when the snapshot changes

  // The bar shows while there are changes; "已保存" lingers briefly after saving.
  useEffect(() => {
    if (!dirty && bar?.kind !== 'saved') setBar(null);
    else if (dirty && (bar === null || bar.kind === 'saved')) setBar({ kind: 'dirty' });
  }, [dirty]); // only when dirtiness flips
  useEffect(() => {
    if (bar?.kind !== 'saved') return;
    const timer = window.setTimeout(() => setBar(null), 1600);
    return () => window.clearTimeout(timer);
  }, [bar]);

  const edit = (next: SettingsDraft) => {
    setDraft(next);
    if (bar && bar.kind !== 'conflict' && bar.kind !== 'saving') setBar({ kind: 'dirty' });
  };

  const save = async (baseRevision: string, toSave: SettingsDraft = draft) => {
    const found = localProblems(toSave);
    if (found.length > 0) {
      setProblems(new Map(found.map((p) => [p.path, p.message])));
      setBar({ kind: 'invalid', count: found.length });
      return;
    }
    setProblems(new Map());
    setBar({ kind: 'saving' });
    const result = await props.onSave(toSave, baseRevision);
    if (result.ok) {
      latest.current = null;
      setBase(result.value);
      setDraft(toDraft(result.value));
      setBar({ kind: 'saved' });
    } else if (result.reason === 'conflict') {
      latest.current = result.latest;
      setBar({ kind: 'conflict' });
    } else if (result.reason === 'invalid') {
      setProblems(new Map(result.problems.map((p) => [p.path, p.message])));
      // Problems the page has no field for still get said, at the bar.
      const known = result.problems.filter((p) => p.path.startsWith('runtime.'));
      setBar({ kind: 'invalid', count: result.problems.length, message: known.length < result.problems.length ? result.problems[0]?.message : undefined });
    } else {
      setBar({ kind: 'failed', message: result.message });
    }
  };

  const discard = () => {
    setDraft(toDraft(base));
    setProblems(new Map());
    setBar(null);
  };

  const current = sections.find((item) => item.id === section)!;

  return (
    <div className="pp-settings">
      <GlassSurface as="aside" tone="panel" radius="panel" className="pp-settings__nav" aria-label="设置分类">
        <p className="pp-settings__brand">设置</p>
        <nav>
          {sections.map((item) => (
            <button
              key={item.id}
              type="button"
              className="pp-settings__nav-item"
              aria-current={item.id === section ? 'page' : undefined}
              onClick={() => props.onSection(item.id)}
            >
              <Icon name={item.icon} size={16} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <StatusLine status={props.status} className="pp-settings__status" onOpen={(target) => props.onSection(target)} />
      </GlassSurface>

      <main className="pp-settings__main">
        <ScrollArea className="pp-settings__scroll" viewportClassName="pp-settings__viewport">
          <div className="pp-settings__content">
            <header className="pp-settings__head">
              <h1>{current.label}</h1>
              <p>{current.description}</p>
            </header>
            {section === 'general' ? (
              <GeneralSection state={props.preferences} onPreference={props.onPreference} onRetry={props.onRetryPreferences} />
            ) : section === 'advanced' ? (
              <AdvancedSection runtime={draft.runtime} onChange={(runtime) => edit({ ...draft, runtime })} problems={problems} />
            ) : (
              <div className="pp-settings__pending">
                <EmptyState icon={current.icon} title="这一节下一步完成" description={current.description} />
              </div>
            )}
          </div>
        </ScrollArea>
        {bar && (
          <SaveBar
            state={bar}
            onSave={() => void save(base.revision)}
            onDiscard={discard}
            onReload={() => {
              const next = latest.current ?? settings;
              latest.current = null;
              setBase(next);
              setDraft(toDraft(next));
              setProblems(new Map());
              setBar(null);
            }}
            onOverwrite={() => {
              const next = latest.current;
              if (!next) return;
              const merged = mergeOnto(next, base, draft);
              setBase(next);
              setDraft(merged);
              void save(next.revision, merged);
            }}
          />
        )}
      </main>
    </div>
  );
}
