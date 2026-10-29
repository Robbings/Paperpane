import { useCallback, useEffect, useRef, useState } from 'react';
import { isTranslationLanguage } from '@/translation/languages';
import { PreferenceStore } from '@/data/preference-store';
import { applyAppearance } from '@/ui/theme';
import { DEFAULT_PREFERENCES, DEFAULT_SELECTION_BAR, FONT_SIZE, UI_SCALE, type Preferences, type PreferencesState } from '@/ui/settings/types';

function valid<K extends keyof Preferences>(key: K, value: unknown): value is Preferences[K] {
  switch (key) {
    case 'elementDetection': case 'detectPictures': case 'detectTables': case 'detectFormulas': case 'formulaPreprocess': return typeof value === 'boolean';
    case 'formulaPreprocessLimit': return typeof value === 'number' && Number.isInteger(value) && value >= 5 && value <= 100;
    case 'formulaCopyMode': return value === 'formula' || value === 'image';
    case 'tableCopyFormat': return ['image','markdown','latex','excel'].includes(String(value));
    case 'pdfTheme': return ['auto','original','dark','black','sepia'].includes(String(value));
    case 'pdfScroll': return ['vertical','horizontal','page'].includes(String(value));
    case 'pdfSpread': return ['none','odd','even'].includes(String(value));
    case 'theme':
      return value === 'system' || value === 'light' || value === 'dark';
    case 'locale':
    case 'answerLanguage':
      return value === 'zh-CN' || value === 'en';
    case 'translationLanguage':
      return isTranslationLanguage(value);
    case 'translationFontSize':
      return (
        value === null ||
        (typeof value === 'number' && Number.isInteger(value) && value >= FONT_SIZE.min && value <= FONT_SIZE.max)
      );
    case 'uiScale':
      return typeof value === 'number' && Number.isInteger(value) && value >= UI_SCALE.min && value <= UI_SCALE.max;
    case 'uiFontSize':
      return typeof value === 'number' && Number.isInteger(value) && value >= FONT_SIZE.min && value <= FONT_SIZE.max;
    case 'mathDelimiter':
      return value === 'brackets' || value === 'dollars' || value === 'none';
    case 'selectionBar': {
      if (typeof value !== 'object' || value === null) return false;
      const bar = value as { order?: unknown; hidden?: unknown; look?: unknown };
      const items = DEFAULT_SELECTION_BAR.order as readonly unknown[];
      const isList = (list: unknown) => Array.isArray(list) && list.every((item) => items.includes(item)) && new Set(list).size === list.length;
      return (
        isList(bar.order) &&
        (bar.order as unknown[]).length === items.length &&
        isList(bar.hidden) &&
        (bar.hidden as unknown[]).length < items.length &&
        ['text', 'icon', 'both', 'stacked', 'reveal'].includes(bar.look as string)
      );
    }
  }
  return false;
}

function normalize(value: Record<string, unknown>): Preferences {
  const preferences = { ...DEFAULT_PREFERENCES };
  for (const key of Object.keys(DEFAULT_PREFERENCES) as (keyof Preferences)[]) {
    if (valid(key, value[key])) Object.assign(preferences, { [key]: value[key] });
  }
  // Preserve the old target on upgrade; do not change a user's translation language.
  if (!isTranslationLanguage(value.translationLanguage) && isTranslationLanguage(value.answerLanguage)) preferences.translationLanguage = value.answerLanguage;
  return preferences;
}

interface Session {
  db: PreferenceStore;
  channel: BroadcastChannel;
  active: boolean;
  generation: number;
  writes: number;
  tail: Promise<void>;
  refresh: () => Promise<void>;
}

/** Real quick-setting preferences; model configuration stays a separate, unfinished service. */
export function useLocalPreferences() {
  const [state, setState] = useState<PreferencesState>({
    preferences: { ...DEFAULT_PREFERENCES },
    local: 'unmodified',
  });
  const current = useRef<Session | null>(null);

  useEffect(() => {
    const session: Session = {
      db: new PreferenceStore(),
      channel: new BroadcastChannel('paperpane-preferences'),
      active: true,
      generation: 0,
      writes: 0,
      tail: Promise.resolve(),
      refresh: async () => {},
    };
    current.current = session;
    session.refresh = async () => {
      if (!session.active || session.writes) return;
      const ticket = session.generation;
      try {
        const stored = await session.db.read();
        if (session.active && ticket === session.generation && !session.writes) {
          setState({ preferences: normalize(stored), local: 'saved' });
        }
      } catch {
        if (session.active && ticket === session.generation) {
          setState((previous) => ({ ...previous, local: 'failed', error: '无法读取本机偏好，请重新打开阅读器重试。' }));
        }
      }
    };
    session.channel.onmessage = () => {
      void session.tail.then(session.refresh);
    };
    const visible = () => {
      if (document.visibilityState === 'visible') void session.tail.then(session.refresh);
    };
    document.addEventListener('visibilitychange', visible);
    void session.refresh();
    return () => {
      session.active = false;
      session.channel.close();
      document.removeEventListener('visibilitychange', visible);
      if (current.current === session) current.current = null;
      void session.tail.then(() => session.db.close()).catch(() => {});
    };
  }, []);

  useEffect(() => {
    const theme = new URLSearchParams(location.search).get('theme');
    applyAppearance({
      ...state.preferences,
      theme: theme === 'light' || theme === 'dark' ? theme : state.preferences.theme,
    });
  }, [state.preferences]);

  const setPreference = useCallback(<K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    const session = current.current;
    if (!session?.active) return;
    if (!valid(key, value)) {
      setState((previous) => ({ ...previous, local: 'failed', error: '偏好值无效，请重新选择。' }));
      return;
    }
    const ticket = ++session.generation;
    session.writes++;
    setState((previous) => ({ preferences: { ...previous.preferences, [key]: value }, local: 'saving' }));
    session.tail = session.tail.then(async () => {
      try {
        const stored = await session.db.patch({ [key]: value });
        if (session.active) {
          session.channel.postMessage({ kind: 'invalidate' });
          if (ticket === session.generation) setState({ preferences: normalize(stored), local: 'saved' });
        }
      } catch {
        if (session.active && ticket === session.generation) {
          setState((previous) => ({
            ...previous,
            local: 'failed',
            error: '本机偏好保存失败，当前显示仍有效，请重试。',
          }));
        }
      } finally {
        session.writes--;
      }
    });
  }, []);

  return { state, setPreference };
}
