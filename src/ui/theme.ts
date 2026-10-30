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
 * size (panels, notes, answers) and UI size. PDF geometry stays in CSS pixels.
 */
export function applyAppearance(preferences: { theme: ThemeMode; uiFontSize: number; uiScale?: number }): void {
  applyTheme(preferences.theme);
  const root = document.documentElement;
  root.style.fontSize = `${16 * (preferences.uiScale ?? 100) / 100}px`;
  root.style.setProperty('--pp-read-scale', String(readingScale(preferences.uiFontSize)));
  delete root.dataset.dimPages;
}
