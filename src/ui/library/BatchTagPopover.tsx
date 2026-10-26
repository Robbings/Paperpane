import { useEffect, useRef, useState, type RefObject } from 'react';
import { Button, Checkbox, Icon, Popover, TextField } from '@/ui/components';
import type { TagView } from './types';
import './batchTags.css';

export interface BatchTagChoice { id?: string; label: string }
export type BatchTagApplyResult = { ok: true } | { ok: false; message: string };
export type ApplyBatchTags = (tags: BatchTagChoice[]) => void | BatchTagApplyResult | Promise<void | BatchTagApplyResult>;
interface BatchTagPopoverProps {
  anchorRef: RefObject<HTMLElement | null>;
  tags: readonly TagView[];
  paperCount: number;
  onApply: ApplyBatchTags;
  onClose: () => void;
}
const normalized = (value: string) => value.trim().normalize('NFKC').toLocaleLowerCase();

/** Additive batch draft. No writes until the parent handles Apply. */
export function BatchTagPopover({ anchorRef, tags, paperCount, onApply, onClose }: BatchTagPopoverProps) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<BatchTagChoice[]>([]);
  // The draft catalog outlives selection changes. Unchecking isn't deleting a tag.
  const [created, setCreated] = useState<BatchTagChoice[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const active = useRef(true);
  const inFlight = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    active.current = true;
    // Positioning first reveals the portal; focusing while it is hidden is ignored.
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => { active.current = false; cancelAnimationFrame(frame); };
  }, []);
  const name = query.trim(), key = normalized(query);
  const tooLong = name.length > 100;
  const options = [...new Map([...created, ...tags].map(tag => [normalized(tag.label), tag])).values()];
  const exact = options.find(tag => normalized(tag.label) === key);
  const shown = options.filter(tag => normalized(tag.label).includes(key)).sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'));
  const has = (tag: BatchTagChoice) => selected.some(t => normalized(t.label) === normalized(tag.label));
  function choose(tag: BatchTagChoice, checked = true) {
    setSelected(current => checked ? current.some(t => normalized(t.label) === normalized(tag.label)) ? current : [...current, tag]
      : current.filter(t => normalized(t.label) !== normalized(tag.label)));
    if (checked) setQuery('');
  }
  function addText() {
    if (!name || tooLong) return;
    const tag = exact ?? { label: name };
    if (!exact) setCreated(current => current.some(t => normalized(t.label) === key) ? current : [...current, tag]);
    choose(tag); setQuery(''); inputRef.current?.focus();
  }
  function dismiss() { if (!inFlight.current) onClose(); }
  function close() { if (!inFlight.current) { onClose(); anchorRef.current?.focus(); } }
  async function apply() {
    if (!selected.length || tooLong || inFlight.current) return;
    inFlight.current = true; setSaving(true); setSaveError(undefined);
    try {
      const result = await onApply([...selected]);
      if (!active.current) return;
      if (result && !result.ok) { setSaveError(result.message); return; }
      onClose(); anchorRef.current?.focus();
    } catch {
      if (active.current) setSaveError('标签保存失败，选择已保留，请重试。');
    } finally {
      inFlight.current = false;
      if (active.current) setSaving(false);
    }
  }
  return <Popover anchorRef={anchorRef} open onClose={dismiss} label="批量加标签" placement="top-start" width={320} className="pp-batch-tags">
    <div className="pp-batch-tags__heading">
      <h2>加标签</h2><span>{paperCount} 篇论文</span>
    </div>
    <TextField ref={inputRef} label="搜索或新建标签" hideLabel icon="search" clearable disabled={saving}
      placeholder="搜索或新建标签" value={query} onChange={setQuery}
      error={tooLong ? '标签名称最多 100 个字符' : undefined}
      onKeyDown={event => {
        if (event.nativeEvent.isComposing || event.keyCode === 229) return;
        if (event.key === 'Enter') { event.preventDefault(); if (name) addText(); else void apply(); }
        else if (event.key === 'ArrowDown') {
          const panel = inputRef.current?.closest('.pp-batch-tags');
          const first = panel?.querySelector<HTMLElement>('.pp-batch-tags__choices input, .pp-batch-tags__create');
          if (first) { event.preventDefault(); first.focus(); }
        }
      }} />
    <div className="pp-batch-tags__choices" role="group" aria-label="选择标签">
      {name && !exact && !tooLong && <button type="button" className="pp-batch-tags__create" disabled={saving} onClick={addText}>
        <Icon name="plus" size={15} /><span>新建「{name}」</span><span className="pp-batch-tags__key">↵</span>
      </button>}
      {shown.map(tag => <div className="pp-batch-tags__row" key={normalized(tag.label)}>
        <Checkbox label={tag.label} checked={has(tag)} disabled={saving} onChange={checked => choose(tag, checked)} />
        {!tag.id && <span className="pp-batch-tags__new">新标签</span>}
      </div>)}
      {!shown.length && !name && <p className="pp-batch-tags__empty">还没有标签，输入名称即可新建。</p>}
      {!shown.length && tooLong && <p className="pp-batch-tags__empty">缩短名称后即可新建。</p>}
    </div>
    {saveError && <p className="pp-batch-tags__error" role="alert">{saveError}</p>}
    <div className="pp-batch-tags__footer">
      <span role="status">{saving ? '正在保存…' : selected.length ? `已选 ${selected.length} 个标签` : '可选择多个标签'}</span>
      <Button size="sm" variant="quiet" disabled={saving} onClick={close}>取消</Button>
      <Button size="sm" variant="primary" disabled={saving || !selected.length || tooLong} onClick={() => { void apply(); }}>{saving ? '保存中…' : '应用'}</Button>
    </div>
  </Popover>;
}
