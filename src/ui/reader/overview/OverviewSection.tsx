import type { ResearchTextRenderer } from '@/ai/markdown';
import { useId, useRef, useState, type ReactNode } from 'react';
import { Button, Icon, IconButton, Markdown, MarkdownInline, Menu, Skeleton } from '@/ui/components';
import { SourceMarker } from '../SourceMarker';
import type { OverviewCardDef, OverviewContent, OverviewResultView, OverviewSourceView } from './types';

interface OverviewSectionProps {
  renderText?: ResearchTextRenderer;
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

const skeletonLines = (card: OverviewCardDef) => (card.output === 'list' ? (card.listStyle === 'tags' ? 1 : 4) : card.output === 'fields' ? 4 : 3);

/** What a collapsed section still says about itself. */
function summary(card: OverviewCardDef, content?: OverviewContent): string | null {
  if (!content) return null;
  if (content.output === 'list') return card.listStyle === 'tags' ? content.items.map((i) => i.text).join(' · ') : `${content.items.length} 条`;
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
    return <SourceMarker number={number} quote={source.quote} pageLabel={source.pageLabel} verified={source.verified} onLocate={() => props.onLocate(source)} />;
  };

  let body: ReactNode;
  if (!content) {
    body = running || result.state === 'empty' ? <Skeleton lines={lead ? 2 : skeletonLines(card)} /> : null;
  } else if (content.output === 'markdown') {
    body = props.renderText ? props.renderText(content.markdown,marker,lead ? 'pp-ov-lead' : 'pp-ov-prose') : <Markdown text={content.markdown} renderCitation={marker} className={lead ? 'pp-ov-lead' : 'pp-ov-prose'} />;
  } else if (content.output === 'list' && card.listStyle === 'tags') {
    body = (
      <ul className="pp-ov-tags">
        {content.items.map((item) => (
          <li key={item.text}>{item.text}</li>
        ))}
      </ul>
    );
  } else if (content.output === 'list') {
    body = (
      <ol className="pp-ov-points">
        {content.items.map((item, index) => (
          <li key={index}>
            {item.title && (
              <>
                <strong className="pp-ov-points__title">{item.title}</strong>：
              </>
            )}
            {props.renderText ? props.renderText(item.text,marker,undefined,true) : <MarkdownInline text={item.text} renderCitation={marker} />}
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
              {props.renderText ? props.renderText(field.value,marker,undefined,true) : <MarkdownInline text={field.value} renderCitation={marker} />}
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

  const folded = summary(card, content);
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
