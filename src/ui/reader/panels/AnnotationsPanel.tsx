import { useState, type CSSProperties } from 'react';
import { Button, Menu, IconButton, SaveStatus, TextArea, Tooltip, Segmented, highlightColors, type HighlightColor, type LocalSaveState, type SyncState } from '@/ui/components';
import type { AnnotationView } from '../types';
import { PanelBody } from './PanelBody';
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
  onColor: (id: string, color: HighlightColor) => void;
  onComment: (id: string, comment: string) => void;
  onDelete: (id: string) => void;
  onRemoveComment: (id: string) => void;
  onCopyAll: () => void;
  onExport: () => void;
}

export function AnnotationsPanel({ items, local, sync, simulated, onLocate, onColor, onComment, onDelete, onRemoveComment, onCopyAll, onExport }: AnnotationsPanelProps) {
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
            <Tooltip key={c} label={`只看${colorNames[c]}`} labelsChild>
              <button
                type="button"
                className="pp-annotations__color"
                style={dot(c)}
                aria-label={`只看${colorNames[c]}`}
                aria-pressed={color === c}
                onClick={() => setColor(color === c ? null : c)}
              >
                <span />
              </button>
            </Tooltip>
          ))}
        </div>
      </div>

      <PanelBody>
      <div className="pp-panel__scroll">
        {items.length === 0 ? (
          <p className="pp-panel__empty">还没有批注。选中论文里的文字，就可以高亮或写评论。</p>
        ) : visible.length === 0 ? (
          <p className="pp-panel__empty">没有符合筛选条件的批注。</p>
        ) : (
          <ul className="pp-annotations__list">
            {visible.map((item) => (
              <AnnotationItem
                key={item.id}
                item={item}
                onLocate={() => onLocate(item.id)}
                onColor={(c) => onColor(item.id, c)}
                onComment={(text) => onComment(item.id, text)}
                onDelete={() => onDelete(item.id)}
                onRemoveComment={() => onRemoveComment(item.id)}
              />
            ))}
          </ul>
        )}
      </div>

      <div className="pp-panel__footer">
        <SaveStatus local={local} sync={sync} simulated={simulated} />
      </div>
      </PanelBody>
    </div>
  );
}

interface AnnotationItemProps {
  item: AnnotationView;
  onLocate: () => void;
  onColor: (color: HighlightColor) => void;
  onComment: (text: string) => void;
  onDelete: () => void;
  onRemoveComment: () => void;
}

/** One annotation: click to go to it; hover for recolour, edit comment and delete. */
function AnnotationItem({ item, onLocate, onColor, onComment, onDelete, onRemoveComment }: AnnotationItemProps) {
  const [picking, setPicking] = useState(false);
  const [deletion, setDeletion] = useState<{x:number;y:number}|null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const save = () => {
    if (editing !== null && editing.trim() !== (item.note ?? '').trim()) onComment(editing.trim());
    setEditing(null);
  };

  return (
    <li className="pp-annotation-item" data-editing={editing !== null ? 'true' : undefined}>
      <button type="button" className="pp-annotation" onClick={onLocate}>
        <span className="pp-annotation__meta">
          <span className="pp-annotation__dot" style={dot(item.color)} aria-hidden="true" />
          {item.kind === 'highlight' ? '高亮' : '页面评论'} · 第 {item.pageIndex + 1} 页
        </span>
        {item.quote && <span className="pp-annotation__quote">{item.quote}</span>}
        {item.note && editing === null && <span className="pp-annotation__note">{item.note}</span>}
      </button>

      {editing !== null && (
        <div className="pp-annotation__edit">
          <TextArea
            label="评论"
            hideLabel
            value={editing}
            onChange={setEditing}
            rows={2}
            maxRows={8}
            autoFocus
            placeholder="写下你的想法…"
            onKeyDown={(event) => {
              if (event.key === 'Escape') setEditing(null);
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) save();
            }}
          />
          <div className="pp-annotation__edit-bar">
            <Button size="sm" variant="quiet" onClick={() => setEditing(null)}>
              取消
            </Button>
            <Button size="sm" variant="primary" onClick={save}>
              保存
            </Button>
          </div>
        </div>
      )}

      <span className="pp-annotation__tools" data-open={picking ? 'true' : undefined}>
        {picking ? (
          <span className="pp-annotation__colors" role="group" aria-label="改变颜色">
            {highlightColors.map((c) => (
              <button
                key={c}
                type="button"
                className="pp-annotations__color"
                style={dot(c)}
                aria-label={colorNames[c]}
                aria-pressed={item.color === c}
                onClick={() => {
                  onColor(c);
                  setPicking(false);
                }}
              >
                <span />
              </button>
            ))}
          </span>
        ) : (
          <>
            {item.kind === 'highlight' && (
              <Tooltip label="改变颜色" labelsChild>
                <button type="button" className="pp-annotations__color" style={dot(item.color)} aria-label="改变颜色" onClick={() => setPicking(true)}>
                  <span />
                </button>
              </Tooltip>
            )}
            <IconButton icon="edit" label={item.note ? '编辑评论' : '添加评论'} size="md" shape="pill" onClick={() => setEditing(item.note ?? '')} />
            <IconButton icon="trash" label={item.note ? '删除选项' : '删除高亮'} size="md" shape="pill" onClick={event=>{
              if (!item.note) { onDelete(); return; }
              const box=event.currentTarget.getBoundingClientRect();setDeletion({x:box.right,y:box.bottom});
            }} />
          </>
        )}
      </span>
      {deletion && <Menu label="删除选项" anchor={deletion} align="end" entries={[
        {id:'comment',label:'仅删除评论（保留高亮）'},
        {id:'annotation',label:'删除整条批注（含高亮）'},
      ]} onClose={()=>setDeletion(null)} onSelect={id=>{setEditing(null);if(id==='comment')onRemoveComment();else onDelete();}}/>}
    </li>
  );
}
