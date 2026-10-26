import { useState } from 'react';
import { Button, Icon, SelectionMenu, Switch, type IconName, type SelectionMenuAction, type SelectionMenuLook } from '@/ui/components';
import { SettingGroup } from '../SettingRow';
import { DEFAULT_SELECTION_BAR, type SelectionBarItem, type SelectionBarPrefs } from '../types';

const items: Record<SelectionBarItem, { label: string; icon: IconName }> = {
  colors: { label: '高亮颜色', icon: 'marker' },
  comment: { label: '评论', icon: 'comment' },
  translate: { label: '翻译', icon: 'translate' },
  explain: { label: '解释', icon: 'explain' },
  ask: { label: '提问', icon: 'ask' },
  copy: { label: '复制', icon: 'copy' },
};

const actions: SelectionMenuAction[] = (['comment', 'translate', 'explain', 'ask', 'copy'] as const).map((id) => ({ id, ...items[id] }));

const looks: { look: SelectionMenuLook; label: string; note: string }[] = [
  { look: 'text', label: '文字', note: '默认。最紧凑。' },
  { look: 'icon', label: '图标', note: '最小；名称在悬停时显示。' },
  { look: 'both', label: '图标加文字', note: '最直观，条最宽。' },
  { look: 'stacked', label: '图标在上、文字在下', note: '像工具栏，条稍高。' },
  { look: 'reveal', label: '图标，悬停展开文字', note: '平时只有图标。' },
];

const DRAG = 'application/x-paperpane-selection-bar-item';

interface SelectionBarSettingsProps {
  value: SelectionBarPrefs;
  onChange: (value: SelectionBarPrefs) => void;
}

/** What the bar over selected text shows and in what order; how it shows them is folded away. */
export function SelectionBarSettings({ value, onChange }: SelectionBarSettingsProps) {
  const [dragging, setDragging] = useState<SelectionBarItem | null>(null);
  const [lookOpen, setLookOpen] = useState(false);
  const visible = value.order.filter((item) => !value.hidden.includes(item));

  const move = (item: SelectionBarItem, to: number) => {
    const order = value.order.filter((i) => i !== item);
    order.splice(Math.max(0, Math.min(to, order.length)), 0, item);
    onChange({ ...value, order });
  };
  const toggle = (item: SelectionBarItem, shown: boolean) =>
    onChange({ ...value, hidden: shown ? value.hidden.filter((i) => i !== item) : [...value.hidden, item] });
  const isDefault = JSON.stringify({ ...value, look: DEFAULT_SELECTION_BAR.look }) === JSON.stringify(DEFAULT_SELECTION_BAR);
  const currentLook = looks.find((l) => l.look === value.look) ?? looks[0]!;

  return (
    <SettingGroup title="选中文字后的浮动条" description="选择要显示的内容，拖动调整顺序。改动立即生效。">
      <div className="pp-set-selbar">
        <div className="pp-set-selbar__preview" aria-hidden="true" inert>
          <SelectionMenu label="预览" actions={actions} look={value.look} layout={visible} />
        </div>

        <ol className="pp-set-selbar__list">
          {value.order.map((item, index) => {
            const shown = !value.hidden.includes(item);
            return (
              <li
                key={item}
                className="pp-set-selbar__item"
                data-hidden={shown ? undefined : 'true'}
                data-dragging={dragging === item ? 'true' : undefined}
                onDragOver={(event) => {
                  if (Array.from(event.dataTransfer.types).includes(DRAG)) event.preventDefault();
                }}
                onDrop={(event) => {
                  const from = event.dataTransfer.getData(DRAG) as SelectionBarItem;
                  setDragging(null);
                  if (from && from !== item) move(from, index);
                }}
              >
                <button
                  type="button"
                  className="pp-set-selbar__grip"
                  draggable
                  aria-label={`移动「${items[item].label}」：上下方向键调整顺序`}
                  onDragStart={(event) => {
                    event.dataTransfer.setData(DRAG, item);
                    event.dataTransfer.effectAllowed = 'move';
                    setDragging(item);
                  }}
                  onDragEnd={() => setDragging(null)}
                  onKeyDown={(event) => {
                    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
                    event.preventDefault();
                    move(item, index + (event.key === 'ArrowUp' ? -1 : 1));
                    // Keep the moved row's handle focused.
                    window.setTimeout(() => document.querySelector<HTMLElement>(`[data-selbar-item="${item}"]`)?.focus(), 0);
                  }}
                  data-selbar-item={item}
                >
                  <Icon name="grip" size={14} />
                </button>
                <Icon name={items[item].icon} size={16} />
                <span className="pp-set-selbar__label">{items[item].label}</span>
                <Switch
                  label={`显示「${items[item].label}」`}
                  hideLabel
                  checked={shown}
                  // At least one thing stays on the bar.
                  disabled={shown && visible.length === 1}
                  onChange={(on) => toggle(item, on)}
                />
              </li>
            );
          })}
        </ol>

        <div className="pp-set-selbar__actions">
          <Button size="sm" variant="quiet" icon="rotate" disabled={isDefault} onClick={() => onChange({ ...DEFAULT_SELECTION_BAR, look: value.look })}>
            恢复默认内容和顺序
          </Button>
        </div>

        <div className="pp-set-selbar__look" data-open={lookOpen ? 'true' : undefined}>
          <button type="button" className="pp-set-selbar__disclosure" aria-expanded={lookOpen} onClick={() => setLookOpen((open) => !open)}>
            <Icon name="chevronRight" size={13} strokeWidth={2} />
            <span>显示方式</span>
            <span className="pp-set-selbar__current">{currentLook.label}</span>
          </button>
          {lookOpen && (
            <div className="pp-set-selbar__looks" role="radiogroup" aria-label="显示方式">
              {looks.map((option) => (
                <label key={option.look} className="pp-set-selbar__option">
                  <input type="radio" name="pp-selbar-look" checked={value.look === option.look} onChange={() => onChange({ ...value, look: option.look })} />
                  <span className="pp-set-selbar__option-text">
                    <span>{option.label}</span>
                    <span>{option.note}</span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>
    </SettingGroup>
  );
}
