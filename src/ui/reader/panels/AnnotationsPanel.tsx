import { useState, type CSSProperties } from 'react';
import { IconButton, SaveStatus, Segmented, highlightColors, type HighlightColor, type LocalSaveState, type SyncState } from '@/ui/components';
import type { AnnotationView } from '../types';
import { PanelHeader } from './PanelHeader';

type KindFilter = 'all' | 'highlight' | 'comment';

const kindOptions = [
  { value: 'all', label: '全部' },
  { value: 'highlight', label: '高亮' },
  { value: 'comment', label: '评论' },
] as const;

const colorNames: Record<HighlightColor, string> = { yellow: '黄色', green: '绿色', blue: '蓝色', pink: '粉色', purple: '紫色' };

const dot = (color: HighlightColor) => ({ '--pp-dot': `var(--pp-hl-${color}-dot)` }) as CSSProperties;

interface AnnotationsPanelProps {
  items: readonly AnnotationView[];
  local: LocalSaveState;
  sync: SyncState;
  simulated?: boolean;
  onLocate: (id: string) => void;
  onCopyAll: () => void;
  onExport: () => void;
}

export function AnnotationsPanel({ items, local, sync, simulated, onLocate, onCopyAll, onExport }: AnnotationsPanelProps) {
  const [kind, setKind] = useState<KindFilter>('all');
  const [color, setColor] = useState<HighlightColor | null>(null);

  // "评论" lists anything that carries the reader's own words.
  const visible = items.filter(
    (item) =>
      (kind === 'all' || (kind === 'highlight' ? item.kind === 'highlight' : Boolean(item.note))) &&
      (color === null || item.color === color),
  );

  return (
    <div className="pp-panel">
      <PanelHeader
        title="批注"
        meta={items.length}
        actions={
          <>
            <IconButton icon="copy" label="复制全部" size="md" shape="pill" onClick={onCopyAll} disabled={items.length === 0} />
            <IconButton icon="export" label="导出" size="md" shape="pill" onClick={onExport} disabled={items.length === 0} />
          </>
        }
      />

      <div className="pp-annotations__filters">
        <Segmented label="按类型筛选" options={kindOptions} value={kind} onChange={setKind} size="sm" />
        <div className="pp-annotations__colors" role="group" aria-label="按颜色筛选">
          {highlightColors.map((c) => (
            <button
              key={c}
              type="button"
              className="pp-annotations__color"
              style={dot(c)}
              aria-label={`只看${colorNames[c]}`}
              title={`只看${colorNames[c]}`}
              aria-pressed={color === c}
              onClick={() => setColor(color === c ? null : c)}
            >
              <span />
            </button>
          ))}
        </div>
      </div>

      <div className="pp-panel__scroll">
        {items.length === 0 ? (
          <p className="pp-panel__empty">还没有批注。选中论文里的文字，就可以高亮或写评论。</p>
        ) : visible.length === 0 ? (
          <p className="pp-panel__empty">没有符合筛选条件的批注。</p>
        ) : (
          <ul className="pp-annotations__list">
            {visible.map((item) => (
              <li key={item.id}>
                <button type="button" className="pp-annotation" onClick={() => onLocate(item.id)}>
                  <span className="pp-annotation__meta">
                    <span className="pp-annotation__dot" style={dot(item.color)} aria-hidden="true" />
                    {item.kind === 'highlight' ? '高亮' : '页面评论'} · 第 {item.pageIndex + 1} 页
                  </span>
                  {item.quote && <span className="pp-annotation__quote">{item.quote}</span>}
                  {item.note && <span className="pp-annotation__note">{item.note}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="pp-panel__footer">
        <SaveStatus local={local} sync={sync} simulated={simulated} />
      </div>
    </div>
  );
}
