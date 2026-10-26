import { useEffect, useState } from 'react';
import { Button, Dialog, Icon, ScrollArea, Segmented, Switch, TextArea, TextField } from '@/ui/components';
import { SchemaFields, fieldsToSchema, schemaProblem } from './SchemaFields';
import type { OverviewCardDef, OverviewOutput } from './types';

interface OverviewSettingsProps {
  open: boolean;
  onClose: () => void;
  /** All cards in display order, hidden ones included. */
  cards: readonly OverviewCardDef[];
  /** The built-in cards as shipped, for "恢复默认". */
  defaults: readonly OverviewCardDef[];
  /** Saves the whole list at once. New cards carry ids starting with "new:"; the logic layer assigns real ones. */
  onSave: (cards: OverviewCardDef[]) => void;
}

const outputOptions: { value: OverviewOutput; label: string }[] = [
  { value: 'markdown', label: '文本' },
  { value: 'tags', label: '关键词' },
  { value: 'points', label: '要点' },
  { value: 'fields', label: '结构化' },
];
const outputName = Object.fromEntries(outputOptions.map((o) => [o.value, o.label])) as Record<OverviewOutput, string>;

const CARD_DRAG = 'application/x-paperpane-overview-card';

/** What is wrong with a card, if anything; shown in the editor and marked in the list. */
function problemOf(card: OverviewCardDef): string | undefined {
  if (!card.name.trim()) return '请填写名称。';
  if (!card.prompt.trim()) return '请填写提示词。';
  if (card.output === 'fields') return schemaProblem(card.schema);
  return undefined;
}

const same = (a: readonly OverviewCardDef[], b: readonly OverviewCardDef[]) => JSON.stringify(a) === JSON.stringify(b);

/** Settings for the overview's cards: their order and visibility, and each card's name, prompt and output form. */
export function OverviewSettings({ open, onClose, cards, defaults, onSave }: OverviewSettingsProps) {
  const [draft, setDraft] = useState<OverviewCardDef[]>([...cards]);
  const [selectedId, setSelectedId] = useState<string | null>(cards[0]?.id ?? null);
  const [dragging, setDragging] = useState<string | null>(null);

  // Start from the saved list each time it opens; closing without saving drops the draft.
  useEffect(() => {
    if (!open) return;
    setDraft([...cards]);
    setSelectedId((id) => (cards.some((c) => c.id === id) ? id : (cards[0]?.id ?? null)));
  }, [open]); // only when it opens

  const selected = draft.find((card) => card.id === selectedId) ?? null;
  const problems = new Map(draft.map((card) => [card.id, problemOf(card)]));
  const valid = [...problems.values()].every((problem) => !problem);
  const changed = !same(draft, cards);

  const patch = (id: string, change: Partial<OverviewCardDef>) =>
    setDraft((all) =>
      all.map((card) => {
        if (card.id === id) return { ...card, ...change };
        // Only one card opens the overview.
        if (change.display === 'lead') return { ...card, display: undefined };
        return card;
      }),
    );

  const move = (id: string, to: number) =>
    setDraft((all) => {
      const next = all.filter((card) => card.id !== id);
      next.splice(Math.max(0, Math.min(to, next.length)), 0, all.find((card) => card.id === id)!);
      return next;
    });

  const add = () => {
    const card: OverviewCardDef = { id: `new:${Date.now()}`, name: '新卡片', prompt: '', output: 'markdown', builtIn: false, visible: true };
    setDraft((all) => [...all, card]);
    setSelectedId(card.id);
  };

  const remove = (id: string) => {
    const index = draft.findIndex((card) => card.id === id);
    const rest = draft.filter((card) => card.id !== id);
    setDraft(rest);
    setSelectedId(rest[Math.min(index, rest.length - 1)]?.id ?? null);
  };

  const reset = (id: string) => {
    const original = defaults.find((card) => card.id === id);
    if (original) setDraft((all) => all.map((card) => (card.id === id ? { ...original, visible: card.visible } : card)));
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="概览内容"
      description="决定概览里有哪些部分、按什么顺序、让模型怎么写。保存后，下次生成概览时生效；已有结果会标为可能过时。"
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button
            variant="primary"
            disabled={!valid || !changed}
            onClick={() => {
              onSave(draft);
              onClose();
            }}
          >
            保存
          </Button>
        </>
      }
    >
      <div className="pp-ov-settings">
        <nav className="pp-ov-settings__list" aria-label="概览卡片">
          <ol>
            {draft.map((card, index) => (
              <li
                key={card.id}
                className="pp-ov-settings__item"
                aria-current={card.id === selectedId ? 'true' : undefined}
                data-hidden={card.visible ? undefined : 'true'}
                data-dragging={dragging === card.id ? 'true' : undefined}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData(CARD_DRAG, card.id);
                  event.dataTransfer.effectAllowed = 'move';
                  setDragging(card.id);
                }}
                onDragEnd={() => setDragging(null)}
                onDragOver={(event) => {
                  if (Array.from(event.dataTransfer.types).includes(CARD_DRAG)) event.preventDefault();
                }}
                onDrop={(event) => {
                  const id = event.dataTransfer.getData(CARD_DRAG);
                  if (id && id !== card.id) move(id, index);
                  setDragging(null);
                }}
              >
                <span className="pp-ov-settings__grip" aria-hidden="true" />
                <button type="button" className="pp-ov-settings__open" onClick={() => setSelectedId(card.id)}>
                  <span className="pp-ov-settings__name">
                    {card.name || '未命名'}
                    {problems.get(card.id) && <span className="pp-ov-settings__problem" aria-label="有内容需要补充" />}
                  </span>
                  <span className="pp-ov-settings__kind">
                    {card.display === 'lead' ? '开头概括' : outputName[card.output]}
                    {card.builtIn ? ' · 内置' : ''}
                  </span>
                </button>
                <Switch label={`在概览中显示「${card.name}」`} hideLabel checked={card.visible} onChange={(visible) => patch(card.id, { visible })} />
              </li>
            ))}
          </ol>
          <Button size="sm" variant="quiet" icon="plus" className="pp-ov-settings__add" onClick={add}>
            添加卡片
          </Button>
        </nav>

        <ScrollArea className="pp-ov-settings__card" viewportClassName="pp-ov-settings__editor" aria-label={selected ? `编辑「${selected.name}」` : '编辑卡片'} role="region">
          {!selected ? (
            <p className="pp-ov-settings__empty">选择左侧的一张卡片来编辑。</p>
          ) : (
            <>
              <TextField label="名称" value={selected.name} onChange={(name) => patch(selected.id, { name })} error={selected.name.trim() ? undefined : '请填写名称。'} />
              <div className="pp-ov-settings__field">
                <span className="pp-field__label">输出形式</span>
                <Segmented
                  label="输出形式"
                  size="sm"
                  stretch
                  options={outputOptions}
                  value={selected.output}
                  onChange={(output) =>
                    patch(selected.id, {
                      output,
                      display: output === 'markdown' ? selected.display : undefined,
                      // Switching to structured starts from one empty field rather than nothing.
                      schema: output === 'fields' && !selected.schema ? fieldsToSchema([{ key: 'field1', title: '', description: '' }]) : selected.schema,
                    })
                  }
                />
              </div>
              {selected.output === 'markdown' && (
                <Switch
                  label="作为概览开头"
                  description="不论在列表中的位置，都放在概览最上方、不带标题。只能有一张卡片这样显示。"
                  checked={selected.display === 'lead'}
                  onChange={(lead) => patch(selected.id, { display: lead ? 'lead' : undefined })}
                />
              )}
              <TextArea
                label="提示词"
                value={selected.prompt}
                onChange={(prompt) => patch(selected.id, { prompt })}
                rows={4}
                maxRows={10}
                error={selected.prompt.trim() ? undefined : '请填写提示词。'}
                description={
                  selected.output === 'points'
                    ? '对整篇论文的要求，会和正文一起发给模型。要点会按"短标题 + 一句说明"输出。'
                    : selected.output === 'tags'
                      ? '对整篇论文的要求，会和正文一起发给模型。关键词会按短词输出。'
                      : '对整篇论文的要求，会和正文一起发给模型。'
                }
              />
              {selected.output === 'fields' && <SchemaFields key={selected.id} schema={selected.schema} onChange={(schema) => patch(selected.id, { schema })} />}

              <div className="pp-ov-settings__card-actions">
                {selected.builtIn ? (
                  <Button size="sm" variant="quiet" icon="rotate" onClick={() => reset(selected.id)}>
                    恢复默认
                  </Button>
                ) : (
                  <Button size="sm" variant="quiet" icon="trash" className="pp-ov-settings__remove" onClick={() => remove(selected.id)}>
                    删除这张卡片
                  </Button>
                )}
                {!selected.visible && (
                  <span className="pp-ov-settings__note">
                    <Icon name="alert" size={13} />
                    已隐藏，不会显示也不会生成
                  </span>
                )}
              </div>
            </>
          )}
        </ScrollArea>
      </div>
    </Dialog>
  );
}
