import { useLayoutEffect, useRef, useState } from 'react';
import { Icon, IconButton, Menu, type MenuEntry } from '@/ui/components';
import type { AttachmentView, ModelView } from './types';

interface ChatComposerProps {
  text: string;
  attachments: readonly AttachmentView[];
  placeholder: string;
  models: readonly ModelView[];
  modelId: string;
  /** An answer is being generated: the send button becomes stop. */
  busy: boolean;
  draftSaveFailed?: boolean;
  onText: (text: string) => void;
  onRemoveAttachment: (id: string) => void;
  onSend: () => void;
  onStop: () => void;
  onModel: (modelId: string) => void;
}

const MAX_ROWS = 8;

/** The question box: text, region screenshots, the model in use, send / stop. */
export function ChatComposer(props: ChatComposerProps) {
  const { text, attachments, models, modelId, busy } = props;
  const ref = useRef<HTMLTextAreaElement>(null);
  const modelRef = useRef<HTMLButtonElement>(null);
  const [modelMenu, setModelMenu] = useState(false);
  const model = models.find((m) => m.id === modelId);
  const canSend = !busy && (text.trim() !== '' || attachments.length > 0) && Boolean(model);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const line = parseFloat(getComputedStyle(el).lineHeight) || 20;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, line * MAX_ROWS)}px`;
    el.style.overflowY = el.scrollHeight > line * MAX_ROWS ? 'auto' : 'hidden';
  }, [text]);

  // Models grouped by provider, with a separator between providers.
  const entries: MenuEntry[] = [];
  models.forEach((m, index) => {
    if (index > 0 && models[index - 1]!.providerId !== m.providerId) entries.push({ kind: 'separator', id: `sep-${m.id}` });
    entries.push({ id: m.id, label: `${m.displayName} · ${m.providerName}`, checked: m.id === modelId });
  });

  return (
    <div className="pp-composer" onClick={() => ref.current?.focus()}>
      {attachments.length > 0 && (
        <div className="pp-composer__attachments">
          {attachments.map((item) => (
            <span key={item.id} className="pp-composer__attachment">
              {item.previewUrl ? <img src={item.previewUrl} alt={item.name} /> : <Icon name="image" size={16} />}
              <IconButton
                icon="close"
                label={`移除截图 ${item.name}`}
                size="md"
                shape="pill"
                className="pp-composer__remove"
                onClick={(event) => {
                  event.stopPropagation();
                  props.onRemoveAttachment(item.id);
                }}
              />
            </span>
          ))}
        </div>
      )}
      <textarea
        ref={ref}
        rows={1}
        aria-label="提问"
        placeholder={props.placeholder}
        value={text}
        onChange={(event) => props.onText(event.target.value)}
        onKeyDown={(event) => {
          // Enter sends, Shift+Enter breaks the line; never while an input method is composing.
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            if (canSend) props.onSend();
          }
        }}
      />
      <div className="pp-composer__bar">
        <button
          ref={modelRef}
          type="button"
          className="pp-composer__model"
          aria-haspopup="menu"
          aria-expanded={modelMenu}
          disabled={busy || models.length === 0}
          onClick={(event) => {
            event.stopPropagation();
            setModelMenu((open) => !open);
          }}
        >
          {model ? model.displayName : '未选择模型'}
          <Icon name="chevronDown" size={11} strokeWidth={2} />
        </button>
        {props.draftSaveFailed && <span className="pp-composer__warn">草稿未能保存</span>}
        <span className="pp-composer__spacer" />
        {busy ? (
          <IconButton icon="stop" label="停止生成" size="md" shape="pill" className="pp-composer__stop" onClick={props.onStop} />
        ) : (
          <IconButton icon="send" label="发送" size="md" shape="pill" className="pp-composer__send" disabled={!canSend} onClick={props.onSend} />
        )}
      </div>

      {modelMenu && (
        <Menu
          label="选择模型"
          entries={entries}
          anchor={(() => {
            const box = modelRef.current?.getBoundingClientRect();
            return box ? { x: box.left, y: box.top - 6 } : { x: 0, y: 0 };
          })()}
          triggerRef={modelRef}
          onSelect={(id) => id !== modelId && props.onModel(id)}
          onClose={() => setModelMenu(false)}
        />
      )}
    </div>
  );
}
