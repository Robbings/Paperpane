export type ThemeMode = 'system' | 'light' | 'dark';

/**
 * Applies the theme to the current page. Persisting the choice across pages
 * is a saved preference and is wired up by the logic layer later.
 */
export function applyTheme(mode: ThemeMode): void {
  const root = document.documentElement;
  if (mode === 'system') {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = mode;
  }
}
