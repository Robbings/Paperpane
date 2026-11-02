import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { ModelSettingsStore } from '@/data/model-settings';

// 首次使用：欢迎弹窗看过没有、配置引导走完没有。只记在本机，不同步。

const KEY = 'onboarding';

export interface OnboardingState {
  /** The welcome has been shown (or is not needed); it never opens again on its own. */
  welcomed: boolean;
  /** The setup guide was finished or skipped at least once. */
  guided: boolean;
}

const known = (value: unknown): OnboardingState | null => {
  if (!value || typeof value !== 'object') return null;
  const v = value as Partial<OnboardingState>;
  return { welcomed: v.welcomed === true, guided: v.guided === true };
};

export async function readOnboarding(): Promise<OnboardingState | null> {
  return known((await browser.storage.local.get(KEY))[KEY]);
}

export async function markOnboarding(patch: Partial<OnboardingState>): Promise<void> {
  const current = (await readOnboarding()) ?? { welcomed: false, guided: false };
  await browser.storage.local.set({ [KEY]: { ...current, ...patch } });
}

/**
 * Whether this page should greet: only the first extension page opened after
 * installing. Someone who already has models (an update, a restored backup)
 * is past the welcome and is not asked.
 */
export async function shouldWelcome(): Promise<boolean> {
  const state = await readOnboarding();
  if (state) return !state.welcomed;
  const db = new ModelSettingsStore();
  try {
    if ((await db.view()).models.length > 0) {
      await markOnboarding({ welcomed: true });
      return false;
    }
  } finally {
    await db.close();
  }
  return true;
}

/** The settings page address that starts the setup guide. */
export const GUIDE_URL = '/options.html?guide=1#models';

/** Opens the welcome once per install; `welcome` stays false where reading fails. */
export function useWelcome() {
  const [welcome, setWelcome] = useState(false);
  useEffect(() => {
    let active = true;
    // The guide link itself counts as having been welcomed.
    if (new URLSearchParams(location.search).has('guide')) {
      void markOnboarding({ welcomed: true }).catch(() => {});
      return;
    }
    void shouldWelcome()
      .then((show) => active && setWelcome(show))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const close = () => {
    setWelcome(false);
    void markOnboarding({ welcomed: true }).catch(() => {});
  };
  return { welcome, close };
}
