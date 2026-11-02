import { useEffect } from 'react';
import { Checkbox, Segmented, Select, Stepper, Switch, toast } from '@/ui/components';
import { SettingGroup, SettingRow } from '../SettingRow';
import { SelectionBarSettings } from './SelectionBarSettings';
import { BrowserEntrySection } from './BrowserEntrySection';
import { fontSizeLabel, localeOptions, themeOptions } from '../options';
import { FONT_SIZE, UI_SCALE, type Preferences, type PreferencesState } from '../types';

interface GeneralSectionProps {
  state: PreferencesState;
  onPreference: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  onRetry?: () => void;
}

/** Preferences for this device. Each change applies at once and is saved on its own. */
export function GeneralSection({ state, onPreference, onRetry }: GeneralSectionProps) {
  const p = state.preferences;
  // A failed save is said once, with a retry, like every other error on these pages.
  useEffect(() => {
    if (state.local !== 'failed') return;
    toast.show({ tone: 'error', message: `偏好没能保存${state.error ? `：${state.error}` : ''}`, action: onRetry ? { label: '重试', onAction: onRetry } : undefined });
  }, [state.local, state.error]); // once per failure
  // Formula copying is one choice: an image, or LaTeX with the chosen delimiters.
  const formulaCopy = p.formulaCopyMode === 'image' ? 'image' : p.mathDelimiter;
  const detect = (key: 'detectPictures' | 'detectTables' | 'detectFormulas', label: string) => (
    <Checkbox label={label} checked={p[key]} disabled={!p.elementDetection} onChange={(v) => onPreference(key, v)} />
  );
  return (
    <>
      <SettingGroup title="外观">
        <SettingRow label="主题">
          <Segmented label="主题" size="sm" options={themeOptions} value={p.theme} onChange={(theme) => onPreference('theme', theme)} />
        </SettingRow>
        <SettingRow label="界面大小">
          <Stepper label="界面大小" value={p.uiScale} min={UI_SCALE.min} max={UI_SCALE.max} step={UI_SCALE.step} resetValue={UI_SCALE.default} format={(value) => `${value}%`} onChange={(value) => onPreference('uiScale', value)} />
        </SettingRow>
        <SettingRow label="插件内容字号" hint="译文、批注、笔记、概览和回答的文字大小；不影响论文本身">
          <Stepper label="插件内容字号" value={p.uiFontSize} min={FONT_SIZE.min} max={FONT_SIZE.max} format={fontSizeLabel} onChange={(size) => onPreference('uiFontSize', size)} />
        </SettingRow>
      </SettingGroup>

      <SettingGroup title="语言">
        <SettingRow label="界面语言">
          <Segmented label="界面语言" size="sm" options={localeOptions} value={p.locale} onChange={(locale) => onPreference('locale', locale)} />
        </SettingRow>
        <SettingRow label="回答语言" hint="解释、提问和概览用的语言；翻译的目标语言在「翻译」里设置">
          <Segmented label="回答语言" size="sm" options={localeOptions} value={p.answerLanguage} onChange={(language) => onPreference('answerLanguage', language)} />
        </SettingRow>
      </SettingGroup>

      <BrowserEntrySection />

      <SettingGroup title="选中文字">
        <SelectionBarSettings value={p.selectionBar} onChange={(bar) => onPreference('selectionBar', bar)} />
      </SettingGroup>

      <SettingGroup title="论文元素">
        <SettingRow label="自动识别" hint="打开论文时找出其中的图片、表格和公式，便于框选、复制和解释">
          <Switch hideLabel label="自动识别论文元素" checked={p.elementDetection} onChange={(v) => onPreference('elementDetection', v)} />
        </SettingRow>
        {p.elementDetection && (
          <SettingRow label="识别内容">
            <span className="pp-set-checks">
              {detect('detectPictures', '图片')}
              {detect('detectTables', '表格')}
              {detect('detectFormulas', '公式')}
            </span>
          </SettingRow>
        )}
        <SettingRow label="表格复制为">
          <Select label="表格复制为" size="sm" value={p.tableCopyFormat} options={[{ value: 'image', label: '图片' }, { value: 'markdown', label: 'Markdown' }, { value: 'latex', label: 'LaTeX' }, { value: 'excel', label: 'Excel' }]} onChange={(v) => onPreference('tableCopyFormat', v)} />
        </SettingRow>
        <SettingRow label="公式复制为">
          <Select
            label="公式复制为"
            size="sm"
            value={formulaCopy}
            options={[
              { value: 'brackets', label: 'LaTeX  \\( … \\)' },
              { value: 'dollars', label: 'LaTeX  $ … $' },
              { value: 'none', label: 'LaTeX（不加符号）' },
              { value: 'image', label: '图片' },
            ]}
            onChange={(v) => {
              if (v === 'image') onPreference('formulaCopyMode', 'image');
              else {
                onPreference('formulaCopyMode', 'formula');
                onPreference('mathDelimiter', v);
              }
            }}
          />
        </SettingRow>
        <SettingRow label="提前转写公式" hint="打开论文时用图像识别模型把公式转成 LaTeX 并缓存，复制和解释更快">
          <Switch hideLabel label="提前转写公式" checked={p.formulaPreprocess} disabled={!p.elementDetection || !p.detectFormulas} onChange={(v) => onPreference('formulaPreprocess', v)} />
        </SettingRow>
        {p.formulaPreprocess && p.elementDetection && p.detectFormulas && (
          <SettingRow label="每篇最多" hint="公式超过这个数量的论文不提前转写">
            <Stepper label="每篇最多转写公式数" value={p.formulaPreprocessLimit} min={5} max={100} step={5} format={(v) => `${v} 个`} onChange={(v) => onPreference('formulaPreprocessLimit', v)} />
          </SettingRow>
        )}
      </SettingGroup>
    </>
  );
}
