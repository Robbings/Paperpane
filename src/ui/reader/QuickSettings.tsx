import type { RefObject } from 'react';
import { Button, Popover, Segmented, Select, Stepper, type SelectOption } from '@/ui/components';
import { fontSizeLabel, localeOptions, themeOptions } from '@/ui/settings/options';
import { StatusLine } from '@/ui/settings/StatusLine';
import { FONT_SIZE, UI_SCALE, type Preferences, type SettingsSection, type StatusSummary } from '@/ui/settings/types';

/** What the reader's quick settings need; the rest lives on the settings page. */
export interface ReaderSettingsProps {
  preferences: Preferences;
  onPreference: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  /** Models new tasks can use, for the default-model picker. */
  models: readonly SelectOption<string>[];
  defaultModelId: string | null;
  /** Changes only the default model, saved at once against the current settings revision. */
  onDefaultModel: (modelId: string) => void;
  status: StatusSummary;
  /** Opens the settings page, at a section if given. */
  onOpenSettings: (section?: SettingsSection) => void;
}

interface QuickSettingsProps extends ReaderSettingsProps {
  anchorRef: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
}

/**
 * The toolbar's settings: only what is adjusted while reading. Every change
 * applies at once; models, keys, prompts and sync are on the settings page.
 */
export function QuickSettings({ anchorRef, open, onClose, ...props }: QuickSettingsProps) {
  const p = props.preferences;
  const go = (section?: SettingsSection) => {
    props.onOpenSettings(section);
    onClose();
  };

  return (
    <Popover anchorRef={anchorRef} open={open} onClose={onClose} label="阅读设置" placement="bottom" width={312} className="pp-quick">
      <div className="pp-quick__rows">
        <div className="pp-quick__row">
          <span className="pp-quick__label">主题</span>
          <Segmented label="主题" size="sm" options={themeOptions} value={p.theme} onChange={(theme) => props.onPreference('theme', theme)} />
        </div>
        <div className="pp-quick__row">
          <span className="pp-quick__label">界面大小</span>
          <Stepper label="界面大小" value={p.uiScale} min={UI_SCALE.min} max={UI_SCALE.max} step={UI_SCALE.step} resetValue={UI_SCALE.default} format={(value) => `${value}%`} onChange={(value) => props.onPreference('uiScale', value)} />
        </div>
        <div className="pp-quick__row">
          <span className="pp-quick__label">阅读字号</span>
          <Stepper label="阅读字号" value={p.uiFontSize} min={FONT_SIZE.min} max={FONT_SIZE.max} format={fontSizeLabel} onChange={(size) => props.onPreference('uiFontSize', size)} />
        </div>
        <div className="pp-quick__row">
          <span className="pp-quick__label">回答语言</span>
          <Segmented label="回答语言" size="sm" options={localeOptions} value={p.answerLanguage} onChange={(language) => props.onPreference('answerLanguage', language)} />
        </div>
        <div className="pp-quick__row">
          <span className="pp-quick__label">默认模型</span>
          {props.models.length > 0 ? (
            <Select
              label="默认模型"
              size="sm"
              className="pp-quick__model"
              options={props.models}
              value={props.defaultModelId}
              placeholder="未选择"
              onChange={props.onDefaultModel}
            />
          ) : (
            <Button size="sm" variant="quiet" onClick={() => go('models')}>
              去配置模型
            </Button>
          )}
        </div>
      </div>

      <div className="pp-quick__foot">
        <StatusLine status={props.status} onOpen={go} />
        <Button size="sm" variant="quiet" className="pp-quick__all" onClick={() => go()}>
          全部设置…
        </Button>
      </div>
    </Popover>
  );
}
