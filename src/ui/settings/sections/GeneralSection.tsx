import { Button, Segmented, Select, Stepper, Switch } from '@/ui/components';
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
  return (
    <>
      {state.local === 'failed' && (
        <div className="pp-set-notice" data-tone="danger" role="alert">
          <span>
            偏好没能保存{state.error ? `：${state.error}` : ''}。改动已在本页生效，关闭后会恢复原值。
          </span>
          {onRetry && (
            <Button size="sm" onClick={onRetry}>
              重试
            </Button>
          )}
        </div>
      )}

      <SettingGroup title="外观">
        <SettingRow label="主题" description="跟随系统时，随系统的浅色或深色模式切换。">
          <Segmented label="主题" size="sm" options={themeOptions} value={p.theme} onChange={(theme) => onPreference('theme', theme)} />
        </SettingRow>
        <SettingRow label="界面大小">
          <Stepper label="界面大小" value={p.uiScale} min={UI_SCALE.min} max={UI_SCALE.max} step={UI_SCALE.step} resetValue={UI_SCALE.default} format={(value) => `${value}%`} onChange={(value) => onPreference('uiScale', value)} />
        </SettingRow>
        <SettingRow label="阅读字号" description="译文、批注、笔记、概览和回答的文字大小。不影响工具栏，也不改变论文页面的缩放。">
          <Stepper
            label="阅读字号"
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
        <SettingRow label="回答语言" description="解释、讨论和概览使用的语言。翻译的默认目标语言在「功能 → 翻译」中设置；已有内容不会重写。">
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
        <SettingRow
          label="公式复制格式"
          description={
            <>
              从论文、笔记、解释和回答里复制公式时，LaTeX 外面加的符号。
              {p.mathDelimiter === 'brackets' ? ' 行内 \\(…\\)，独立一行 \\[…\\]。' : p.mathDelimiter === 'dollars' ? ' 行内 $…$，独立一行 $$…$$。' : ' 只复制 LaTeX 本身。'}
            </>
          }
        >
          <Segmented label="公式复制格式" size="sm" options={mathOptions} value={p.mathDelimiter} onChange={(format) => onPreference('mathDelimiter', format)} />
        </SettingRow>
        <SettingRow label="预处理公式" description="整篇不超过上限时，使用视觉模型提前转写并缓存。"><Switch hideLabel label="预处理公式" checked={p.formulaPreprocess} disabled={!p.elementDetection||!p.detectFormulas} onChange={v=>onPreference('formulaPreprocess',v)}/></SettingRow>
        <SettingRow label="公式数量上限"><Stepper label="预处理公式数量上限" value={p.formulaPreprocessLimit} min={5} max={100} step={5} onChange={v=>onPreference('formulaPreprocessLimit',v)}/></SettingRow>
      </SettingGroup>
    </>
  );
}
