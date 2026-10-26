import { useEffect, useState } from 'react';
import { Button, Dialog, HintLabel, ScrollArea, Segmented, Switch, TextArea, TextField } from '@/ui/components';
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
  { value: 'list', label: '列表' },
  { value: 'fields', label: '结构化' },
];

const kindOf = (card: OverviewCardDef) =>
  card.display === 'lead' ? '开头概括' : card.output === 'list' ? (card.listStyle === 'tags' ? '列表 · 标签' : '列表') : card.output === 'fields' ? '结构化' : '文本';

const CARD_DRAG = 'application/x-paperpane-overview-card';

/** What is wrong with a card, if anything; marked in the list and blocks saving. */
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
  // Problems show once a field has been left empty, or after trying to save; a fresh card starts clean.
  const [touched, setTouched] = useState<ReadonlySet<string>>(() => new Set());
  const [tried, setTried] = useState(false);
  const touch = (id: string, field: string) => setTouched((all) => new Set(all).add(`${id}:${field}`));
  const shows = (id: string, field: string) => tried || touched.has(`${id}:${field}`);

  // Start from the saved list each time it opens; closing without saving drops the draft.
  useEffect(() => {
    if (!open) return;
    setDraft([...cards]);
    setSelectedId((id) => (cards.some((c) => c.id === id) ? id : (cards[0]?.id ?? null)));
    setTouched(new Set());
    setTried(false);
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

  const changeOutput = (card: OverviewCardDef, output: OverviewOutput) =>
    patch(card.id, {
      output,
      display: output === 'markdown' ? card.display : undefined,
      listStyle: output === 'list' ? (card.listStyle ?? 'items') : undefined,
      // Switching to structured starts from one empty field rather than nothing.
      schema: output === 'fields' && !card.schema ? fieldsToSchema([{ key: 'field1', title: '', description: '' }]) : card.schema,
    });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="概览内容"
      description="保存后，下次生成概览时生效。"
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button
            variant="primary"
            disabled={!changed}
            onClick={() => {
              if (!valid) {
                // Point at the first card that needs something.
                setTried(true);
                setSelectedId(draft.find((card) => problems.get(card.id))?.id ?? selectedId);
                return;
              }
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
                    {tried && problems.get(card.id) && <span className="pp-ov-settings__problem" aria-label="有内容需要补充" />}
                  </span>
                  <span className="pp-ov-settings__kind">
                    {kindOf(card)}
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
              <TextField
                label="名称"
                value={selected.name}
                onChange={(name) => patch(selected.id, { name })}
                onBlur={() => touch(selected.id, 'name')}
                error={selected.name.trim() || !shows(selected.id, 'name') ? undefined : '请填写名称'}
              />

              <div className="pp-ov-settings__field">
                <HintLabel htmlFor="pp-ov-prompt" hint="对整篇论文的要求，会和正文一起发给模型">
                  提示词
                </HintLabel>
                <TextArea
                  id="pp-ov-prompt"
                  label="提示词"
                  hideLabel
                  value={selected.prompt}
                  onChange={(prompt) => patch(selected.id, { prompt })}
                  rows={3}
                  maxRows={10}
                  placeholder="例如：列出这篇论文的主要贡献，每条一句话"
                  onBlur={() => touch(selected.id, 'prompt')}
                  error={selected.prompt.trim() || !shows(selected.id, 'prompt') ? undefined : '请填写提示词'}
                />
              </div>

              <div className="pp-ov-settings__field">
                <HintLabel hint="文本是一段话；列表是逐条内容；结构化按你定义的字段逐行填写">输出形式</HintLabel>
                <Segmented label="输出形式" size="sm" stretch options={outputOptions} value={selected.output} onChange={(output) => changeOutput(selected, output)} />
              </div>

              {selected.output === 'list' && (
                <div className="pp-ov-settings__field">
                  <HintLabel hint="条目：每条一句，可以用加粗的短标题开头。标签：一排短词，适合关键词、数据集、方法名">显示为</HintLabel>
                  <Segmented
                    label="列表显示为"
                    size="sm"
                    stretch
                    options={[
                      { value: 'items', label: '条目' },
                      { value: 'tags', label: '标签' },
                    ]}
                    value={selected.listStyle ?? 'items'}
                    onChange={(listStyle) => patch(selected.id, { listStyle })}
                  />
                </div>
              )}

              {selected.output === 'markdown' && (
                <div className="pp-ov-settings__row">
                  <HintLabel hint="显示在概览最上方，不带标题；只能有一张">作为概览开头</HintLabel>
                  <Switch label="作为概览开头" hideLabel checked={selected.display === 'lead'} onChange={(lead) => patch(selected.id, { display: lead ? 'lead' : undefined })} />
                </div>
              )}

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
                {!selected.visible && <span className="pp-ov-settings__note">已隐藏，不会显示也不会生成</span>}
              </div>
            </>
          )}
        </ScrollArea>
      </div>
    </Dialog>
  );
}
