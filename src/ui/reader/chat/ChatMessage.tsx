import { useState, type ReactNode } from 'react';
import { Button, Icon, IconButton, Markdown, Spinner, TextArea, Tooltip, stripSourceMarkers, toast } from '@/ui/components';
import type { AttachmentView, ChatMessageView, CitationView, ErrorView } from './types';

interface VersionProps {
  version?: ChatMessageView['version'];
  disabled?: boolean;
  onVersion: (direction: -1 | 1) => void;
}

/** "‹ 2 / 3 ›" for edited questions and regenerated answers. */
function VersionSwitch({ version, disabled, onVersion }: VersionProps) {
  if (!version || version.count < 2) return null;
  return (
    <span className="pp-chat-version" role="group" aria-label="版本">
      <IconButton
        icon="chevronRight"
        label="上一个版本"
        size="md"
        shape="pill"
        className="pp-chat-version__prev"
        disabled={disabled || version.index <= 1}
        onClick={() => onVersion(-1)}
      />
      <span className="pp-chat-version__count">
        {version.index} / {version.count}
      </span>
      <IconButton icon="chevronRight" label="下一个版本" size="md" shape="pill" disabled={disabled || version.index >= version.count} onClick={() => onVersion(1)} />
    </span>
  );
}

function Attachments({ items }: { items: readonly AttachmentView[] }) {
  if (items.length === 0) return null;
  return (
    <div className="pp-chat-attachments">
      {items.map((item) => (
        <figure key={item.id} className="pp-chat-attachment" data-missing={item.missing ? 'true' : undefined}>
          {item.previewUrl ? <img src={item.previewUrl} alt={item.name} /> : <Icon name="image" size={18} />}
          {item.pageLabel && <figcaption>{item.pageLabel}</figcaption>}
        </figure>
      ))}
    </div>
  );
}

const copy = (text: string) => {
  void navigator.clipboard?.writeText(text).then(
    () => toast.show({ message: '已复制' }),
    () => toast.show({ message: '无法访问剪贴板', tone: 'warning' }),
  );
};

interface QuestionProps {
  message: ChatMessageView;
  /** Generation is running somewhere in the session: no edits or version changes. */
  busy: boolean;
  onEdit: (text: string) => void;
  onVersion: (direction: -1 | 1) => void;
}

/** The reader's own question: a quiet block on the right, editable into a new version. */
export function ChatQuestion({ message, busy, onEdit, onVersion }: QuestionProps) {
  const [editing, setEditing] = useState<string | null>(null);

  if (editing !== null) {
    return (
      <div className="pp-chat-q pp-chat-q--editing">
        <TextArea
          label="修改问题"
          hideLabel
          value={editing}
          onChange={setEditing}
          rows={2}
          maxRows={8}
          autoFocus
          onKeyDown={(event) => {
            if (event.key === 'Escape') setEditing(null);
          }}
        />
        <p className="pp-chat-q__hint">发送后会得到一个新回答，原来的问答仍保留为另一个版本。</p>
        <div className="pp-chat-q__edit-actions">
          <Button size="sm" variant="quiet" onClick={() => setEditing(null)}>
            取消
          </Button>
          <Button
            size="sm"
            variant="primary"
            disabled={!editing.trim() || editing.trim() === message.markdown.trim()}
            onClick={() => {
              onEdit(editing.trim());
              setEditing(null);
            }}
          >
            发送
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="pp-chat-q">
      <Attachments items={message.attachments} />
      {/* Actions sit beside the question (shown on hover), so they take no extra line. */}
      <div className="pp-chat-q__row">
        <span className="pp-chat-q__actions">
          <IconButton icon="copy" label="复制问题" size="md" shape="pill" onClick={() => copy(message.markdown)} />
          <IconButton icon="edit" label="修改问题" size="md" shape="pill" disabled={busy} onClick={() => setEditing(message.markdown)} />
        </span>
        {message.markdown && <div className="pp-chat-q__text">{message.markdown}</div>}
      </div>
      <VersionSwitch version={message.version} disabled={busy} onVersion={onVersion} />
    </div>
  );
}

interface AnswerProps {
  message: ChatMessageView;
  /** Actions stay visible on the latest answer; older ones show them on hover. */
  latest: boolean;
  busy: boolean;
  onRegenerate: () => void;
  onVersion: (direction: -1 | 1) => void;
  onLocate: (citation: CitationView) => void;
  onRecover: (action: ErrorView['recovery'][number]) => void;
}

const recoveryLabels: Record<ErrorView['recovery'][number], string> = {
  retry: '重试',
  'configure-model': '检查模型设置',
  'change-model': '换个模型',
};

/** A generated answer: plain text on the panel, told apart by its sources and the small model line, not by a bubble. */
export function ChatAnswer({ message, latest, busy, onRegenerate, onVersion, onLocate, onRecover }: AnswerProps) {
  const state = message.generation?.state ?? 'completed';
  const running = state === 'running' || state === 'queued';
  const byLabel = new Map(message.citations.map((citation) => [citation.label, citation]));

  const marker = (label: string): ReactNode => {
    const citation = byLabel.get(label);
    if (!citation) return null;
    return (
      <Tooltip label={`${citation.pageLabel}：${citation.quote}`} labelsChild>
        <button type="button" className="pp-chat-marker" data-copy-skip="" aria-label={`出处 ${label}，${citation.pageLabel}`} onClick={() => onLocate(citation)}>
          {label}
        </button>
      </Tooltip>
    );
  };

  let note: ReactNode = null;
  if (message.generation?.state === 'failed' || message.generation?.state === 'save-failed') {
    const { error } = message.generation;
    note = (
      <div className="pp-chat-note" data-tone={message.generation.state === 'failed' ? 'danger' : 'warn'} role="alert">
        <Icon name="alert" size={15} />
        <span className="pp-chat-note__text">
          {message.generation.state === 'save-failed' ? `回答未能保存：${error.message}` : error.message}
          {message.markdown && message.generation.state === 'failed' && ' 已生成的部分保留在上方。'}
        </span>
        {error.recovery.map((action) => (
          <Button key={action} size="sm" variant="quiet" onClick={() => onRecover(action)}>
            {message.generation?.state === 'save-failed' && action === 'retry' ? '重新保存' : recoveryLabels[action]}
          </Button>
        ))}
      </div>
    );
  } else if (state === 'interrupted') {
    note = (
      <div className="pp-chat-note" data-tone="warn">
        <Icon name="alert" size={15} />
        <span className="pp-chat-note__text">生成被中断（页面关闭或连接断开），上方是已保存的部分。</span>
        <Button size="sm" variant="quiet" disabled={busy} onClick={onRegenerate}>
          重新生成
        </Button>
      </div>
    );
  }

  return (
    <article className="pp-chat-a" data-latest={latest ? 'true' : undefined} aria-busy={running}>
      {state === 'queued' && !message.markdown ? (
        <p className="pp-chat-a__waiting">
          <Spinner size={13} /> 等待开始…
        </p>
      ) : state === 'running' && !message.markdown ? (
        <p className="pp-chat-a__waiting">
          <Spinner size={13} /> 正在阅读论文…
        </p>
      ) : (
        <Markdown text={message.markdown} renderCitation={marker} className={state === 'running' ? 'pp-chat-a__text pp-chat-a__text--streaming' : 'pp-chat-a__text'} />
      )}

      {message.citations.length > 0 && !running && (
        <div className="pp-chat-sources" aria-label="出处">
          {message.citations.map((citation) => (
            <Tooltip key={citation.id} label={citation.quote} labelsChild>
              <button type="button" className="pp-chat-source" aria-label={`出处 ${citation.label}：${citation.pageLabel}`} onClick={() => onLocate(citation)}>
                <span className="pp-chat-source__label">{citation.label}</span>
                {citation.pageLabel}
              </button>
            </Tooltip>
          ))}
        </div>
      )}

      {note}

      {!running && (
        <footer className="pp-chat-a__foot">
          {message.model && (
            <span className="pp-chat-a__model">
              {message.model.displayName}
              {state === 'stopped' && ' · 已停止，保留已生成的部分'}
            </span>
          )}
          <span className="pp-chat-a__spacer" />
          <VersionSwitch version={message.version} disabled={busy} onVersion={onVersion} />
          <span className="pp-chat-a__actions">
            <IconButton icon="copy" label="复制回答" size="md" shape="pill" disabled={!message.markdown} onClick={() => copy(stripSourceMarkers(message.markdown))} />
            <IconButton icon="rotate" label="重新生成" size="md" shape="pill" disabled={busy} onClick={onRegenerate} />
          </span>
        </footer>
      )}
    </article>
  );
}
