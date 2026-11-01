import { useEffect } from 'react';
import { Segmented, Select, Stepper, Switch, toast } from '@/ui/components';
import { SettingGroup, SettingRow } from '../SettingRow';
import { SelectionBarSettings } from './SelectionBarSettings';
import { BrowserEntrySection } from './BrowserEntrySection';
import { fontSizeLabel, localeOptions, mathOptions, themeOptions } from '../options';
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
  return (
    <>
      <SettingGroup title="外观">
        <SettingRow label="主题">
          <Segmented label="主题" size="sm" options={themeOptions} value={p.theme} onChange={(theme) => onPreference('theme', theme)} />
        </SettingRow>
        <SettingRow label="界面大小">
          <Stepper label="界面大小" value={p.uiScale} min={UI_SCALE.min} max={UI_SCALE.max} step={UI_SCALE.step} resetValue={UI_SCALE.default} format={(value) => `${value}%`} onChange={(value) => onPreference('uiScale', value)} />
        </SettingRow>
        <SettingRow label="插件内容字号" hint="译文、批注、笔记、概览和回答的文字大小；不影响论文页面">
          <Stepper
            label="插件内容字号"
            value={p.uiFontSize}
            min={FONT_SIZE.min}
            max={FONT_SIZE.max}
            format={fontSizeLabel}
            onChange={(size) => onPreference('uiFontSize', size)}
          />
        </SettingRow>
        <p className="pp-set-sample" style={{ fontSize: `calc(0.875rem * ${p.uiFontSize / 16})` }} aria-hidden="true">
          A layout-aware procedure groups glyphs into blocks. 按版面把字形分组成块，再排出阅读顺序。
        </p>
      </SettingGroup>

      <BrowserEntrySection />
      <SelectionBarSettings value={p.selectionBar} onChange={(bar) => onPreference('selectionBar', bar)} />

      <SettingGroup title="语言">
        <SettingRow label="界面语言">
          <Segmented label="界面语言" size="sm" options={localeOptions} value={p.locale} onChange={(locale) => onPreference('locale', locale)} />
        </SettingRow>
        <SettingRow label="回答语言" hint="解释、讨论和概览的回答语言；翻译的目标语言在「翻译」中设置">
          <Segmented label="回答语言" size="sm" options={localeOptions} value={p.answerLanguage} onChange={(language) => onPreference('answerLanguage', language)} />
        </SettingRow>
      </SettingGroup>

      <SettingGroup title="论文元素识别">
        <SettingRow label="自动识别"><Switch hideLabel label="自动识别论文元素" checked={p.elementDetection} onChange={v=>onPreference('elementDetection',v)}/></SettingRow>
        <SettingRow label="图片"><Switch hideLabel label="识别图片" checked={p.detectPictures} disabled={!p.elementDetection} onChange={v=>onPreference('detectPictures',v)}/></SettingRow>
        <SettingRow label="表格"><Switch hideLabel label="识别表格" checked={p.detectTables} disabled={!p.elementDetection} onChange={v=>onPreference('detectTables',v)}/></SettingRow>
        <SettingRow label="公式"><Switch hideLabel label="识别公式" checked={p.detectFormulas} disabled={!p.elementDetection} onChange={v=>onPreference('detectFormulas',v)}/></SettingRow>
        <SettingRow label="表格复制为"><Select label="表格复制为" size="sm" value={p.tableCopyFormat} options={[{value:'image',label:'图片'},{value:'markdown',label:'Markdown 表格'},{value:'latex',label:'LaTeX 表格'},{value:'excel',label:'Excel 表格'}]} onChange={v=>onPreference('tableCopyFormat',v)}/></SettingRow>
        <SettingRow label="公式复制为"><Select label="公式复制为" size="sm" value={p.formulaCopyMode} options={[{value:'formula',label:'LaTeX'},{value:'image',label:'图片'}]} onChange={v=>onPreference('formulaCopyMode',v)}/></SettingRow>
        <SettingRow label="公式复制格式" hint="复制公式时 LaTeX 外面加的符号：\\(…\\) 与 \\[…\\]、$…$ 与 $$…$$，或不加">
          <Segmented label="公式复制格式" size="sm" options={mathOptions} value={p.mathDelimiter} onChange={(format) => onPreference('mathDelimiter', format)} />
        </SettingRow>
        <SettingRow label="预处理公式" hint="公式数量不超过上限时，用图像识别模型提前转写并缓存"><Switch hideLabel label="预处理公式" checked={p.formulaPreprocess} disabled={!p.elementDetection||!p.detectFormulas} onChange={v=>onPreference('formulaPreprocess',v)}/></SettingRow>
        <SettingRow label="公式数量上限"><Stepper label="预处理公式数量上限" value={p.formulaPreprocessLimit} min={5} max={100} step={5} onChange={v=>onPreference('formulaPreprocessLimit',v)}/></SettingRow>
      </SettingGroup>
    </>
  );
}
