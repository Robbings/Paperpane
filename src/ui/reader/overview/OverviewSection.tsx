import { useRef, useState, type ReactNode } from 'react';
import { Button, Icon, IconButton, Markdown, MarkdownInline, Menu, Skeleton, Tooltip } from '@/ui/components';
import type { OverviewCardDef, OverviewResultView, OverviewSourceView } from './types';

interface SourceMarkerProps {
  number: number;
  source: OverviewSourceView;
  onLocate: (source: OverviewSourceView) => void;
}

/** A small number after a claim: hover shows the quoted passage, click goes to it in the paper. */
export function SourceMarker({ number, source, onLocate }: SourceMarkerProps) {
  const label = source.verified ? `${source.pageLabel ?? ''}：“${source.quote}”` : `没有在论文中找到这句引文：“${source.quote}”`;
  return (
    <Tooltip label={label} labelsChild>
      <button
        type="button"
        className="pp-source-marker"
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
  /** Page-wide marker number for one of this card's source labels. */
  numberOf: (label: string) => number | undefined;
  canGenerate: boolean;
  onRegenerate: () => void;
  onHide: () => void;
  onCopy: () => void;
  onLocate: (source: OverviewSourceView) => void;
}

const skeletonLines = (card: OverviewCardDef) =>
  card.display === 'lead' ? 2 : card.output === 'list' ? (card.listStyle === 'tags' ? 1 : 3) : card.output === 'fields' ? 4 : 3;

/** One part of the overview page. Only the title shows; its actions appear on hover. */
export function OverviewSection({ card, result, numberOf, canGenerate, onRegenerate, onHide, onCopy, onLocate }: OverviewSectionProps) {
  const [menu, setMenu] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);
  const running = result.state === 'running' || result.state === 'queued';
  const lead = card.display === 'lead';

  const marker = (label: string): ReactNode => {
    const source = result.sources?.find((s) => s.label === label);
    const number = numberOf(label);
    // Markers for sources that never arrived (e.g. still streaming) stay out of the way.
    if (!source || number === undefined) return null;
    return <SourceMarker number={number} source={source} onLocate={onLocate} />;
  };

  let body: ReactNode = null;
  const content = result.content;
  if (!content && (running || result.state === 'empty')) {
    body = <Skeleton lines={skeletonLines(card)} />;
  } else if (content?.output === 'markdown') {
    body = <Markdown text={content.markdown} renderCitation={marker} className={lead ? 'pp-ov-lead' : 'pp-ov-prose'} />;
  } else if (content?.output === 'list' && card.listStyle === 'tags') {
    body = (
      <ul className="pp-ov-keywords">
        {content.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    );
  } else if (content?.output === 'list') {
    body = (
      <ol className="pp-ov-points">
        {content.items.map((item) => (
          <li key={item}>
            <MarkdownInline text={item} renderCitation={marker} />
          </li>
        ))}
      </ol>
    );
  } else if (content?.output === 'fields') {
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

  return (
    <section
      className="pp-ov-section"
      data-lead={lead ? 'true' : undefined}
      data-running={result.state === 'running' ? 'true' : undefined}
      aria-label={card.name}
      aria-busy={running}
    >
      {!lead && (
        <header className="pp-ov-section__head">
          <h3>{card.name}</h3>
          <span className="pp-ov-section__actions">
            <IconButton icon="copy" label={`复制「${card.name}」`} size="md" shape="pill" disabled={!content} onClick={onCopy} />
            <IconButton icon="rotate" label={`重新生成「${card.name}」`} size="md" shape="pill" disabled={!canGenerate || running} onClick={onRegenerate} />
            <IconButton ref={moreRef} icon="more" label="更多" size="md" shape="pill" aria-haspopup="menu" onClick={() => setMenu((open) => !open)} />
          </span>
        </header>
      )}

      {body}

      {result.state === 'failed' && (
        <p className="pp-ov-section__note" data-tone="danger" role="alert">
          <Icon name="alert" size={14} />
          <span>{result.error?.message ?? '这一部分没有生成成功。'}</span>
          {canGenerate && (
            <Button size="sm" variant="quiet" onClick={onRegenerate}>
              重试
            </Button>
          )}
        </p>
      )}
      {result.state === 'interrupted' && (
        <p className="pp-ov-section__note" data-tone="warn">
          <Icon name="alert" size={14} />
          <span>生成被中断，上面是已保存的部分。</span>
          {canGenerate && (
            <Button size="sm" variant="quiet" onClick={onRegenerate}>
              继续生成
            </Button>
          )}
        </p>
      )}
      {result.state === 'stopped' && <p className="pp-ov-section__aside">已停止，保留了已生成的部分。</p>}

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
          onSelect={onHide}
          onClose={() => setMenu(false)}
        />
      )}
    </section>
  );
}
