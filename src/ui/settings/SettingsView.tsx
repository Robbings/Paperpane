import { SyncPage } from './sections/SyncPage';
import { mergeDrafts, mergeOnto } from './merge-settings';
import { SettingsHeader } from './SettingsHeader';
import { ModelsSection } from './sections/ModelsSection';
import { TranslationSection, translationProblems } from './sections/TranslationSection';
import { useEffect, useRef, useState } from 'react';
import { Button, Dialog, GlassSurface, Icon, ScrollArea, type IconName } from '@/ui/components';
import { AutoSaveNote, SaveBar, type SaveBarState } from './SaveBar';
import { runtimeProblems } from './sections/AdvancedSection';
import { GeneralSection } from './sections/GeneralSection';
import { StatusLine } from './StatusLine';
import type { ServicePage } from './service-page';
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
  /** B: the saved, redacted snapshot. Changes are saved as a whole draft against its revision. */
  settings: SettingsSnapshot;
  onSave: (draft: SettingsDraft, baseRevision: string) => Promise<SaveSettingsResult>;
  status: StatusSummary;
  /** Starts the setup guide; its entry sits in the sidebar. */
  onGuide?: () => void;
  /** Changes when the provider picker should open on the models page. */
  addProviderRequest?: number;
}

const sections: { id: SettingsSection; label: string; icon: IconName }[] = [
  { id: 'general', label: '通用', icon: 'settings' },
  { id: 'models', label: '模型', icon: 'model' },
  { id: 'translation', label: '翻译', icon: 'translate' },
  { id: 'sync', label: '同步与备份', icon: 'sync' },
];

/** Draft comparison that tells an emptied number field (NaN) apart from "use the default" (null). */
const fingerprint = (draft: SettingsDraft) => JSON.stringify(draft, (_key, value: unknown) => (typeof value === 'number' && Number.isNaN(value) ? 'NaN' : value));
const same = (a: SettingsDraft, b: SettingsDraft) => fingerprint(a) === fingerprint(b);

/** Problems the page can find before saving; the logic layer checks everything again. */
const localProblems = (draft: SettingsDraft) => [...runtimeProblems(draft.runtime), ...translationProblems(draft)];

/** Wait after the last change before saving, so a run of clicks on a stepper is one save. */
const SAVE_DELAY = 400;

type Persisted = { ok: true } | { ok: false; state: SaveBarState };

export function SettingsView(props: SettingsViewProps) {
  const { section, settings } = props;
  // What is saved, and the settings as shown; they differ only between a change and its save.
  const [, setBase] = useState(settings);
  const [draft, setDraft] = useState<SettingsDraft>(() => toDraft(settings));
  const base = useRef(settings);
  const draftNow = useRef(draft);
  // An open service page's own changes, from the settings it started on.
  const [held, setHeldState] = useState<{ from: SettingsDraft; value: SettingsDraft } | null>(null);
  const heldNow = useRef(held);
  const setHeld = (next: typeof held) => {
    heldNow.current = next;
    setHeldState(next);
  };
  const [auto, setAuto] = useState<SaveBarState | null>(null);
  const [pageState, setPageState] = useState<SaveBarState | null>(null);
  const [problems, setProblems] = useState<ReadonlyMap<string, string>>(new Map());
  const [leaving, setLeaving] = useState<(() => void) | null>(null);
  // Bumped to close any open service page, e.g. when the guide starts.
  const [epoch, setEpoch] = useState(0);
  // Saves run one after another; a newer settings snapshot waits for them.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const busy = useRef(0);
  const timer = useRef<number | undefined>(undefined);
  const incoming = useRef(settings);
  incoming.current = settings;

  const show = (next: SettingsDraft) => {
    draftNow.current = next;
    setDraft(next);
  };
  const adopt = (next: SettingsSnapshot) => {
    base.current = next;
    setBase(next);
  };

  /** Takes settings saved elsewhere when nothing here is waiting to be saved. */
  const follow = () => {
    const next = incoming.current;
    if (busy.current || timer.current !== undefined || next.revision === base.current.revision) return;
    if (same(draftNow.current, toDraft(base.current))) {
      adopt(next);
      show(toDraft(next));
    }
  };
  useEffect(follow, [settings]);

  const run = <T,>(job: () => Promise<T>): Promise<T> => {
    busy.current++;
    const done = queue.current.then(job).finally(() => {
      busy.current--;
      follow();
    });
    queue.current = done.catch(() => {});
    return done;
  };

  /** Saves a whole draft; a save from another window in between is merged, this draft's changes kept. */
  const persist = async (next: SettingsDraft): Promise<Persisted> => {
    let sending = next;
    for (let attempt = 0; attempt < 3; attempt++) {
      const found = localProblems(sending);
      if (found.length) {
        setProblems(new Map(found.map((p) => [p.path, p.message])));
        return { ok: false, state: { kind: 'invalid', count: found.length } };
      }
      const result = await props.onSave(sending, base.current.revision);
      if (result.ok) {
        adopt(result.value);
        setProblems(new Map());
        return { ok: true };
      }
      if (result.reason === 'conflict') {
        sending = mergeOnto(result.latest, base.current, sending).merged;
        adopt(result.latest);
        continue;
      }
      if (result.reason === 'invalid') {
        setProblems(new Map(result.problems.map((p) => [p.path, p.message])));
        // Problems the page has no field for are still said, in the header.
        const known = result.problems.filter((p) => p.path.startsWith('runtime.') || p.path.startsWith('translationApis.'));
        return { ok: false, state: { kind: 'invalid', count: result.problems.length, message: known.length < result.problems.length ? result.problems[0]?.message : undefined } };
      }
      return { ok: false, state: { kind: 'failed', message: result.message } };
    }
    return { ok: false, state: { kind: 'failed', message: '设置在其他窗口接连改动，请稍后重试。' } };
  };

  const autoSave = () =>
    run(async () => {
      window.clearTimeout(timer.current);
      timer.current = undefined;
      const sent = draftNow.current;
      if (same(sent, toDraft(base.current))) {
        setAuto(null);
        return;
      }
      setAuto({ kind: 'saving' });
      const result = await persist(sent);
      if (!result.ok) {
        setAuto(result.state);
        return;
      }
      setAuto(null);
      const saved = toDraft(base.current);
      // Changed again while saving: keep the newer changes on top of what was saved.
      show(same(draftNow.current, sent) ? saved : mergeDrafts(sent, saved, draftNow.current).merged);
    });

  /** Settings outside service pages: shown at once, saved a moment later. */
  const edit = (next: SettingsDraft) => {
    show(next);
    window.clearTimeout(timer.current);
    timer.current = undefined;
    const found = localProblems(next);
    setProblems(new Map(found.map((p) => [p.path, p.message])));
    if (found.length) {
      setAuto({ kind: 'invalid', count: found.length });
      return;
    }
    if (auto?.kind === 'invalid') setAuto(null);
    timer.current = window.setTimeout(() => void autoSave(), SAVE_DELAY);
  };

  const pageDirty = !!held && !same(held.from, held.value);

  const savePage = () =>
    run(async () => {
      const page = heldNow.current;
      if (!page) return true;
      window.clearTimeout(timer.current);
      timer.current = undefined;
      const shown = draftNow.current;
      setPageState({ kind: 'saving' });
      const result = await persist(mergeDrafts(page.from, shown, page.value).merged);
      if (!result.ok) {
        setPageState(result.state);
        return false;
      }
      setHeld(null);
      setPageState({ kind: 'saved' });
      setAuto(null);
      show(toDraft(base.current));
      return true;
    });

  const discardPage = () => {
    setHeld(null);
    setPageState(null);
    setProblems(new Map());
  };

  const leave = (then: () => void) => {
    if (pageDirty) {
      setLeaving(() => then);
      return;
    }
    discardPage();
    then();
  };

  useEffect(() => {
    if (pageState?.kind !== 'saved') return;
    const id = window.setTimeout(() => setPageState(null), 1600);
    return () => window.clearTimeout(id);
  }, [pageState]);

  // Closing the tab: a change still waiting is saved now; a service page with changes asks.
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (timer.current !== undefined) void autoSave();
      if (pageDirty || timer.current !== undefined) event.preventDefault();
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  });

  const page: ServicePage = {
    value: held?.value ?? draft,
    dirty: pageDirty,
    edit: (next) => {
      setHeld({ from: heldNow.current?.from ?? draftNow.current, value: next });
      if (pageState?.kind !== 'saving') setPageState(null);
    },
    leave,
    discard: discardPage,
    bar: (
      <SaveBar
        state={pageState ?? (pageDirty ? { kind: 'dirty' } : { kind: 'clean' })}
        onSave={() => void savePage()}
        onDiscard={discardPage}
      />
    ),
  };

  const note = <AutoSaveNote state={auto} onRetry={() => void autoSave()} />;
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
              data-tour={`nav-${item.id}`}
              aria-current={item.id === section ? 'page' : undefined}
              onClick={() => leave(() => props.onSection(item.id))}
            >
              <Icon name={item.icon} size={16} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        {props.onGuide && (
          <button
            type="button"
            className="pp-settings__nav-item pp-settings__guide"
            onClick={() =>
              leave(() => {
                setEpoch((n) => n + 1);
                props.onGuide?.();
              })
            }
          >
            <Icon name="sliders" size={16} />
            <span>配置引导</span>
          </button>
        )}
        <StatusLine status={props.status} className="pp-settings__status" onOpen={(target) => leave(() => props.onSection(target))} />
      </GlassSurface>

      <main className="pp-settings__main">
        <ScrollArea className="pp-settings__scroll" viewportClassName="pp-settings__viewport">
          <div className="pp-settings__content">
            {section === 'models' ? (
              <ModelsSection key={epoch} draft={draft} onChange={edit} page={page} note={note} problems={problems} addRequest={props.addProviderRequest} />
            ) : section === 'translation' ? (
              <TranslationSection
                key={epoch}
                draft={draft}
                onChange={edit}
                page={page}
                note={note}
                problems={problems}
                preferences={props.preferences.preferences}
                onPreference={props.onPreference}
              />
            ) : (
              <>
                <SettingsHeader title={current.label} saveBar={note} />
                {section === 'general' ? (
                  <GeneralSection state={props.preferences} onPreference={props.onPreference} onRetry={props.onRetryPreferences} />
                ) : (
                  <SyncPage />
                )}
              </>
            )}
          </div>
        </ScrollArea>
      </main>

      <Dialog
        open={!!leaving}
        onClose={() => setLeaving(null)}
        title="保存这个服务的更改？"
        description="连接、密钥和模型的改动还没有保存。"
        footer={
          <>
            <Button variant="quiet" onClick={() => setLeaving(null)}>
              继续编辑
            </Button>
            <Button
              onClick={() => {
                const then = leaving;
                setLeaving(null);
                discardPage();
                then?.();
              }}
            >
              放弃更改
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                const then = leaving;
                setLeaving(null);
                void savePage().then((ok) => ok && then?.());
              }}
            >
              保存
            </Button>
          </>
        }
      />
    </div>
  );
}
