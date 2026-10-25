import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Badge, Button, Dialog, EmptyState, IconButton, ScrollArea, Skeleton } from '@/ui/components';
import { PanelHeader } from '../panels/PanelHeader';
import { ChatAnswer, ChatQuestion } from './ChatMessage';
import { ChatComposer } from './ChatComposer';
import { ChatHistory } from './ChatHistory';
import type { ChatSessionView, CitationView, ErrorView, ModelChangeView, ModelView, SessionSummary } from './types';
import './chat.css';

export interface ChatPanelProps {
  /** Panel name: "讨论", or "解释" for explanation sessions. */
  title: string;
  /** Demo data: say so, since nothing is sent or saved. */
  demo?: boolean;
  models: readonly ModelView[];
  /** The open conversation; null before the first question of a new one. */
  session: ChatSessionView | null;
  /** The draft of a new conversation that has no session yet. */
  newDraft?: string;
  sessions: readonly SessionSummary[];
  /** The model a new conversation starts with. */
  defaultModelId: string;
  /** Quick questions offered on an empty conversation. */
  starters: readonly string[];
  placeholder?: string;
  /** For explanations: the passage or screenshot being explained, shown above the answers. */
  source?: ReactNode;
  /** A pending switch to another provider that needs the reader's OK. */
  modelChange: ModelChangeView | null;

  onDraft: (text: string) => void;
  onRemoveAttachment: (id: string) => void;
  /** Sends the current draft. */
  onSend: () => void;
  /** Sends a quick question or a suggested follow-up as is. */
  onAsk: (question: string) => void;
  onStop: () => void;
  onRegenerate: (messageId: string) => void;
  onEditQuestion: (messageId: string, text: string) => void;
  /** Steps to the previous or next sibling version of a message. */
  onVersion: (messageId: string, direction: -1 | 1) => void;
  onLocate: (citation: CitationView) => void;
  onRecover: (messageId: string, action: ErrorView['recovery'][number]) => void;
  onRetrySuggestions: () => void;
  onModel: (modelId: string) => void;
  onConfirmModelChange: () => void;
  onCancelModelChange: () => void;
  onNewSession: () => void;
  onOpenSession: (id: string) => void;
  onRenameSession: (id: string, title: string) => void;
  onRemoveSession: (id: string) => void;
  onConfigureModels: () => void;
}

/** Stay pinned to the newest text while the reader is at the bottom; leave them alone once they scroll up. */
function useStickToBottom(dep: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [dep]);
  // Docking or resizing the panel changes the height: stay at the newest text if we were there.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (pinned.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const onScroll = () => {
    const el = ref.current;
    if (el) pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  };
  return { ref, onScroll, pin: () => (pinned.current = true) };
}

export function ChatPanel(props: ChatPanelProps) {
  const { session, models } = props;
  const [view, setView] = useState<'chat' | 'history'>('chat');
  const [removing, setRemoving] = useState<SessionSummary | null>(null);
  const messages = session?.messages ?? [];
  const last = messages[messages.length - 1];
  const busy = messages.some((m) => m.generation?.state === 'running' || m.generation?.state === 'queued');
  const modelId = session?.modelId ?? props.defaultModelId;
  // Follow the text as it streams: the length of the last message changes on every chunk.
  const scroll = useStickToBottom(`${session?.id}:${messages.length}:${last?.markdown.length}:${session?.suggestions.state}`);

  useEffect(() => {
    if (session) setView('chat');
  }, [session?.id]);

  const send = (run: () => void) => {
    scroll.pin();
    run();
  };

  const header = (
    <PanelHeader
      title={view === 'history' ? '历史对话' : props.title}
      meta={props.demo ? <Badge>演示，不会调用模型</Badge> : undefined}
      actions={
        <>
          <IconButton
            icon="history"
            label={view === 'history' ? '返回对话' : '历史对话'}
            size="md"
            shape="pill"
            active={view === 'history'}
            aria-pressed={view === 'history'}
            onClick={() => setView(view === 'history' ? 'chat' : 'history')}
          />
          <IconButton
            icon="plus"
            label="新对话"
            size="md"
            shape="pill"
            disabled={busy || (!session && view === 'chat')}
            onClick={() => {
              props.onNewSession();
              setView('chat');
            }}
          />
        </>
      }
    />
  );

  if (models.length === 0) {
    return (
      <div className="pp-panel pp-chat">
        {header}
        <EmptyState
          icon="discuss"
          title="还没有可用的模型"
          description="在设置里填入你自己的模型接口和密钥后，就可以就这篇论文提问。阅读、批注和笔记不受影响。"
          actions={
            <Button size="sm" onClick={props.onConfigureModels}>
              打开模型设置
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="pp-panel pp-chat">
      {header}

      {view === 'history' ? (
        <ChatHistory
          sessions={props.sessions}
          currentId={session?.id ?? null}
          onOpen={(id) => {
            props.onOpenSession(id);
            setView('chat');
          }}
          onRename={props.onRenameSession}
          onRemove={(id) => setRemoving(props.sessions.find((s) => s.id === id) ?? null)}
        />
      ) : (
        <>
          {session && <div className="pp-chat__title">{session.title}</div>}
          <ScrollArea className="pp-chat__scroll" viewportClassName="pp-chat__viewport" viewportRef={scroll.ref} onScroll={scroll.onScroll}>
            {props.source}
            {messages.length === 0 ? (
              <div className="pp-chat-start">
                <p className="pp-chat-start__lead">就这篇论文提问。回答会注明出处，点出处可以跳回原文。</p>
                {props.starters.length > 0 && (
                  <ul className="pp-chat-start__list" aria-label="快捷问题">
                    {props.starters.map((question) => (
                      <li key={question}>
                        <button type="button" className="pp-chat-ask" onClick={() => send(() => props.onAsk(question))}>
                          {question}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <ol className="pp-chat__messages">
                {messages.map((message) => (
                  <li key={message.id}>
                    {message.role === 'user' ? (
                      <ChatQuestion
                        message={message}
                        busy={busy}
                        onEdit={(text) => send(() => props.onEditQuestion(message.id, text))}
                        onVersion={(direction) => props.onVersion(message.id, direction)}
                      />
                    ) : (
                      <ChatAnswer
                        message={message}
                        latest={message === last}
                        busy={busy}
                        onRegenerate={() => send(() => props.onRegenerate(message.id))}
                        onVersion={(direction) => props.onVersion(message.id, direction)}
                        onLocate={props.onLocate}
                        onRecover={(action) => props.onRecover(message.id, action)}
                      />
                    )}
                  </li>
                ))}
              </ol>
            )}

            {session && last?.role === 'assistant' && !busy && session.suggestions.state !== 'idle' && (
              <section className="pp-chat-follow" aria-label="推荐追问">
                {session.suggestions.state === 'loading' ? (
                  <Skeleton lines={2} />
                ) : session.suggestions.state === 'failed' ? (
                  <p className="pp-chat-follow__failed">
                    推荐追问没有生成。
                    <Button size="sm" variant="quiet" onClick={props.onRetrySuggestions}>
                      重试
                    </Button>
                  </p>
                ) : (
                  session.suggestions.questions.map((question) => (
                    <button key={question} type="button" className="pp-chat-ask" onClick={() => send(() => props.onAsk(question))}>
                      {question}
                    </button>
                  ))
                )}
              </section>
            )}
          </ScrollArea>

          <ChatComposer
            text={session?.draft.text ?? props.newDraft ?? ''}
            attachments={session?.draft.attachments ?? []}
            placeholder={props.placeholder ?? '就这篇论文提问，Enter 发送，Shift+Enter 换行'}
            models={models}
            modelId={modelId}
            busy={busy}
            draftSaveFailed={session?.draftSaveFailed}
            onText={props.onDraft}
            onRemoveAttachment={props.onRemoveAttachment}
            onSend={() => send(props.onSend)}
            onStop={props.onStop}
            onModel={props.onModel}
          />
        </>
      )}

      <Dialog
        open={props.modelChange !== null}
        onClose={props.onCancelModelChange}
        title={props.modelChange ? `换用 ${props.modelChange.target.providerName} 的 ${props.modelChange.target.displayName}？` : ''}
        description={props.modelChange ? `接下来提问时，下面这些内容可能会发送到 ${props.modelChange.target.endpointOrigin}。已有的回答保留原来的模型记录。` : undefined}
        footer={
          <>
            <Button onClick={props.onCancelModelChange}>保持原模型</Button>
            <Button variant="primary" onClick={props.onConfirmModelChange}>
              换用
            </Button>
          </>
        }
      >
        {props.modelChange && (
          <ul className="pp-chat-disclosure">
            <li>本次对话中的 {props.modelChange.messageCount} 条消息</li>
            {props.modelChange.imageCount > 0 && <li>{props.modelChange.imageCount} 张截图</li>}
            {props.modelChange.documents.map((title) => (
              <li key={title}>《{title}》中与问题相关的段落</li>
            ))}
          </ul>
        )}
      </Dialog>

      <Dialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title="删除这段对话？"
        description={removing ? `「${removing.title}」的问答会从列表中移除。` : undefined}
        footer={
          <>
            <Button onClick={() => setRemoving(null)}>取消</Button>
            <Button
              variant="danger"
              onClick={() => {
                if (removing) props.onRemoveSession(removing.id);
                setRemoving(null);
              }}
            >
              删除
            </Button>
          </>
        }
      />
    </div>
  );
}
