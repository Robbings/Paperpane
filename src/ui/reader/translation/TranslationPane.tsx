import { Fragment, useEffect, useRef, type ReactNode } from 'react';
import { Button, Icon, IconButton, ProgressBar, ScrollArea, Segmented, Spinner, Tooltip } from '@/ui/components';
import { useTranslationDock } from './dock';
import type { TranslationMode, TranslationPageView, TranslationSentenceView, TranslationTaskView } from './types';
import './translation.css';

interface TranslationPaneProps {
  pages: readonly TranslationPageView[];
  mode: TranslationMode;
  onMode: (mode: TranslationMode) => void;
  /** Keep the translation lined up with where the paper is being read. */
  follow: boolean;
  onFollow: (on: boolean) => void;
  onClose: () => void;
  /** The sentence lit up from either side (pointer over it in the paper or here). */
  activeId: string | null;
  onHover: (id: string | null) => void;
  /** Clicked: show the original in the paper. */
  onLocate: (id: string) => void;
  task: TranslationTaskView;
  onTranslatePage: (pageIndex: number) => void;
  onTranslateAll: () => void;
  onPause: () => void;
  onResume: () => void;
  /** Retries the failed and unfinished sentences of a page; may be charged again. */
  onRetryPage: (pageIndex: number) => void;
  /** Bring a sentence into view: `key` changes on every request, `smooth` for follow vs. a jump. */
  reveal: { id: string; key: number; smooth: boolean; flash: boolean } | null;
}

const REPEAT_CHARGE = '会再次请求模型，可能再次计费；已收到的译文会保留';

/** The line under the header: progress, and pause / resume / translate all. Hidden when all is done. */
function StatusLine({ task, pages, onTranslateAll, onPause, onResume }: Pick<TranslationPaneProps, 'task' | 'pages' | 'onTranslateAll' | 'onPause' | 'onResume'>) {
  const untranslated = pages.filter((p) => p.state === 'untranslated').length;
  const progress = task.totalPages ? task.completedPages / task.totalPages : undefined;
  if (task.phase === 'running' || task.phase === 'pausing') {
    return (
      <div className="pp-tr__status" role="status">
        <Spinner size={12} />
        <span className="pp-tr__status-text">{task.phase === 'pausing' ? '正在暂停…' : `正在翻译${task.current ? task.current : ''}…`}</span>
        <Button size="sm" variant="quiet" disabled={task.phase === 'pausing'} onClick={onPause}>
          暂停
        </Button>
        <span className="pp-tr__status-bar">
          <ProgressBar label="翻译进度" value={progress} />
        </span>
      </div>
    );
  }
  if (task.phase === 'paused' || task.phase === 'interrupted') {
    return (
      <div className="pp-tr__status" role="status">
        <Icon name="clock" size={13} />
        <span className="pp-tr__status-text">{task.phase === 'paused' ? '已暂停' : '上次翻译中断了'}，收到的译文都已保存</span>
        <Button size="sm" variant="quiet" onClick={onResume}>
          继续
        </Button>
      </div>
    );
  }
  if (task.phase === 'failed') {
    return (
      <div className="pp-tr__status" data-tone="danger" role="alert">
        <Icon name="alert" size={13} />
        <span className="pp-tr__status-text">{task.error ?? '翻译出错了'}</span>
        <Tooltip label={REPEAT_CHARGE} labelsChild>
          <Button size="sm" variant="quiet" onClick={onResume}>
            重试
          </Button>
        </Tooltip>
      </div>
    );
  }
  if (untranslated > 0) {
    return (
      <div className="pp-tr__status">
        <span className="pp-tr__status-text">还有 {untranslated} 页没翻译</span>
        <Button size="sm" variant="quiet" onClick={onTranslateAll}>
          整篇翻译
        </Button>
      </div>
    );
  }
  return null;
}

const summary = (pages: readonly TranslationPageView[]) => `已翻译 ${pages.filter((p) => p.state === 'done').length} / ${pages.length} 页`;

/** Groups a page's sentences into paragraphs for the flow. */
function paragraphs(sentences: readonly TranslationSentenceView[]) {
  const groups: TranslationSentenceView[][] = [];
  for (const sentence of sentences) {
    if (sentence.paragraphStart || groups.length === 0 || sentence.kind !== 'text' || groups[groups.length - 1]![0]!.kind !== 'text') groups.push([sentence]);
    else groups[groups.length - 1]!.push(sentence);
  }
  return groups;
}

/**
 * The translation beside the paper: one continuous text, sentence by sentence.
 * Hovering a sentence lights it up here and in the paper; clicking jumps there.
 */
export function TranslationPane(props: TranslationPaneProps) {
  const { pages, mode, activeId } = props;
  const viewport = useRef<HTMLDivElement>(null);
  const dock = useTranslationDock();

  // Scroll a requested sentence into view (a jump from the paper, or following the reading).
  useEffect(() => {
    const request = props.reveal;
    const box = viewport.current;
    const target = request && box?.querySelector<HTMLElement>(`[data-sentence="${CSS.escape(request.id)}"]`);
    if (!request || !box || !target) return;
    const top = target.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - (request.smooth ? 16 : box.clientHeight * 0.3);
    box.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    if (request.flash) {
      target.classList.remove('pp-tr__s--flash');
      void target.offsetWidth;
      target.classList.add('pp-tr__s--flash');
    }
  }, [props.reveal?.key]); // each request once

  const sentence = (s: TranslationSentenceView): ReactNode => {
    const shared = {
      'data-sentence': s.id,
      'data-active': activeId === s.id ? 'true' : undefined,
      onPointerEnter: () => props.onHover(s.id),
      onPointerLeave: () => props.onHover(null),
      onClick: () => props.onLocate(s.id),
    };
    if (s.kind === 'formula') {
      return (
        <Tooltip key={s.id} label="公式不翻译，点按查看原文" labelsChild>
          <button type="button" className="pp-tr__chip" {...shared}>
            <Icon name="explain" size={13} />
            {s.text}
          </button>
        </Tooltip>
      );
    }
    // Received text remains visible while failed or queued for retry.
    const missing = !s.text.trim();
    const crossPage = s.endsOnPage !== undefined && s.endsOnPage !== s.pageIndex && (
      <span className="pp-tr__cont" title="原句跨页">
        至第 {s.endsOnPage + 1} 页
      </span>
    );
    const text = missing ? (
      <span className="pp-tr__missing" lang="en">
        {s.source}
      </span>
    ) : (
      <>
        {s.text}
        {s.state === 'partial' && <span className="pp-tr__cut">…</span>}
        {s.state === 'streaming' && <span className="pp-tr__caret" aria-hidden="true" />}
      </>
    );
    if (mode === 'parallel') {
      return (
        <span key={s.id} className="pp-tr__s pp-tr__s--pair" {...shared}>
          <span className="pp-tr__source" lang="en">
            {s.source}
          </span>
          <span className="pp-tr__target">{missing ? <span className="pp-tr__missing">{s.state === 'failed' ? '没翻译成' : '还没翻译'}</span> : text}</span>
          {crossPage}
        </span>
      );
    }
    return (
      <span key={s.id} className="pp-tr__s" data-state={s.state} title={s.approximate ? '原文位置可能不准确' : undefined} {...shared}>
        {text}
        {crossPage}
      </span>
    );
  };

  return (
    <section className="pp-tr" aria-label="译文" data-floating={dock?.floating ? 'true' : undefined}>
      <header
        className="pp-tr__head"
        onPointerDown={(event) => {
          // Floating: the header is the handle (but not its buttons).
          if (dock?.floating && !(event.target as Element).closest('button')) dock.onHeaderPointerDown(event);
        }}
      >
        <span className="pp-tr__title">译文</span>
        <span className="pp-tr__summary">{summary(pages)}</span>
        <span className="pp-tr__spacer" />
        <Segmented
          label="显示方式"
          size="sm"
          options={[
            { value: 'translation', label: '译文' },
            { value: 'parallel', label: '对照' },
          ]}
          value={mode}
          onChange={props.onMode}
        />
        <IconButton
          icon="link"
          label={props.follow ? '跟随阅读：开' : '跟随阅读：关'}
          size="md"
          shape="pill"
          active={props.follow}
          aria-pressed={props.follow}
          onClick={() => props.onFollow(!props.follow)}
        />
        {dock && (
          <IconButton
            icon={dock.floating ? 'paneRight' : 'float'}
            label={dock.floating ? '停靠到论文右侧' : '悬浮'}
            size="md"
            shape="pill"
            onClick={dock.onToggleFloating}
          />
        )}
        <IconButton icon="close" label="关闭译文" size="md" shape="pill" onClick={props.onClose} />
      </header>

      <StatusLine task={props.task} pages={pages} onTranslateAll={props.onTranslateAll} onPause={props.onPause} onResume={props.onResume} />

      <ScrollArea className="pp-tr__scroll" viewportClassName="pp-tr__viewport" viewportRef={viewport}>
        <div className="pp-tr__flow" data-mode={mode}>
          {pages.map((page) => (
            <Fragment key={page.pageIndex}>
              <div className="pp-tr__page" aria-label={`第 ${page.pageIndex + 1} 页`}>
                <span>第 {page.pageIndex + 1} 页</span>
              </div>
              {page.state === 'untranslated' && !page.sentences.some(s => s.text.trim()) ? (
                <div className="pp-tr__pending">
                  <span>这一页还没翻译</span>
                  <Button size="sm" variant="quiet" onClick={() => props.onTranslatePage(page.pageIndex)}>
                    翻译这一页
                  </Button>
                </div>
              ) : page.state === 'failed' && !page.sentences.some(s => s.text.trim()) ? (
                <div className="pp-tr__pending" data-tone="danger">
                  <span>{page.error ?? '这一页没能翻译'}</span>
                  <Button size="sm" variant="quiet" onClick={() => props.onRetryPage(page.pageIndex)}>
                    重试
                  </Button>
                </div>
              ) : (
                <>
                  {paragraphs(page.sentences).map((group) =>
                    group[0]!.kind === 'heading' ? (
                      <h3 key={group[0]!.id} className="pp-tr__heading">
                        {group.map(sentence)}
                      </h3>
                    ) : group[0]!.kind === 'figure' ? (
                      <p key={group[0]!.id} className="pp-tr__figure">
                        {group.map(sentence)}
                      </p>
                    ) : group[0]!.kind === 'formula' ? (
                      <p key={group[0]!.id} className="pp-tr__formula">
                        {group.map(sentence)}
                      </p>
                    ) : (
                      <p key={group[0]!.id} className="pp-tr__para">
                        {group.map(sentence)}
                      </p>
                    ),
                  )}
                  {page.state === 'translating' && page.sentences.every((x) => x.state === 'pending') && (
                    <p className="pp-tr__waiting">
                      <Spinner size={13} /> 正在翻译这一页…
                    </p>
                  )}
                  {page.state === 'failed' && (
                    <div className="pp-tr__pending" data-tone="danger"><span>{page.error ?? '这一页没能翻译完，已收到的译文保留'}</span><Button size="sm" variant="quiet" onClick={() => props.onRetryPage(page.pageIndex)}>重试</Button></div>
                  )}
                  {page.state === 'partial' && (
                    <PageGaps page={page} task={props.task} onRetry={() => props.onRetryPage(page.pageIndex)} />
                  )}
                </>
              )}
            </Fragment>
          ))}
        </div>
      </ScrollArea>
    </section>
  );
}

/** Under a partly translated page: how many sentences are missing, and a retry when some failed. */
function PageGaps({ page, task, onRetry }: { page: TranslationPageView; task: TranslationTaskView; onRetry: () => void }) {
  const failed = page.sentences.filter((s) => s.state === 'failed').length;
  const unfinished = page.sentences.filter((s) => s.state === 'pending' || s.state === 'partial').length;
  if (failed === 0 && unfinished === 0) return null;
  // While paused, unfinished sentences resume with the task; only failures need a retry here.
  const waiting = failed === 0 && (task.phase === 'paused' || task.phase === 'interrupted' || task.phase === 'running');
  return (
    <div className="pp-tr__pending" data-tone={failed ? 'danger' : undefined}>
      <span>{failed ? `${failed} 句没翻译成${unfinished ? `，${unfinished} 句未完成` : ''}` : `${unfinished} 句未完成`}</span>
      {!waiting && (
        <Tooltip label={REPEAT_CHARGE} labelsChild>
          <Button size="sm" variant="quiet" onClick={onRetry}>
            {failed ? '重试这些句子' : '翻译剩下的'}
          </Button>
        </Tooltip>
      )}
    </div>
  );
}
