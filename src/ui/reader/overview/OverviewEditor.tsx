import { useRef, useState } from 'react';
import { Button, Icon, IconButton, Menu, ScrollArea, Segmented, Switch, TextArea, TextField } from '@/ui/components';
import type { OverviewCardDef, OverviewOutput } from './types';

interface OverviewEditorProps {
  cards: readonly OverviewCardDef[];
  /** Saves a card; a new one comes with an empty id. */
  onSave: (card: OverviewCardDef) => void;
  onRemove: (id: string) => void;
  onReset: (id: string) => void;
  onReorder: (ids: string[]) => void;
  onVisible: (id: string, visible: boolean) => void;
}

const outputLabels: Record<OverviewOutput, string> = { markdown: '文本', list: '列表', fields: '结构化' };
const CARD_DRAG = 'application/x-paperpane-overview-card';

/** A JSON Schema check for the structured form: an object with named properties. */
function schemaProblem(text: string): string | undefined {
  if (!text.trim()) return '结构化卡片需要一个 JSON Schema。';
  try {
    const schema = JSON.parse(text) as { type?: unknown; properties?: unknown };
    if (schema.type !== 'object') return '顶层的 type 需要是 "object"。';
    if (!schema.properties || typeof schema.properties !== 'object' || Object.keys(schema.properties).length === 0) return 'properties 里至少要有一个字段。';
    return undefined;
  } catch {
    return '不是有效的 JSON。';
  }
}

const blank: OverviewCardDef = { id: '', name: '', prompt: '', output: 'markdown', builtIn: false, visible: true };

/** Managing the overview cards: order, visibility, and each card's prompt and output form. */
export function OverviewEditor({ cards, onSave, onRemove, onReset, onReorder, onVisible }: OverviewEditorProps) {
  const [draft, setDraft] = useState<OverviewCardDef | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const menuButtons = useRef(new Map<string, HTMLButtonElement>());

  const move = (id: string, to: number) => {
    const ids = cards.map((c) => c.id).filter((x) => x !== id);
    ids.splice(Math.max(0, Math.min(to, ids.length)), 0, id);
    onReorder(ids);
  };

  if (draft) {
    const problem = draft.output === 'fields' ? schemaProblem(draft.schema ?? '') : undefined;
    const valid = draft.name.trim() !== '' && draft.prompt.trim() !== '' && !problem;
    return (
      <ScrollArea className="pp-ov-editor" viewportClassName="pp-ov-editor__viewport">
        <form
          className="pp-ov-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!valid) return;
            onSave({ ...draft, name: draft.name.trim(), prompt: draft.prompt.trim() });
            setDraft(null);
          }}
        >
          <TextField label="名称" value={draft.name} onChange={(name) => setDraft({ ...draft, name })} />
          <TextArea
            label="提示词"
            value={draft.prompt}
            onChange={(prompt) => setDraft({ ...draft, prompt })}
            rows={3}
            maxRows={10}
            description="对整篇论文提出的要求。会和论文正文一起发给模型。"
          />
          <div className="pp-ov-form__field">
            <span className="pp-field__label">输出形式</span>
            <Segmented
              label="输出形式"
              size="sm"
              stretch
              options={(['markdown', 'list', 'fields'] as const).map((value) => ({ value, label: outputLabels[value] }))}
              value={draft.output}
              onChange={(output) => setDraft({ ...draft, output, listStyle: output === 'list' ? (draft.listStyle ?? 'bullets') : undefined })}
            />
          </div>
          {draft.output === 'list' && (
            <div className="pp-ov-form__field">
              <span className="pp-field__label">显示为</span>
              <Segmented
                label="列表显示为"
                size="sm"
                stretch
                options={[
                  { value: 'bullets', label: '逐条要点' },
                  { value: 'tags', label: '短标签' },
                ]}
                value={draft.listStyle ?? 'bullets'}
                onChange={(listStyle) => setDraft({ ...draft, listStyle })}
              />
            </div>
          )}
          {draft.output === 'fields' && (
            <TextArea
              label="JSON Schema"
              className="pp-ov-form__schema"
              value={draft.schema ?? ''}
              onChange={(schema) => setDraft({ ...draft, schema })}
              rows={6}
              maxRows={16}
              spellCheck={false}
              error={draft.schema ? problem : undefined}
              description="顶层是 object；properties 里的每个字段显示为一行，字段的 title 作为名称。"
            />
          )}
          <div className="pp-ov-form__actions">
            {draft.id && draft.builtIn && (
              <Button
                size="sm"
                variant="quiet"
                onClick={() => {
                  onReset(draft.id);
                  setDraft(null);
                }}
              >
                恢复默认
              </Button>
            )}
            {draft.id && !draft.builtIn && (
              <Button
                size="sm"
                variant="danger"
                onClick={() => {
                  onRemove(draft.id);
                  setDraft(null);
                }}
              >
                删除卡片
              </Button>
            )}
            <span className="pp-ov-form__spacer" />
            <Button size="sm" onClick={() => setDraft(null)}>
              取消
            </Button>
            <Button size="sm" variant="primary" type="submit" disabled={!valid}>
              保存
            </Button>
          </div>
        </form>
      </ScrollArea>
    );
  }

  return (
    <ScrollArea className="pp-ov-editor" viewportClassName="pp-ov-editor__viewport">
      <p className="pp-ov-editor__hint">拖动调整顺序。关闭的卡片不会显示，也不会生成。修改提示词后，已有结果会标为可能过时。</p>
      <ul className="pp-ov-editor__list">
        {cards.map((card, index) => (
          <li
            key={card.id}
            className="pp-ov-editor__row"
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
            <Icon name="grip" size={16} className="pp-ov-editor__grip" />
            <button type="button" className="pp-ov-editor__open" onClick={() => setDraft(card)}>
              <span className="pp-ov-editor__name">{card.name}</span>
              <span className="pp-ov-editor__kind">
                {outputLabels[card.output]}
                {card.builtIn && ' · 内置'}
              </span>
            </button>
            <Switch label={`显示「${card.name}」`} hideLabel checked={card.visible} onChange={(visible) => onVisible(card.id, visible)} />
            <IconButton
              ref={(el) => {
                if (el) menuButtons.current.set(card.id, el);
              }}
              icon="more"
              label="更多操作"
              size="md"
              shape="pill"
              aria-haspopup="menu"
              onClick={() => setMenu(menu === card.id ? null : card.id)}
            />
          </li>
        ))}
      </ul>
      <Button size="sm" variant="quiet" icon="plus" className="pp-ov-editor__add" onClick={() => setDraft(blank)}>
        添加卡片
      </Button>

      {menu && (
        <Menu
          label="卡片操作"
          entries={(() => {
            const index = cards.findIndex((c) => c.id === menu);
            const card = cards[index];
            return [
              { id: 'edit', label: '编辑…', icon: 'edit' as const },
              { id: 'up', label: '上移', disabled: index <= 0 },
              { id: 'down', label: '下移', disabled: index >= cards.length - 1 },
              { kind: 'separator' as const, id: 'sep' },
              card?.builtIn ? { id: 'reset', label: '恢复默认' } : { id: 'remove', label: '删除卡片', icon: 'trash' as const },
            ];
          })()}
          anchor={(() => {
            const box = menuButtons.current.get(menu)?.getBoundingClientRect();
            return box ? { x: box.right, y: box.bottom + 4 } : { x: 0, y: 0 };
          })()}
          align="end"
          triggerRef={{ current: menuButtons.current.get(menu) ?? null }}
          onSelect={(action) => {
            const index = cards.findIndex((c) => c.id === menu);
            const card = cards[index];
            if (!card) return;
            if (action === 'edit') setDraft(card);
            else if (action === 'up') move(card.id, index - 1);
            else if (action === 'down') move(card.id, index + 1);
            else if (action === 'reset') onReset(card.id);
            else onRemove(card.id);
          }}
          onClose={() => setMenu(null)}
        />
      )}
    </ScrollArea>
  );
}
