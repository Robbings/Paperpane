import type { SegmentedOption } from '@/ui/components';
import type { Preferences, UiLocale } from './types';

// 设置项的选项文字，设置页和阅读器快速设置共用，保证两处说法一致。

export const themeOptions: SegmentedOption<Preferences['theme']>[] = [
  { value: 'system', label: '跟随系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
];

export const localeOptions: SegmentedOption<UiLocale>[] = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en', label: 'English' },
];

export const mathOptions: SegmentedOption<Preferences['mathDelimiter']>[] = [
  { value: 'brackets', label: '\\[ \\]' },
  { value: 'dollars', label: '$$ $$' },
  { value: 'none', label: '不加' },
];

/** Reading text size keeps the existing preference scale (16 = designed size). */
export const fontSizeLabel = (size: number) => String(size);
