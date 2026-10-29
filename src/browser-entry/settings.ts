import { browser } from 'wxt/browser';
import { browserEntryDefaults, type BrowserEntrySettings } from './pdf';

export const BROWSER_ENTRY_KEY = 'browserEntry';
export function normalizeBrowserSettings(raw: unknown): BrowserEntrySettings {
  const value = raw && typeof raw === 'object' ? raw as Partial<BrowserEntrySettings> : {};
  return {
    autoOpenPdf: typeof value.autoOpenPdf === 'boolean' ? value.autoOpenPdf : browserEntryDefaults.autoOpenPdf,
    showPdfButtons: typeof value.showPdfButtons === 'boolean' ? value.showPdfButtons : browserEntryDefaults.showPdfButtons,
  };
}
export async function readBrowserSettings(): Promise<BrowserEntrySettings> {
  if (!browser.runtime?.id) return normalizeBrowserSettings(JSON.parse(localStorage.getItem(BROWSER_ENTRY_KEY) ?? '{}'));
  return normalizeBrowserSettings((await browser.storage.local.get(BROWSER_ENTRY_KEY))[BROWSER_ENTRY_KEY]);
}
export function subscribeBrowserSettings(listener: (value: BrowserEntrySettings) => void): () => void {
  if (!browser.runtime?.id) return () => {};
  const onChange: Parameters<typeof browser.storage.onChanged.addListener>[0] = (changes, area) => {
    if (area === 'local' && changes[BROWSER_ENTRY_KEY]) listener(normalizeBrowserSettings(changes[BROWSER_ENTRY_KEY].newValue));
  };
  browser.storage.onChanged.addListener(onChange);
  return () => browser.storage.onChanged.removeListener(onChange);
}
