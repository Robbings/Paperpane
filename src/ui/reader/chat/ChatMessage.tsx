import { useState, type ReactNode } from 'react';
import { Button, Icon, IconButton, Markdown, Spinner, TextArea, stripSourceMarkers, toast } from '@/ui/components';
import { SourceMarker } from '../SourceMarker';
import type { AttachmentView, ChatMessageView, CitationView, ErrorView } from './types';

interface VersionProps {
  version?: ChatMessageView['version'];
  disabled?: boolean;
  onVersion: (direction: -1 | 1) => void;
}

/** "‹ 2/3 ›" for edited questions and regenerated answers. */
function VersionSwitch({ version, disabled, onVersion }: VersionProps) {
  if (!version || version.count < 2) return null;
  return (
    <span className="pp-chat-version" role="group" aria-label={`版本 ${version.index} / ${version.count}`}>
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
        {version.index}/{version.count}
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

/** The reader's question: a soft bubble on the right; its tools float underneath on hover. */
export function ChatQuestion({ message, busy, onEdit, onVersion }: QuestionProps) {
  const [editing, setEditing] = useState<string | null>(null);

  if (editing !== null) {
    const changed = editing.trim() !== '' && editing.trim() !== message.markdown.trim();
    const submit = () => {
      onEdit(editing.trim());
      setEditing(null);
    };
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
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && changed) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <div className="pp-chat-q__edit-bar">
          <span>原来的问答会保留为另一个版本</span>
          <Button size="sm" variant="quiet" onClick={() => setEditing(null)}>
            取消
          </Button>
          <Button size="sm" variant="primary" disabled={!changed} onClick={submit}>
            重新提问
          </Button>
        </div>
      </div>
    );
  }

  const versions = (message.version?.count ?? 1) > 1;
  return (
    <div className="pp-chat-q">
      <Attachments items={message.attachments} />
      {message.markdown && <div className="pp-chat-q__bubble">{message.markdown}</div>}
      <div className="pp-chat-q__tools" data-versions={versions ? 'true' : undefined}>
        <span className="pp-chat-q__hover">
          <IconButton icon="copy" label="复制问题" size="md" shape="pill" onClick={() => copy(message.markdown)} />
          <IconButton icon="edit" label="修改问题" size="md" shape="pill" disabled={busy} onClick={() => setEditing(message.markdown)} />
        </span>
        <VersionSwitch version={message.version} disabled={busy} onVersion={onVersion} />
      </div>
    </div>
  );
}

interface AnswerProps {
  message: ChatMessageView;
  /** The latest answer keeps its tools visible; older ones show them on hover. */
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

/** Source markers numbered in the order the answer cites them. */
function numbering(markdown: string, citations: readonly CitationView[]) {
  const numbers = new Map<string, number>();
  for (const [, label] of markdown.matchAll(/\[\^([^\]]+)\]/g)) {
    if (label && !numbers.has(label) && citations.some((c) => c.label === label)) numbers.set(label, numbers.size + 1);
  }
  return numbers;
}

/** A generated answer: plain text with faint source markers, and one quiet line of tools. */
export function ChatAnswer({ message, latest, busy, onRegenerate, onVersion, onLocate, onRecover }: AnswerProps) {
  const state = message.generation?.state ?? 'completed';
  const running = state === 'running' || state === 'queued';
  const numbers = numbering(message.markdown, message.citations);

  const marker = (label: string): ReactNode => {
    const citation = message.citations.find((c) => c.label === label);
    const number = numbers.get(label);
    // A marker whose source has not arrived yet stays out of the way.
    if (!citation || number === undefined) return null;
    return <SourceMarker number={number} quote={citation.quote} pageLabel={citation.pageLabel} verified={citation.verified} onLocate={() => onLocate(citation)} />;
  };

  let note: ReactNode = null;
  if (message.generation?.state === 'failed' || message.generation?.state === 'save-failed') {
    const { state: failedState, error } = message.generation;
    note = (
      <p className="pp-chat-note" data-tone={failedState === 'failed' ? 'danger' : 'warn'} role="alert">
        <Icon name="alert" size={14} />
        <span>
          {failedState === 'save-failed' ? `回答没有保存成功：${error.message}` : error.message}
          {message.markdown && failedState === 'failed' && ' 已生成的部分保留在上面。'}
        </span>
        {error.recovery.map((action) => (
          <Button key={action} size="sm" variant="quiet" onClick={() => onRecover(action)}>
            {failedState === 'save-failed' && action === 'retry' ? '重新保存' : recoveryLabels[action]}
          </Button>
        ))}
      </p>
    );
  } else if (state === 'interrupted') {
    note = (
      <p className="pp-chat-note" data-tone="warn">
        <Icon name="alert" size={14} />
        <span>生成被中断了，上面是已保存的部分。</span>
        <Button size="sm" variant="quiet" disabled={busy} onClick={onRegenerate}>
          重新生成
        </Button>
      </p>
    );
  }

  const waiting = running && !message.markdown;
  return (
    <article className="pp-chat-a" data-latest={latest ? 'true' : undefined} aria-busy={running}>
      {waiting ? (
        <p className="pp-chat-a__waiting">
          <Spinner size={12} /> {state === 'queued' ? '等待开始' : '正在阅读论文'}
        </p>
      ) : (
        message.markdown && (
          <Markdown text={message.markdown} renderCitation={marker} className={state === 'running' ? 'pp-chat-a__text pp-chat-a__text--streaming' : 'pp-chat-a__text'} />
        )
      )}

      {note}

      {!running && (
        // Right-aligned: what shows on hover sits to the left, versions stay put at the end.
        <div className="pp-chat-a__tools">
          {state === 'stopped' && <span className="pp-chat-a__state">已停止</span>}
          <span className="pp-chat-a__hover">
            {message.model && <span className="pp-chat-a__model">{message.model.displayName}</span>}
            <IconButton icon="copy" label="复制回答" size="md" shape="pill" disabled={!message.markdown} onClick={() => copy(stripSourceMarkers(message.markdown))} />
            <IconButton icon="rotate" label="重新生成" size="md" shape="pill" disabled={busy} onClick={onRegenerate} />
          </span>
          <VersionSwitch version={message.version} disabled={busy} onVersion={onVersion} />
        </div>
      )}
    </article>
  );
}
