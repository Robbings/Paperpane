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

/** The reading-text scale for a font size preference: 16 is the designed size. */
export const readingScale = (fontSize: number) => fontSize / 16;

/**
 * Applies the appearance preferences to the current page: theme, reading text
 * size (panels, notes, answers; not the toolbar or the PDF) and page dimming.
 */
export function applyAppearance(preferences: { theme: ThemeMode; uiFontSize: number; dimPagesInDark: boolean }): void {
  applyTheme(preferences.theme);
  const root = document.documentElement;
  root.style.setProperty('--pp-read-scale', String(readingScale(preferences.uiFontSize)));
  if (preferences.dimPagesInDark) delete root.dataset.dimPages;
  else root.dataset.dimPages = 'off';
}
