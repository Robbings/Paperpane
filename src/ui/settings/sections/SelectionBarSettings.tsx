import { useState } from 'react';
import { Button, Dialog, Icon, Select, SelectionMenu, Switch, type IconName, type SelectionMenuAction, type SelectionMenuLook } from '@/ui/components';
import { SettingRow } from '../SettingRow';
import { DEFAULT_SELECTION_BAR, type SelectionBarItem, type SelectionBarPrefs } from '../types';

const items: Record<SelectionBarItem, { label: string; icon: IconName }> = {
  colors: { label: '高亮颜色', icon: 'marker' },
  comment: { label: '旁注', icon: 'comment' },
  translate: { label: '翻译', icon: 'translate' },
  explain: { label: '解释', icon: 'explain' },
  ask: { label: '提问', icon: 'ask' },
  copy: { label: '复制', icon: 'copy' },
};

const actions: SelectionMenuAction[] = (['comment', 'translate', 'explain', 'ask', 'copy'] as const).map((id) => ({ id, ...items[id] }));

const looks: { value: SelectionMenuLook; label: string }[] = [
  { value: 'text', label: '文字' },
  { value: 'icon', label: '图标' },
  { value: 'both', label: '图标加文字' },
  { value: 'stacked', label: '图标在上、文字在下' },
  { value: 'reveal', label: '图标，悬停展开文字' },
];

const DRAG = 'application/x-paperpane-selection-bar-item';

interface SelectionBarSettingsProps {
  value: SelectionBarPrefs;
  onChange: (value: SelectionBarPrefs) => void;
}

/**
 * The bar over selected text: one row with a live preview; what it shows, in what order and
 * how, is edited in a dialog so the page stays short.
 */
export function SelectionBarSettings({ value, onChange }: SelectionBarSettingsProps) {
  const [dragging, setDragging] = useState<SelectionBarItem | null>(null);
  const [open, setOpen] = useState(false);
  const visible = value.order.filter((item) => !value.hidden.includes(item));

  const move = (item: SelectionBarItem, to: number) => {
    const order = value.order.filter((i) => i !== item);
    order.splice(Math.max(0, Math.min(to, order.length)), 0, item);
    onChange({ ...value, order });
  };
  const toggle = (item: SelectionBarItem, shown: boolean) =>
    onChange({ ...value, hidden: shown ? value.hidden.filter((i) => i !== item) : [...value.hidden, item] });
  const isDefault = JSON.stringify({ ...value, look: DEFAULT_SELECTION_BAR.look }) === JSON.stringify(DEFAULT_SELECTION_BAR);

  return (
    <>
      <SettingRow label="浮动工具条">
        <span className="pp-set-selbar__mini" aria-hidden="true" inert>
          <SelectionMenu label="预览" actions={actions} look={value.look} layout={visible} />
        </span>
        <Button size="sm" onClick={() => setOpen(true)}>
          自定义
        </Button>
      </SettingRow>
      <Dialog open={open} onClose={() => setOpen(false)} title="浮动工具条" size="md" footer={<Button variant="primary" onClick={() => setOpen(false)}>完成</Button>}>
      <div className="pp-set-selbar">
        <div className="pp-set-selbar__preview" aria-hidden="true" inert>
          <SelectionMenu label="预览" actions={actions} look={value.look} layout={visible} />
        </div>

        <div className="pp-set-selbar__look-row">
          <span>显示方式</span>
          <Select label="显示方式" size="sm" value={value.look} options={looks} onChange={(look) => onChange({ ...value, look })} />
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
          <span className="pp-set-selbar__tip">拖动把手调整顺序</span>
          <Button size="sm" variant="quiet" icon="rotate" disabled={isDefault} onClick={() => onChange({ ...DEFAULT_SELECTION_BAR, look: value.look })}>
            恢复默认
          </Button>
        </div>
      </div>
      </Dialog>
    </>
  );
}
