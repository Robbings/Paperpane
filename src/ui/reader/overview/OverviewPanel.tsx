import { useMemo, useRef, useState } from 'react';
import { Button, EmptyState, IconButton, Menu, ScrollArea, Spinner, toast } from '@/ui/components';
import { formatDate } from '@/ui/library/columns';
import { PanelHeader } from '../panels/PanelHeader';
import { OverviewSection } from './OverviewSection';
import type { OverviewCardDef, OverviewContent, OverviewResultView, OverviewSourceView } from './types';
import './overview.css';

export interface OverviewPanelProps {
  demo?: boolean;
  /** All cards in display order; hidden ones are skipped. */
  cards: readonly OverviewCardDef[];
  /**
   * This paper's result per card id. The logic layer starts generating when
   * the paper opens (when a model is set up), so the panel only shows progress.
   */
  results: Readonly<Record<string, OverviewResultView>>;
  modelReady: boolean;
  onRegenerate: (cardIds: string[]) => void;
  onStop: (cardIds: string[]) => void;
  onHide: (cardId: string) => void;
  /** Card prompts and forms are edited in settings. */
  onManageCards: () => void;
  onLocate: (source: OverviewSourceView) => void;
  onConfigureModels: () => void;
}

const MARKER = /\[\^([^\]]+)\]/g;
const emptyResult: OverviewResultView = { state: 'empty' };

const textsOf = (content?: OverviewContent): string[] =>
  !content ? [] : content.output === 'markdown' ? [content.markdown] : content.output === 'list' ? [...content.items] : content.fields.map((f) => f.value);

const plain = (text: string) => text.replace(MARKER, '').replace(/\s+([，。；、,.;])/g, '$1');

function toMarkdown(card: OverviewCardDef, content: OverviewContent): string {
  const body =
    content.output === 'markdown'
      ? plain(content.markdown)
      : content.output === 'list'
        ? card.listStyle === 'tags'
          ? content.items.join('、')
          : content.items.map((item, i) => `${i + 1}. ${plain(item)}`).join('\n')
        : content.fields.map((field) => `- **${field.label}**：${plain(field.value)}`).join('\n');
  return card.display === 'lead' ? body : `## ${card.name}\n\n${body}`;
}

const timeOf = (iso: string) => {
  const date = new Date(iso);
  return `${formatDate(iso)} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

/** The paper at a glance, laid out as one page: opening lines, keywords, the structured summary, key points. */
export function OverviewPanel(props: OverviewPanelProps) {
  const [menu, setMenu] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);
  const visible = props.cards.filter((card) => card.visible);
  const resultOf = (id: string) => props.results[id] ?? emptyResult;
  const runningIds = visible.filter((card) => ['running', 'queued'].includes(resultOf(card.id).state)).map((card) => card.id);
  const running = runningIds.length > 0;
  const generated = visible.map((card) => resultOf(card.id)).filter((r) => r.generatedAt);
  const anyContent = visible.some((card) => resultOf(card.id).content);
  const stale = generated.some((r) => r.stale);

  // Markers are numbered in reading order across the whole page; a source cited twice keeps its number.
  const numbers = useMemo(() => {
    const map = new Map<string, number>();
    for (const card of visible) {
      for (const text of textsOf(props.results[card.id]?.content)) {
        for (const [, label] of text.matchAll(MARKER)) {
          const key = `${card.id}:${label}`;
          if (!map.has(key) && props.results[card.id]?.sources?.some((s) => s.label === label)) map.set(key, map.size + 1);
        }
      }
    }
    return map;
  }, [visible, props.results]);

  const latest = generated.reduce<OverviewResultView | undefined>((a, b) => (!a || (b.generatedAt ?? '') > (a.generatedAt ?? '') ? b : a), undefined);
  const models = [...new Set(generated.map((r) => r.model).filter(Boolean))];

  const copy = (text: string) =>
    void navigator.clipboard?.writeText(text).then(
      () => toast.show({ message: '已复制' }),
      () => toast.show({ message: '无法访问剪贴板', tone: 'warning' }),
    );
  const copyAll = () =>
    copy(
      visible
        .map((card) => {
          const content = resultOf(card.id).content;
          return content ? toMarkdown(card, content) : null;
        })
        .filter(Boolean)
        .join('\n\n'),
    );

  const header = (
    <PanelHeader
      title="概览"
      meta={
        running ? (
          <span className="pp-ov__status">
            <Spinner size={11} /> 正在整理
          </span>
        ) : undefined
      }
      actions={
        <>
          {running ? (
            <IconButton icon="stop" label="停止生成" size="md" shape="pill" onClick={() => props.onStop(runningIds)} />
          ) : (
            <IconButton
              icon="rotate"
              label="全部重新生成"
              size="md"
              shape="pill"
              disabled={!props.modelReady || visible.length === 0}
              onClick={() => props.onRegenerate(visible.map((card) => card.id))}
            />
          )}
          <IconButton ref={moreRef} icon="more" label="更多" size="md" shape="pill" aria-haspopup="menu" onClick={() => setMenu((open) => !open)} />
        </>
      }
    />
  );

  const menuEl = menu && (
    <Menu
      label="概览操作"
      entries={[
        { id: 'copy', label: '复制全部（Markdown）', icon: 'copy', disabled: !anyContent },
        { kind: 'separator', id: 'sep' },
        { id: 'manage', label: '管理概览内容…', icon: 'settings' },
      ]}
      anchor={(() => {
        const box = moreRef.current?.getBoundingClientRect();
        return box ? { x: box.right, y: box.bottom + 4 } : { x: 0, y: 0 };
      })()}
      align="end"
      triggerRef={moreRef}
      onSelect={(id) => (id === 'copy' ? copyAll() : props.onManageCards())}
      onClose={() => setMenu(false)}
    />
  );

  if (!props.modelReady && !anyContent) {
    return (
      <div className="pp-panel pp-ov">
        {header}
        <EmptyState
          icon="overview"
          title="还没有可用的模型"
          description="在设置里填入模型接口后，每次打开论文都会自动整理出一页概览。"
          actions={
            <Button size="sm" onClick={props.onConfigureModels}>
              打开模型设置
            </Button>
          }
        />
        {menuEl}
      </div>
    );
  }

  return (
    <div className="pp-panel pp-ov">
      {header}
      <ScrollArea className="pp-ov__scroll" viewportClassName="pp-ov__viewport">
        {!props.modelReady && (
          <p className="pp-ov__notice">
            模型暂不可用，下面是上次整理的结果。
            <Button size="sm" variant="quiet" onClick={props.onConfigureModels}>
              检查模型设置
            </Button>
          </p>
        )}
        {visible.length === 0 ? (
          <p className="pp-panel__empty">概览的所有内容都已隐藏，可以在「管理概览内容」里重新打开。</p>
        ) : (
          <div className="pp-ov__page">
            {visible.map((card) => (
              <OverviewSection
                key={card.id}
                card={card}
                result={resultOf(card.id)}
                numberOf={(label) => numbers.get(`${card.id}:${label}`)}
                canGenerate={props.modelReady}
                onRegenerate={() => props.onRegenerate([card.id])}
                onHide={() => props.onHide(card.id)}
                onCopy={() => {
                  const content = resultOf(card.id).content;
                  if (content) copy(toMarkdown(card, content));
                }}
                onLocate={props.onLocate}
              />
            ))}
          </div>
        )}
        {latest?.generatedAt && !running && (
          <footer className="pp-ov__foot">
            <span>
              由 {models.join('、')} 整理 · {timeOf(latest.generatedAt)}
              {props.demo && ' · 演示内容，不会调用模型'}
            </span>
            {stale && (
              <span className="pp-ov__stale">
                概览设置改过，
                <button type="button" onClick={() => props.onRegenerate(visible.filter((c) => resultOf(c.id).stale).map((c) => c.id))}>
                  按新设置重新生成
                </button>
              </span>
            )}
          </footer>
        )}
      </ScrollArea>
      {menuEl}
    </div>
  );
}
