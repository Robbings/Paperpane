import { Button, Icon, IconButton, Markdown, Skeleton, toast } from '@/ui/components';
import { formatDate } from '@/ui/library/columns';
import type { OverviewCardDef, OverviewContent, OverviewResultView } from './types';

interface OverviewCardProps {
  card: OverviewCardDef;
  result: OverviewResultView;
  canGenerate: boolean;
  onGenerate: () => void;
  onStop: () => void;
  onConfigureModels: () => void;
}

const asText = (content: OverviewContent): string =>
  content.output === 'markdown'
    ? content.markdown
    : content.output === 'list'
      ? content.items.map((item) => `- ${item}`).join('\n')
      : content.fields.map((field) => `${field.label}：${field.value}`).join('\n');

function Content({ content, listStyle, streaming }: { content: OverviewContent; listStyle?: OverviewCardDef['listStyle']; streaming: boolean }) {
  if (content.output === 'markdown') {
    return <Markdown text={content.markdown} className={streaming ? 'pp-chat-a__text--streaming' : undefined} />;
  }
  if (content.output === 'list') {
    return listStyle === 'tags' ? (
      <ul className="pp-ov-tags">
        {content.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    ) : (
      <ul className="pp-ov-points">
        {content.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    );
  }
  return (
    <dl className="pp-ov-fields">
      {content.fields.map((field) => (
        <div key={field.label}>
          <dt>{field.label}</dt>
          <dd>{field.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** One overview card: a titled section, not a boxed card, so several read as one page. */
export function OverviewCard({ card, result, canGenerate, onGenerate, onStop, onConfigureModels }: OverviewCardProps) {
  const running = result.state === 'running' || result.state === 'queued';
  const hasContent = Boolean(result.content);

  return (
    <section className="pp-ov-card" aria-label={card.name} aria-busy={running}>
      <header className="pp-ov-card__head">
        <h3>{card.name}</h3>
        <span className="pp-ov-card__spacer" />
        {running ? (
          <IconButton icon="stop" label={`停止生成「${card.name}」`} size="md" shape="pill" onClick={onStop} />
        ) : (
          <>
            {hasContent && <IconButton icon="copy" label="复制" size="md" shape="pill" onClick={() => copy(result.content!)} />}
            {result.state !== 'empty' && (
              <IconButton icon="rotate" label="重新生成" size="md" shape="pill" disabled={!canGenerate} onClick={onGenerate} />
            )}
          </>
        )}
      </header>

      {result.state === 'empty' ? (
        <div className="pp-ov-card__empty">
          <span>{card.prompt}</span>
          <Button size="sm" disabled={!canGenerate} onClick={onGenerate}>
            生成
          </Button>
        </div>
      ) : running && !hasContent ? (
        <div className="pp-ov-card__loading">
          <Skeleton lines={card.output === 'list' && card.listStyle === 'tags' ? 1 : 3} />
          {result.state === 'queued' && <span>等待其他卡片生成完…</span>}
        </div>
      ) : (
        result.content && <Content content={result.content} listStyle={card.listStyle} streaming={result.state === 'running'} />
      )}

      {result.state === 'failed' && result.error && (
        <div className="pp-chat-note" data-tone="danger" role="alert">
          <Icon name="alert" size={15} />
          <span className="pp-chat-note__text">{result.error.message}</span>
          {result.error.recovery.includes('retry') && (
            <Button size="sm" variant="quiet" disabled={!canGenerate} onClick={onGenerate}>
              重试
            </Button>
          )}
          {result.error.recovery.includes('configure-model') && (
            <Button size="sm" variant="quiet" onClick={onConfigureModels}>
              检查模型设置
            </Button>
          )}
        </div>
      )}
      {result.state === 'interrupted' && (
        <div className="pp-chat-note" data-tone="warn">
          <Icon name="alert" size={15} />
          <span className="pp-chat-note__text">生成被中断，上方是已保存的部分。</span>
          <Button size="sm" variant="quiet" disabled={!canGenerate} onClick={onGenerate}>
            重新生成
          </Button>
        </div>
      )}

      {(result.state === 'completed' || result.state === 'stopped') && (
        <footer className="pp-ov-card__foot">
          {result.stale && (
            <span className="pp-ov-card__stale">
              卡片设置已修改，结果可能过时
            </span>
          )}
          {result.state === 'stopped' && <span>已停止，保留已生成的部分</span>}
          <span>
            {[result.model, result.generatedAt && formatDate(result.generatedAt)].filter(Boolean).join(' · ')}
          </span>
        </footer>
      )}
    </section>
  );
}

function copy(content: OverviewContent) {
  void navigator.clipboard?.writeText(asText(content)).then(
    () => toast.show({ message: '已复制' }),
    () => toast.show({ message: '无法访问剪贴板', tone: 'warning' }),
  );
}
