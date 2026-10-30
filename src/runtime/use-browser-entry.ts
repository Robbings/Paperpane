import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { browserEntryDefaults, type BrowserEntrySettings } from '@/browser-entry/pdf';
import { BROWSER_ENTRY_KEY, readBrowserSettings, subscribeBrowserSettings } from '@/browser-entry/settings';

export function useBrowserEntry() {
  const [settings, setSettings] = useState(browserEntryDefaults);
  const [error, setError] = useState<string>();
  useEffect(() => {
    let alive = true, changed = false;
    const unsubscribe = subscribeBrowserSettings(value => { changed = true; if (alive) setSettings(value); });
    void readBrowserSettings().then(value => { if (alive && !changed) setSettings(value); }).catch(() => { if (alive) setError('浏览器入口设置读取失败，请重新打开。'); });
    return () => { alive = false; unsubscribe(); };
  }, []);
  async function save(patch: Partial<BrowserEntrySettings>) {
    setError(undefined);
    try {
      if (!browser.runtime?.id) {
        const next = { ...await readBrowserSettings(), ...patch };
        localStorage.setItem(BROWSER_ENTRY_KEY, JSON.stringify(next)); setSettings(next); return;
      }
      const result = await browser.runtime.sendMessage({ type: 'SET_BROWSER_ENTRY', patch });
      if (!result?.ok) throw new Error(result?.error ?? '设置未能保存。');
      setSettings(await readBrowserSettings());
    } catch (reason) { setError(reason instanceof Error ? reason.message : '设置未能保存，请重试。'); }
  }
  return { settings, save, error };
}
