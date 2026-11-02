import type { ResearchTextRenderer } from '@/ai/markdown';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Button, Dialog, EmptyState, Icon, IconButton, ScrollArea, Skeleton, cleanCopyHandlers } from '@/ui/components';
import { PanelBody } from '../panels/PanelBody';
import { ChatAnswer, ChatQuestion } from './ChatMessage';
import { ChatComposer } from './ChatComposer';
import { ChatSessions } from './ChatSessions';
import type { ChatSessionView, CitationView, ErrorView, ModelChangeView, ModelView, SessionSummary } from './types';
import './chat.css';

export interface ChatPanelProps {
  /** Panel name: "讨论", or "解释" for explanation sessions. */
  title: string;
  mode?:'conversation'|'explanation';
  hideHeader?:boolean;
  headerActions?:ReactNode;
  renderAnswerText?: ResearchTextRenderer;
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
  /**
   * A pending switch to another provider. Changing models is an ordinary act in a chat, so it is
   * confirmed at once without a dialog; the answers keep their own model record.
   */
  modelChange: ModelChangeView | null;

  /** Draft edits; quick questions and suggested follow-ups also land here, to send or adjust. */
  onDraft: (text: string) => void;
  onRemoveAttachment: (id: string) => void;
  /** Sends the current draft. */
  onSend: () => void;
  onStop: () => void;
  onRegenerate: (messageId: string) => void;
  onEditQuestion: (messageId: string, text: string) => void;
  /** Steps to the previous or next sibling version of a message. */
  onVersion: (messageId: string, direction: -1 | 1) => void;
  onLocate: (citation: CitationView) => void;
  onRecover: (messageId: string, action: ErrorView['recovery'][number]) => void;
  onRetrySuggestions: () => void;
  onModel: (modelId: string) => void;
  /** Sets the session's thinking strength. */
  onReasoning?: (level: string) => void;
  /** Starts picking a region of the paper to attach as an image. */
  onCaptureRegion?: () => void;
  onPasteImages?: (files: File[]) => void;
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
  const [away,setAway]=useState(false);
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
    if (el) {pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;setAway(!pinned.current);}
  };
  return { ref, onScroll, away, pin: () => { pinned.current = true;setAway(false);const el=ref.current;if(el)el.scrollTop=el.scrollHeight; } };
}

export function ChatPanel(props: ChatPanelProps) {
  const { session, models } = props;
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [removing, setRemoving] = useState<SessionSummary | null>(null);
  // Never interrupts: a switch the logic layer asks about is taken as chosen.
  useEffect(() => {
    if (props.modelChange) props.onConfirmModelChange();
  }, [props.modelChange]);
  const titleRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messages = session?.messages ?? [];
  const last = messages[messages.length - 1];
  const busy = messages.some((m) => m.generation?.state === 'running' || m.generation?.state === 'queued');
  const modelId = session?.modelId ?? props.defaultModelId;
  // Follow the text as it streams: the length of the last message changes on every chunk.
  const scroll = useStickToBottom(`${session?.id}:${messages.length}:${last?.markdown.length}:${session?.suggestions.state}`);

  /** Puts a quick question or follow-up in the box, ready to send or adjust. */
  const prefill = (question: string) => {
    props.onDraft(question);
    window.setTimeout(() => {
      const el = inputRef.current;
      el?.focus();
      el?.setSelectionRange(el.value.length, el.value.length);
    }, 0);
  };

  const header = (
    <div className="pp-panel__header pp-chat__header">
      <h2 className="pp-panel__title">{props.title}</h2>
      {props.mode!=='explanation' && models.length > 0 && (
        <button
          ref={titleRef}
          type="button"
          className="pp-chat__session"
          aria-haspopup="dialog"
          aria-expanded={sessionsOpen}
          onClick={() => setSessionsOpen((open) => !open)}
        >
          <span>{session?.title ?? '新对话'}</span>
          <Icon name="chevronDown" size={11} strokeWidth={2} />
        </button>
      )}
      <span className="pp-panel__spacer" />
      {props.mode!=='explanation' && <IconButton icon="plus" label="新对话" size="md" shape="pill" disabled={busy || !session} onClick={props.onNewSession} />}
      {props.headerActions}
    </div>
  );

  if (models.length === 0) {
    return (
      <div className="pp-panel pp-chat">
        {!props.hideHeader && header}
        <PanelBody>
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
        </PanelBody>
      </div>
    );
  }

  return (
    <div className="pp-panel pp-chat">
      {!props.hideHeader && header}
      <PanelBody>
        <ScrollArea
          className="pp-chat__scroll"
          viewportClassName="pp-chat__viewport"
          viewportRef={scroll.ref}
          onScroll={scroll.onScroll}
          style={{ paddingBottom: 8 }}
          {...cleanCopyHandlers}
        >
          {props.source}
          {messages.length === 0 ? (
            <div className="pp-chat-start">
              <p className="pp-chat-start__title">就这篇论文提问</p>
              <p className="pp-chat-start__lead">回答会注明出处，指向句末的小数字可以看到原文，点一下跳过去。</p>
              {props.starters.length > 0 && (
                <ul className="pp-chat-start__list" aria-label="快捷问题">
                  {props.starters.map((question) => (
                    <li key={question}>
                      <button type="button" className="pp-chat-ask" onClick={() => prefill(question)}>
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
                <li key={message.id} data-role={message.role}>
                  {message.role === 'user' ? (
                    <ChatQuestion
                      message={message}
                      busy={busy}
                      onEdit={(text) => {
                        scroll.pin();
                        props.onEditQuestion(message.id, text);
                      }}
                      onVersion={(direction) => props.onVersion(message.id, direction)}
                    />
                  ) : (
                    <ChatAnswer
                      renderText={props.renderAnswerText}
                      message={message}
                      latest={message === last}
                      busy={busy}
                      onRegenerate={() => {
                        scroll.pin();
                        props.onRegenerate(message.id);
                      }}
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
            <section className="pp-chat-follow" aria-label="可以接着问">
              {session.suggestions.state === 'loading' ? (
                <Skeleton lines={2} />
              ) : session.suggestions.state === 'failed' ? (
                <p className="pp-chat-follow__failed">
                  没有生成推荐的追问。
                  <Button size="sm" variant="quiet" onClick={props.onRetrySuggestions}>
                    重试
                  </Button>
                </p>
              ) : (
                session.suggestions.questions.slice(0,3).map((question) => (
                  <button key={question} type="button" className="pp-chat-ask pp-chat-ask--follow" onClick={() => prefill(question)}>
                    <Icon name="chevronRight" size={11} strokeWidth={2} />
                    {question}
                  </button>
                ))
              )}
            </section>
          )}
        </ScrollArea>

        <div className="pp-chat__dock">
        <ChatComposer
          inputRef={inputRef}
          text={session?.draft.text ?? props.newDraft ?? ''}
          attachments={session?.draft.attachments ?? []}
          placeholder={props.placeholder ?? '就这篇论文提问'}
          models={models}
          modelId={modelId}
          busy={busy}
          draftSaveFailed={session?.draftSaveFailed}
          onText={props.onDraft}
          onRemoveAttachment={props.onRemoveAttachment}
          onSend={() => {
            scroll.pin();
            props.onSend();
          }}
          onStop={props.onStop}
          onLatest={scroll.away?scroll.pin:undefined}
          onModel={props.onModel}
          reasoning={session?.reasoning}
          onReasoning={props.onReasoning}
          onCaptureRegion={props.onCaptureRegion}
          onPasteImages={props.onPasteImages}
        />
        </div>
      </PanelBody>

      {props.mode!=='explanation' && <ChatSessions
        anchorRef={titleRef}
        open={sessionsOpen}
        onClose={() => setSessionsOpen(false)}
        sessions={props.sessions}
        currentId={session?.id ?? null}
        canCreate={!busy && Boolean(session)}
        onNew={props.onNewSession}
        onOpen={props.onOpenSession}
        onRename={props.onRenameSession}
        onRemove={(id) => setRemoving(props.sessions.find((s) => s.id === id) ?? null)}
      />}


      <Dialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title="删除这段对话？"
        description={removing ? `「${removing.title}」会从列表中移除，其他对话不受影响。` : undefined}
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
