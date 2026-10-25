import { useRef, useState } from 'react';
import { IconButton, Menu, ScrollArea } from '@/ui/components';
import { formatDate } from '@/ui/library/columns';
import type { SessionSummary } from './types';

interface ChatHistoryProps {
  sessions: readonly SessionSummary[];
  currentId: string | null;
  onOpen: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onRemove: (id: string) => void;
}

/** Earlier conversations about this paper, newest first. */
export function ChatHistory({ sessions, currentId, onOpen, onRename, onRemove }: ChatHistoryProps) {
  const [menu, setMenu] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);
  const menuButtons = useRef(new Map<string, HTMLButtonElement>());

  if (sessions.length === 0) return <p className="pp-panel__empty">还没有讨论记录。</p>;

  const sorted = [...sessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const commitRename = () => {
    if (renaming && renaming.title.trim()) onRename(renaming.id, renaming.title.trim());
    setRenaming(null);
  };

  return (
    <ScrollArea className="pp-chat-history" viewportClassName="pp-chat-history__viewport">
      <ul className="pp-chat-history__list">
        {sorted.map((session) => (
          <li key={session.id} className="pp-chat-history__item" aria-current={session.id === currentId ? 'true' : undefined}>
            {renaming?.id === session.id ? (
              <input
                className="pp-chat-history__rename"
                aria-label="对话名称"
                autoFocus
                value={renaming.title}
                onChange={(event) => setRenaming({ id: session.id, title: event.target.value })}
                onBlur={commitRename}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') commitRename();
                  if (event.key === 'Escape') {
                    event.stopPropagation();
                    setRenaming(null);
                  }
                }}
              />
            ) : (
              <button type="button" className="pp-chat-history__open" onClick={() => onOpen(session.id)}>
                <span className="pp-chat-history__title">{session.title}</span>
                <span className="pp-chat-history__meta">
                  {formatDate(session.updatedAt)} · {session.messageCount} 条消息
                </span>
              </button>
            )}
            <IconButton
              ref={(el) => {
                if (el) menuButtons.current.set(session.id, el);
              }}
              icon="more"
              label="更多操作"
              size="md"
              shape="pill"
              className="pp-chat-history__more"
              aria-haspopup="menu"
              onClick={() => setMenu(menu === session.id ? null : session.id)}
            />
          </li>
        ))}
      </ul>
      {menu && (
        <Menu
          label="对话操作"
          entries={[
            { id: 'rename', label: '重命名' },
            { kind: 'separator', id: 'sep' },
            { id: 'remove', label: '删除对话', icon: 'trash' },
          ]}
          anchor={(() => {
            const box = menuButtons.current.get(menu)?.getBoundingClientRect();
            return box ? { x: box.right, y: box.bottom + 4 } : { x: 0, y: 0 };
          })()}
          align="end"
          triggerRef={{ current: menuButtons.current.get(menu) ?? null }}
          onSelect={(id) => {
            const session = sessions.find((s) => s.id === menu);
            if (!session) return;
            if (id === 'rename') setRenaming({ id: session.id, title: session.title });
            else onRemove(session.id);
          }}
          onClose={() => setMenu(null)}
        />
      )}
    </ScrollArea>
  );
}
