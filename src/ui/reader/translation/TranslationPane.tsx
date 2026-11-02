import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, Icon, IconButton, Popover, ProgressBar, ScrollArea, Segmented, Tooltip } from '@/ui/components';
import { useTranslationDock } from './dock';
import type { TranslationMode, TranslationPageView, TranslationSentenceView, TranslationTaskView } from './types';
import './translation.css';

interface TranslationPaneProps {
  pages: readonly TranslationPageView[];
  /** Runtime can render model Markdown without changing this pane's layout. */
  renderText?: (sentence: TranslationSentenceView) => ReactNode;
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
  onRetranslatePage?: (pageIndex: number) => void;
  onRetranslateAll?: () => void;
  /** Bring a sentence into view: `key` changes on every request, `smooth` for follow vs. a jump. */
  reveal: { id: string; key: number; smooth: boolean; flash: boolean } | null;
}

const taskIdle = (task: TranslationTaskView) => task.phase !== 'running' && task.phase !== 'pausing';
/** Task details stay in an opt-in popover, never between the reader and its text. */
function TaskStatus({ task, pages, onTranslateAll, onPause, onResume }: Pick<TranslationPaneProps, 'task' | 'pages' | 'onTranslateAll' | 'onPause' | 'onResume'>) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const running = task.phase === 'running' || task.phase === 'pausing';
  const waiting = running && !!task.error;
  const resumable = ['paused', 'interrupted', 'failed'].includes(task.phase);
  const title = waiting ? '等待恢复' : ({ idle: '翻译任务', running: '正在翻译', pausing: '正在暂停', paused: '已暂停', interrupted: '翻译已中断', failed: '翻译需要处理', completed: '翻译完成' }[task.phase]);
  const progress = task.totalSentences ? (task.completedSentences ?? 0) / task.totalSentences : task.totalPages ? task.completedPages / task.totalPages : undefined;
  return <>
    <IconButton ref={anchor} icon={task.phase === 'failed' ? 'alert' : waiting || resumable ? 'clock' : running ? 'sync' : 'gauge'}
      label={`翻译任务：${title}`} size="md" shape="pill" active={open} aria-expanded={open} aria-haspopup="dialog" tooltip={!open}
      className={running && !waiting ? 'pp-tr__task-running' : undefined} data-tone={task.phase === 'failed' ? 'danger' : undefined}
      onClick={() => setOpen(value => !value)} />
    <Popover anchorRef={anchor} open={open} onClose={() => setOpen(false)} label="翻译任务详情" placement="bottom" width={280} className="pp-tr__task">
      <div className="pp-tr__task-heading"><strong>{title}</strong><IconButton icon="close" label="收起翻译状态" size="md" shape="pill" onClick={() => setOpen(false)} /></div>
      <p>{task.totalSentences ? `本次任务已完成 ${task.completedSentences ?? 0} / ${task.totalSentences} 句` : `已有 ${pages.filter(p => p.state === 'done').length} / ${pages.length} 页译文`}</p>
      {task.totalSentences !== undefined && <ProgressBar label="翻译进度" value={progress} />}
      {task.current && running && <p>{task.current}</p>}
      {task.error && <p className="pp-tr__task-error">{task.error}</p>}
      <div className="pp-tr__task-actions">
        {running ? <Button size="sm" disabled={task.phase === 'pausing'} onClick={onPause}>暂停</Button> : <>
          {resumable && <Button size="sm" onClick={onResume}>{task.saveFailed ? '重试保存' : task.phase === 'failed' ? '重试未完成部分' : '继续'}</Button>}
          {pages.some(p => p.state !== 'done') && <Button size="sm" variant="quiet" onClick={onTranslateAll}>翻译全文</Button>}
        </>}
      </div>
    </Popover>
  </>;
}

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
    const bounds = box.getBoundingClientRect(), targetBounds = target.getBoundingClientRect();
    // Automatic following leaves a sentence already visible in place. Explicit clicks still locate it.
    if (request.smooth && targetBounds.top >= bounds.top + 24 && targetBounds.bottom <= bounds.bottom - 24) return;
    const top = targetBounds.top - bounds.top + box.scrollTop - box.clientHeight * 0.3;
    box.scrollTo({ top: Math.max(0, top), behavior: request.smooth ? 'smooth' : 'auto' });
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
        <Tooltip key={s.id} label="公式、图表不翻译，点按在论文中查看" labelsChild>
          <button type="button" className="pp-tr__chip" {...shared}>
            <Icon name="region" size={13} />
            查看原文
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
        {props.renderText ? props.renderText(s) : s.text}
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
        {/* Until the whole paper is translated, the way to do it sits right here, in words. */}
        {taskIdle(props.task) && pages.some(p => p.state !== 'done') && (
          <button type="button" className="pp-tr__all" onClick={['paused', 'interrupted', 'failed'].includes(props.task.phase) ? props.onResume : props.onTranslateAll}>
            翻译全文
          </button>
        )}
        <span className="pp-tr__spacer" />
        <TaskStatus task={props.task} pages={pages} onTranslateAll={props.onTranslateAll} onPause={props.onPause} onResume={props.onResume} />
        <IconButton
          icon="link"
          label={props.follow ? '跟随阅读：开' : '跟随阅读：关'}
          size="md"
          shape="pill"
          active={props.follow}
          aria-pressed={props.follow}
          onClick={() => props.onFollow(!props.follow)}
        />
        {taskIdle(props.task) && !pages.some(p => p.state !== 'done') && props.onRetranslateAll && pages.some(p => p.sentences.some(s => s.kind !== 'formula' && !!s.text)) && (
          <IconButton icon="sync" label="重新翻译全文" size="md" shape="pill" onClick={props.onRetranslateAll} />
        )}
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

      <ScrollArea className="pp-tr__scroll" viewportClassName="pp-tr__viewport" viewportRef={viewport}>
        <div className="pp-tr__flow" data-mode={mode}>
          {pages.map((page) => (
            <Fragment key={page.pageIndex}>
              <div className="pp-tr__page" aria-label={`第 ${page.pageIndex + 1} 页`}>
                <span>第 {page.pageIndex + 1} 页</span>
                <span className="pp-tr__page-rule" aria-hidden="true" />
                <Button size="sm" variant="quiet" disabled={!taskIdle(props.task) || (!!page.error && !page.sentences.some(s => s.kind !== 'formula'))}
                  onClick={() => page.state === 'failed' ? props.onRetryPage(page.pageIndex) : page.sentences.some(s => s.kind !== 'formula' && !!s.text) && props.onRetranslatePage ? props.onRetranslatePage(page.pageIndex) : props.onTranslatePage(page.pageIndex)}>
                  {page.state === 'failed' && page.sentences.some(s => s.kind !== 'formula') ? '重试本页' : page.sentences.some(s => s.kind !== 'formula' && !!s.text) && props.onRetranslatePage ? '重新翻译本页' : '翻译本页'}
                </Button>
              </div>
              {(page.error || page.state === 'failed') && <p className="pp-tr__missing">{page.error ?? '这一页没能翻译完，已收到的译文保留'}</p>}
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
            </Fragment>
          ))}
        </div>
      </ScrollArea>
    </section>
  );
}
