import { useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import { Button, Icon, IconButton, Menu, Tooltip, type MenuEntry } from '@/ui/components';
import type { AttachmentView, ModelView } from './types';

interface ChatComposerProps {
  /** The text box, for callers that put text in and focus it. */
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  text: string;
  attachments: readonly AttachmentView[];
  placeholder: string;
  models: readonly ModelView[];
  modelId: string;
  /** The session's thinking strength; the picker shows only for models that have levels. */
  reasoning?: string;
  webSearch?: boolean;
  onWebSearch?: (enabled: boolean) => void;
  /** An answer is being generated: the send button becomes stop. */
  busy: boolean;
  draftSaveFailed?: boolean;
  onText: (text: string) => void;
  onRemoveAttachment: (id: string) => void;
  onSend: () => void;
  onStop: () => void;
  onLatest?:()=>void;
  onModel: (modelId: string) => void;
  onReasoning?: (level: string) => void;
  /** Starts picking a region of the paper to ask about; shown for models that read images. */
  onCaptureRegion?: () => void;
  onPasteImages?: (files: File[]) => void;
}

const AUTO_ROWS = 8;
const STEP = 18;

const levelNames: Record<string, string> = {
  none: '不思考',
  off: '不思考',
  minimal: '最少',
  low: '低',
  medium: '中',
  high: '高',
  xhigh: '很高',
  max: '最高',
};
const levelName = (level: string) => levelNames[level] ?? level;

/**
 * The question box: a glass bar floating over the end of the conversation.
 * Text on top; below it the model, its thinking strength and send / stop.
 * The top edge drags the box taller or shorter (double-click: back to auto).
 */
export function ChatComposer(props: ChatComposerProps) {
  const { text, attachments, models, modelId, busy } = props;
  const ownRef = useRef<HTMLTextAreaElement>(null);
  const ref = props.inputRef ?? ownRef;
  const modelRef = useRef<HTMLButtonElement>(null);
  const reasoningRef = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState<'model' | 'reasoning' | null>(null);
  // null: grow with the text; a number: the height the reader dragged it to.
  const [height, setHeight] = useState<number | null>(null);
  const drag = useRef<{ startY: number; startHeight: number } | null>(null);

  const model = models.find((m) => m.id === modelId);
  const levels = model?.reasoningLevels ?? [];
  const reasoning = props.reasoning && levels.includes(props.reasoning) ? props.reasoning : levels[Math.floor(levels.length / 2)];
  const canSend = !busy && (text.trim() !== '' || attachments.length > 0) && Boolean(model);

  const lineHeight = () => parseFloat(ref.current ? getComputedStyle(ref.current).lineHeight : '') || 22;
  const maxHeight = () => Math.min(440, window.innerHeight * 0.5);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (height !== null) {
      el.style.height = `${height}px`;
      el.style.overflowY = 'auto';
      return;
    }
    const max = lineHeight() * AUTO_ROWS;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
    el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden';
  }, [text, height, ref]);

  const resize = (next: number) => setHeight(Math.round(Math.min(maxHeight(), Math.max(lineHeight(), next))));

  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !ref.current) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { startY: event.clientY, startHeight: ref.current.offsetHeight };
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
  };
  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    // Dragging up makes the box taller.
    if (drag.current) resize(drag.current.startHeight + drag.current.startY - event.clientY);
  };
  const endDrag = () => {
    drag.current = null;
    document.body.style.removeProperty('cursor');
    document.body.style.removeProperty('user-select');
  };
  const gripKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = ref.current?.offsetHeight ?? lineHeight();
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      resize(current + (event.key === 'ArrowUp' ? STEP : -STEP));
    } else if (event.key === 'Home' || event.key === 'Escape') {
      setHeight(null);
    }
  };

  // Models grouped by provider, with a separator between providers.
  const modelEntries: MenuEntry[] = [];
  models.forEach((m, index) => {
    if (index > 0 && models[index - 1]!.providerId !== m.providerId) modelEntries.push({ kind: 'separator', id: `sep-${m.id}` });
    modelEntries.push({ id: m.id, label: `${m.displayName} · ${m.providerName}`, checked: m.id === modelId });
  });
  const reasoningEntries: MenuEntry[] = levels.map((level) => ({ id: level, label: levelName(level), checked: level === reasoning }));

  const anchorAbove = (button: HTMLButtonElement | null) => {
    const box = button?.getBoundingClientRect();
    return box ? { x: box.left, y: box.top - 6 } : { x: 0, y: 0 };
  };

  return (
    <div className="pp-glass pp-composer" data-tone="float" data-resized={height !== null ? 'true' : undefined} onClick={() => ref.current?.focus()}>
      <div
        className="pp-composer__grip"
        role="separator"
        tabIndex={0}
        aria-orientation="horizontal"
        aria-label="拖动调整输入框高度，双击恢复自动"
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        onDoubleClick={() => setHeight(null)}
        onKeyDown={gripKeys}
        onClick={(event) => event.stopPropagation()}
      />

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
        onPaste={(event) => {
          const files = Array.from(event.clipboardData.items).filter(item => item.kind === 'file' && item.type.startsWith('image/')).map(item => item.getAsFile()).filter((file): file is File => file !== null);
          if (!files.length || !props.onPasteImages) return;
          event.preventDefault();
          const text = event.clipboardData.getData('text/plain');
          if (text) {
            const input = event.currentTarget, start = input.selectionStart, end = input.selectionEnd;
            props.onText(props.text.slice(0, start) + text + props.text.slice(end));
          }
          props.onPasteImages(files);
        }}
        onKeyDown={(event) => {
          // Enter sends, Shift+Enter breaks the line; never while an input method is composing.
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            if (canSend) props.onSend();
          }
        }}
      />

      <div className="pp-composer__bar" onClick={(event) => event.stopPropagation()}>
        {props.onCaptureRegion && model?.vision && (
          <IconButton icon="region" label="框选论文中的区域来提问" size="md" shape="pill" className="pp-composer__tool" disabled={busy} onClick={props.onCaptureRegion} />
        )}
        <button
          ref={modelRef}
          type="button"
          className="pp-composer__chip"
          aria-haspopup="menu"
          aria-expanded={menu === 'model'}
          disabled={busy || models.length === 0}
          onClick={() => setMenu(menu === 'model' ? null : 'model')}
        >
          <span className="pp-composer__chip-text">{model ? model.displayName : '选择模型'}</span>
          <Icon name="chevronDown" size={10} strokeWidth={2.2} />
        </button>
        {levels.length > 0 && reasoning && props.onReasoning && (
          <Tooltip label="思考强度：越高越仔细，也越慢、越贵" labelsChild disabled={menu === 'reasoning'}>
            <button
              ref={reasoningRef}
              type="button"
              className="pp-composer__chip"
              aria-label={`思考强度：${levelName(reasoning)}`}
              aria-haspopup="menu"
              aria-expanded={menu === 'reasoning'}
              disabled={busy}
              onClick={() => setMenu(menu === 'reasoning' ? null : 'reasoning')}
            >
              <Icon name="gauge" size={14} />
              <span className="pp-composer__chip-text">{levelName(reasoning)}</span>
              <Icon name="chevronDown" size={10} strokeWidth={2.2} />
            </button>
          </Tooltip>
        )}
        {props.onWebSearch && <Tooltip label={model?.webSearch ? '使用当前模型服务联网搜索，可能产生搜索费用' : '当前接口尚未接入搜索；可选择支持搜索的 Responses、Claude 或专用搜索模型'}>
          <button type="button" className="pp-composer__chip" aria-label="联网搜索" aria-pressed={!!props.webSearch} disabled={busy || !model?.webSearch} onClick={() => props.onWebSearch?.(!props.webSearch)}>
            <Icon name="search" size={14} /><span className="pp-composer__chip-text">联网{props.webSearch ? ' · 开' : ''}</span>
          </button>
        </Tooltip>}
        {props.draftSaveFailed && <span className="pp-composer__warn">草稿未能保存</span>}
        <span className="pp-composer__spacer" />
        {props.onLatest && <Button className="pp-composer__latest" variant="quiet" size="sm" onClick={props.onLatest}>回到最新</Button>}
        {busy ? (
          <IconButton icon="stop" label="停止生成" size="md" shape="pill" className="pp-composer__stop" onClick={props.onStop} />
        ) : (
          <IconButton icon="send" label="发送" shortcut="Enter" size="md" shape="pill" className="pp-composer__send" disabled={!canSend} onClick={props.onSend} />
        )}
      </div>

      {menu === 'model' && (
        <Menu
          label="选择模型"
          entries={modelEntries}
          anchor={anchorAbove(modelRef.current)}
          triggerRef={modelRef}
          onSelect={(id) => id !== modelId && props.onModel(id)}
          onClose={() => setMenu(null)}
        />
      )}
      {menu === 'reasoning' && (
        <Menu
          label="思考强度"
          entries={reasoningEntries}
          anchor={anchorAbove(reasoningRef.current)}
          triggerRef={reasoningRef}
          onSelect={(level) => props.onReasoning?.(level)}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
