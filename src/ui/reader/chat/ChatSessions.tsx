import { useState, type RefObject } from 'react';
import { Icon, IconButton, Popover } from '@/ui/components';
import { formatDate } from '@/ui/library/columns';
import type { SessionSummary } from './types';

interface ChatSessionsProps {
  anchorRef: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  sessions: readonly SessionSummary[];
  currentId: string | null;
  canCreate: boolean;
  onNew: () => void;
  onOpen: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onRemove: (id: string) => void;
}

/** This paper's conversations, opened from the panel title: switch, rename, delete, start a new one. */
export function ChatSessions(props: ChatSessionsProps) {
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);
  const sorted = [...props.sessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const commit = () => {
    if (renaming?.title.trim()) props.onRename(renaming.id, renaming.title.trim());
    setRenaming(null);
  };

  return (
    <Popover anchorRef={props.anchorRef} open={props.open} onClose={props.onClose} label="这篇论文的讨论" placement="bottom-start" width={288} className="pp-chat-sessions">
      <button
        type="button"
        className="pp-chat-sessions__new"
        disabled={!props.canCreate}
        onClick={() => {
          props.onNew();
          props.onClose();
        }}
      >
        <Icon name="plus" size={14} strokeWidth={2} />
        新对话
      </button>
      {sorted.length > 0 && <div className="pp-chat-sessions__label">这篇论文的讨论</div>}
      <ul className="pp-chat-sessions__list">
        {sorted.map((session) => (
          <li key={session.id} className="pp-chat-sessions__item" aria-current={session.id === props.currentId ? 'true' : undefined}>
            {renaming?.id === session.id ? (
              <input
                className="pp-chat-sessions__rename"
                aria-label="对话名称"
                autoFocus
                value={renaming.title}
                onChange={(event) => setRenaming({ id: session.id, title: event.target.value })}
                onBlur={commit}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') commit();
                  if (event.key === 'Escape') {
                    event.stopPropagation();
                    setRenaming(null);
                  }
                }}
              />
            ) : (
              <button
                type="button"
                className="pp-chat-sessions__open"
                onClick={() => {
                  props.onOpen(session.id);
                  props.onClose();
                }}
              >
                <span className="pp-chat-sessions__title">{session.title}</span>
                <span className="pp-chat-sessions__meta">
                  {formatDate(session.updatedAt)} · {session.messageCount} 条
                </span>
              </button>
            )}
            <span className="pp-chat-sessions__tools">
              <IconButton icon="edit" label={`重命名「${session.title}」`} size="md" shape="pill" onClick={() => setRenaming({ id: session.id, title: session.title })} />
              <IconButton icon="trash" label={`删除「${session.title}」`} size="md" shape="pill" onClick={() => props.onRemove(session.id)} />
            </span>
          </li>
        ))}
      </ul>
    </Popover>
  );
}
