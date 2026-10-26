import { useId, useRef, useState, type ReactNode } from 'react';
import { Button, Icon, IconButton, Markdown, MarkdownInline, Menu, Skeleton, Tooltip } from '@/ui/components';
import type { OverviewCardDef, OverviewContent, OverviewResultView, OverviewSourceView } from './types';

interface SourceMarkerProps {
  number: number;
  source: OverviewSourceView;
  onLocate: (source: OverviewSourceView) => void;
}

/** A small number after a claim: faint until hovered; shows the quote and goes to it in the paper. Never copied. */
export function SourceMarker({ number, source, onLocate }: SourceMarkerProps) {
  const label = source.verified ? `${source.pageLabel ?? ''}：“${source.quote}”` : `没有在论文中找到这句引文：“${source.quote}”`;
  return (
    <Tooltip label={label} labelsChild>
      <button
        type="button"
        className="pp-source-marker"
        data-copy-skip=""
        data-unverified={source.verified ? undefined : 'true'}
        aria-label={source.verified ? `出处 ${number}，${source.pageLabel ?? ''}，跳到原文` : `出处 ${number}，未能核实`}
        onClick={() => source.verified && onLocate(source)}
      >
        {number}
      </button>
    </Tooltip>
  );
}

interface OverviewSectionProps {
  card: OverviewCardDef;
  result: OverviewResultView;
  collapsed: boolean;
  onCollapsed: (collapsed: boolean) => void;
  /** Page-wide marker number for one of this card's source labels. */
  numberOf: (label: string) => number | undefined;
  canGenerate: boolean;
  onRegenerate: () => void;
  onHide: () => void;
  onCopy: () => void;
  onLocate: (source: OverviewSourceView) => void;
}

const skeletonLines: Record<OverviewCardDef['output'], number> = { markdown: 3, tags: 1, points: 4, fields: 4 };

/** What a collapsed section still says about itself. */
function summary(content?: OverviewContent): string | null {
  if (!content) return null;
  if (content.output === 'tags') return content.tags.join(' · ');
  if (content.output === 'points') return `${content.points.length} 条`;
  if (content.output === 'fields') return content.fields.map((f) => f.label).join(' · ');
  return null;
}

/** One part of the overview page: a title row that folds the part away, and its content. */
export function OverviewSection(props: OverviewSectionProps) {
  const { card, result, collapsed } = props;
  const [menu, setMenu] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);
  const bodyId = useId();
  const running = result.state === 'running' || result.state === 'queued';
  const lead = card.display === 'lead';
  const content = result.content;

  const marker = (label: string): ReactNode => {
    const source = result.sources?.find((s) => s.label === label);
    const number = props.numberOf(label);
    // Markers whose source has not arrived yet stay out of the way.
    if (!source || number === undefined) return null;
    return <SourceMarker number={number} source={source} onLocate={props.onLocate} />;
  };

  let body: ReactNode;
  if (!content) {
    body = running || result.state === 'empty' ? <Skeleton lines={lead ? 2 : skeletonLines[card.output]} /> : null;
  } else if (content.output === 'markdown') {
    body = <Markdown text={content.markdown} renderCitation={marker} className={lead ? 'pp-ov-lead' : 'pp-ov-prose'} />;
  } else if (content.output === 'tags') {
    body = (
      <ul className="pp-ov-tags">
        {content.tags.map((tag) => (
          <li key={tag}>{tag}</li>
        ))}
      </ul>
    );
  } else if (content.output === 'points') {
    body = (
      <ol className="pp-ov-points">
        {content.points.map((point) => (
          <li key={point.title}>
            <strong className="pp-ov-points__title">{point.title}</strong>：
            <MarkdownInline text={point.text} renderCitation={marker} />
          </li>
        ))}
      </ol>
    );
  } else {
    body = (
      <dl className="pp-ov-fields">
        {content.fields.map((field) => (
          <div key={field.label}>
            <dt>{field.label}</dt>
            <dd>
              <MarkdownInline text={field.value} renderCitation={marker} />
            </dd>
          </div>
        ))}
      </dl>
    );
  }

  const notes = (
    <>
      {result.state === 'failed' && (
        <p className="pp-ov-section__note" data-tone="danger" role="alert">
          <Icon name="alert" size={14} />
          <span>{result.error?.message ?? '这一部分没有生成成功。'}</span>
          {props.canGenerate && (
            <Button size="sm" variant="quiet" onClick={props.onRegenerate}>
              重试
            </Button>
          )}
        </p>
      )}
      {result.state === 'interrupted' && (
        <p className="pp-ov-section__note" data-tone="warn">
          <Icon name="alert" size={14} />
          <span>生成被中断，上面是已保存的部分。</span>
          {props.canGenerate && (
            <Button size="sm" variant="quiet" onClick={props.onRegenerate}>
              继续生成
            </Button>
          )}
        </p>
      )}
      {result.state === 'stopped' && <p className="pp-ov-section__aside">已停止，保留了已生成的部分。</p>}
    </>
  );

  // The opening lines have no title and do not fold.
  if (lead) {
    return (
      <section className="pp-ov-section" data-lead="true" data-running={result.state === 'running' ? 'true' : undefined} aria-label={card.name} aria-busy={running}>
        {body}
        {notes}
      </section>
    );
  }

  const folded = summary(content);
  return (
    <section
      className="pp-ov-section"
      data-collapsed={collapsed ? 'true' : undefined}
      data-running={result.state === 'running' ? 'true' : undefined}
      aria-label={card.name}
      aria-busy={running}
    >
      <header className="pp-ov-section__head">
        <button type="button" className="pp-ov-section__toggle" aria-expanded={!collapsed} aria-controls={bodyId} onClick={() => props.onCollapsed(!collapsed)}>
          <Icon name="chevronRight" size={12} strokeWidth={2.2} className="pp-ov-section__chevron" />
          <h3>{card.name}</h3>
          {collapsed && folded && <span className="pp-ov-section__summary">{folded}</span>}
        </button>
        <span className="pp-ov-section__actions">
          <IconButton icon="copy" label={`复制「${card.name}」`} size="md" shape="pill" disabled={!content} onClick={props.onCopy} />
          <IconButton icon="rotate" label={`重新生成「${card.name}」`} size="md" shape="pill" disabled={!props.canGenerate || running} onClick={props.onRegenerate} />
          <IconButton ref={moreRef} icon="more" label="更多" size="md" shape="pill" aria-haspopup="menu" onClick={() => setMenu((open) => !open)} />
        </span>
      </header>

      {/* Folding animates the height: the grid row goes from 1fr to 0fr. */}
      <div id={bodyId} className="pp-ov-section__body" inert={collapsed}>
        <div className="pp-ov-section__inner">
          {body}
          {notes}
        </div>
      </div>

      {menu && (
        <Menu
          label={`「${card.name}」操作`}
          entries={[{ id: 'hide', label: '隐藏这一部分' }]}
          anchor={(() => {
            const box = moreRef.current?.getBoundingClientRect();
            return box ? { x: box.right, y: box.bottom + 4 } : { x: 0, y: 0 };
          })()}
          align="end"
          triggerRef={moreRef}
          onSelect={props.onHide}
          onClose={() => setMenu(false)}
        />
      )}
    </section>
  );
}
