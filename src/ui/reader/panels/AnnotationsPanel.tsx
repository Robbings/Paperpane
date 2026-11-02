import { MarkdownEditor } from '@/ui/markdown/MarkdownEditor';
import { MarkdownView } from '@/ui/markdown/MarkdownView';
import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Button, Menu, IconButton, SaveStatus, Tooltip, Segmented, highlightColors, type HighlightColor, type LocalSaveState, type SyncState } from '@/ui/components';
import type { AnnotationView } from '../types';
import { PanelBody } from './PanelBody';
import { PanelHeader } from './PanelHeader';

type KindFilter = 'all' | 'highlight' | 'comment';

const kindOptions = [
  { value: 'all', label: '全部' },
  { value: 'highlight', label: '高亮' },
  { value: 'comment', label: '旁注' },
] as const;

const colorNames: Record<HighlightColor, string> = { yellow: '黄色', green: '绿色', blue: '蓝色', pink: '粉色', purple: '紫色' };

const dot = (color: HighlightColor) => ({ '--pp-dot': `var(--pp-hl-${color}-dot)` }) as CSSProperties;

interface AnnotationsPanelProps {
  items: readonly AnnotationView[];
  local: LocalSaveState;
  sync: SyncState;
  simulated?: boolean;
  onLocate: (id: string) => void;
  /** Sets the highlight; the colour it already has takes the highlight off. */
  onColor: (id: string, color: HighlightColor) => void;
  onComment: (id: string, comment: string) => void;
  /** Removes the highlight only; a comment stays. */
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
      (kind === 'all' || (kind === 'highlight' ? item.kind === 'highlight' && item.highlighted !== false : Boolean(item.note))) &&
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
          <p className="pp-panel__empty">还没有批注。选中论文里的文字，就可以高亮或写旁注。</p>
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
  const editSession=useRef({original:'',active:false,cancelled:false});const currentEdit=editSession.current;
  const lit = item.kind === 'highlight' && item.highlighted !== false;
  // A long quote or note is cut to a few lines so the items after it stay in sight.
  const [expanded, setExpanded] = useState(false);
  const [long, setLong] = useState(false);
  const quote = useRef<HTMLSpanElement>(null), body = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (expanded) return;
    const check = () => setLong([quote.current, body.current].some((el) => !!el && el.scrollHeight > el.clientHeight + 1));
    check();
    const observer = new ResizeObserver(check);
    // The note's box is capped, so also watch its content (e.g. an image that loads later).
    for (const el of [quote.current, body.current, body.current?.firstElementChild]) if (el) observer.observe(el);
    return () => observer.disconnect();
  }, [expanded, item.quote, item.note, editing === null]);

  const save = () => {
    currentEdit.active=false;setEditing(null);
  };

  return (
    <li className="pp-annotation-item" data-editing={editing !== null ? 'true' : undefined} data-long={(long || expanded) && editing === null ? '' : undefined}>
      <button type="button" className="pp-annotation" onClick={onLocate}>
        <span className="pp-annotation__meta">
          <span className="pp-annotation__dot" style={dot(item.color)} data-empty={!lit || undefined} aria-hidden="true" />
          {item.kind === 'comment' ? '页面旁注' : lit ? '高亮' : '旁注'} · 第 {item.pageIndex + 1} 页
        </span>
        {item.quote && <span ref={quote} className="pp-annotation__quote" data-clamped={!expanded || undefined}>{item.quote}</span>}
        {item.note && editing === null && <div ref={body} className="pp-annotation__note" data-clamped={!expanded || undefined}><MarkdownView value={item.note}/></div>}
      </button>
      {(long || expanded) && editing === null && (
        <button type="button" className="pp-annotation__more" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
          {expanded ? '收起' : '展开全部'}
        </button>
      )}

      {editing !== null && (
        <div className="pp-annotation__edit">
          <MarkdownEditor storageKey={'comment:'+item.id} compact label="旁注" value={editing} autoFocus placeholder="写下你的想法…"
            onChange={value=>{if(currentEdit.cancelled)return;if(currentEdit.active)setEditing(value);onComment(value);}}
            onSave={save} onEscape={()=>{currentEdit.active=false;currentEdit.cancelled=true;onComment(currentEdit.original);setEditing(null);}}/>
          <div className="pp-annotation__edit-bar">
            <Button size="sm" variant="quiet" onClick={() => {currentEdit.active=false;currentEdit.cancelled=true;onComment(currentEdit.original);setEditing(null);}}>
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
                aria-label={lit && item.color === c ? `取消${colorNames[c]}高亮` : colorNames[c]}
                aria-pressed={lit && item.color === c}
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
              <Tooltip label={lit ? '改变颜色' : '加上高亮'} labelsChild>
                <button type="button" className="pp-annotations__color" style={dot(item.color)} data-empty={!lit || undefined} aria-label={lit ? '改变颜色' : '加上高亮'} onClick={() => setPicking(true)}>
                  <span />
                </button>
              </Tooltip>
            )}
            <IconButton icon="edit" label={item.note ? '编辑旁注' : '添加旁注'} size="md" shape="pill" onClick={() => {editSession.current={original:item.note??'',active:true,cancelled:false};setEditing(item.note??'');}} />
            <IconButton icon="trash" label={item.note && lit ? '删除…' : item.note ? '删除旁注' : '删除高亮'} size="md" shape="pill" onClick={event=>{
              // Highlight and comment are deleted separately; ask only when there are both.
              if (!item.note) { onDelete(); return; }
              if (!lit) { onRemoveComment(); return; }
              const box=event.currentTarget.getBoundingClientRect();setDeletion({x:box.right,y:box.bottom});
            }} />
          </>
        )}
      </span>
      {deletion && <Menu label="删除选项" anchor={deletion} align="end" entries={[
        {id:'comment',label:'删除旁注'},
        {id:'annotation',label:'删除高亮'},
      ]} onClose={()=>setDeletion(null)} onSelect={id=>{setEditing(null);if(id==='comment')onRemoveComment();else onDelete();}}/>}
    </li>
  );
}
