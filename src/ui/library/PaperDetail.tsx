import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Badge, Button, EmptyState, GlassSurface, Icon, Menu, ProgressBar, StarToggle, TagInput, TextArea, type MenuEntry } from '@/ui/components';
import { formatDate } from './columns';
import type { FolderView, PaperView, TagView } from './types';

interface PaperDetailProps {
  paper: PaperView | null;
  /** How many papers are selected; the pane shows a summary for several. */
  selectionCount: number;
  folders: readonly FolderView[];
  tags: readonly TagView[];
  onUpdate: (id: string, patch: Partial<Pick<PaperView, 'title' | 'authors' | 'venue' | 'year' | 'abstract' | 'shortNote'>>) => void;
  onToggleStar: (id: string, starred: boolean) => void;
  onAddTag: (id: string, tag: { id?: string; label: string }) => void;
  onRemoveTag: (id: string, tagId: string) => void;
  onMove: (id: string, folderId: string | null) => void;
  onOpen: (id: string, newTab: boolean) => void;
  onRemove: (id: string) => void;
}

export function folderPath(folders: readonly FolderView[], id: string | null): string {
  if (!id) return '文献库根目录';
  const names: string[] = [];
  let current: string | null = id;
  while (current) {
    const folder = folders.find((f) => f.id === current);
    if (!folder) break;
    names.unshift(folder.name);
    current = folder.parentId;
  }
  return names.join(' / ');
}

/** Folders as menu entries, indented by depth. */
export function folderEntries(folders: readonly FolderView[], current: string | null): MenuEntry[] {
  const out: MenuEntry[] = [{ id: '__root', label: '文献库根目录', checked: current === null }];
  const walk = (parentId: string | null, depth: number) => {
    folders
      .filter((f) => f.parentId === parentId)
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
      .forEach((folder) => {
        out.push({ id: folder.id, label: `${' '.repeat(depth)}${folder.name}`, checked: folder.id === current });
        walk(folder.id, depth + 1);
      });
  };
  walk(null, 0);
  return out;
}

/** Text that saves when it loses focus (or on Enter for single lines). */
function InlineField({
  label,
  value,
  multiline,
  placeholder,
  onCommit,
  variant,
}: {
  label: string;
  value: string;
  multiline?: boolean;
  placeholder?: string;
  onCommit: (value: string) => void;
  /** Title: large, wraps and grows, Enter saves. */
  variant?: 'title';
}) {
  const [draft, setDraft] = useState(value);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  // Esc blurs the field too; the blur must not save the draft it is throwing away.
  const cancelled = useRef(false);
  useEffect(() => setDraft(value), [value]);
  useLayoutEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);
  const arm = () => {
    cancelled.current = false;
  };
  const commit = () => {
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    if (draft.trim() !== value) onCommit(draft.trim());
  };
  const keys = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.currentTarget.blur();
    }
    if (event.key === 'Escape') {
      cancelled.current = true;
      setDraft(value);
      event.currentTarget.blur();
    }
  };
  if (multiline) {
    // Capped so a very long abstract scrolls inside the field instead of pushing everything else away.
    return <TextArea label={label} value={draft} onChange={setDraft} onBlur={commit} rows={2} maxRows={8} placeholder={placeholder} />;
  }
  return (
    <label className={variant === 'title' ? 'pp-lib-inline pp-lib-inline--title' : 'pp-lib-inline'}>
      <span className={variant === 'title' ? 'pp-visually-hidden' : 'pp-lib-inline__label'}>{label}</span>
      {variant === 'title' ? (
        <textarea ref={titleRef} rows={1} value={draft} onChange={(event) => setDraft(event.target.value)} onFocus={arm} onBlur={commit} onKeyDown={keys} />
      ) : (
        <input value={draft} placeholder={placeholder} onChange={(event) => setDraft(event.target.value)} onFocus={arm} onBlur={commit} onKeyDown={keys} />
      )}
    </label>
  );
}

export function PaperDetail(props: PaperDetailProps) {
  const { paper, selectionCount, folders, tags } = props;
  const moveRef = useRef<HTMLButtonElement>(null);
  const [moveOpen, setMoveOpen] = useState(false);

  if (!paper || selectionCount > 1) {
    return (
      <GlassSurface as="aside" tone="panel" radius="panel" className="pp-lib-detail" aria-label="论文详情">
        <EmptyState
          icon="file"
          title={selectionCount > 1 ? `已选择 ${selectionCount} 篇论文` : '选择一篇论文'}
          description={selectionCount > 1 ? '可以用下方的批量操作一起整理。' : '在列表中点一篇论文，这里会显示它的书目信息、标签和阅读进度。'}
        />
      </GlassSurface>
    );
  }

  const selectedTags = paper.tagIds.map((id) => tags.find((tag) => tag.id === id)).filter((tag): tag is TagView => Boolean(tag));

  return (
    <GlassSurface as="aside" tone="panel" radius="panel" className="pp-lib-detail" aria-label="论文详情">
      <div className="pp-lib-detail__scroll">
        <div className="pp-lib-detail__head">
          <StarToggle starred={paper.starred} onChange={(on) => props.onToggleStar(paper.id, on)} />
          <span className="pp-lib-detail__badges">
            <Badge>{paper.source === 'local' ? '本地文件' : '网页论文'}</Badge>
            {!paper.hasPdf && <Badge tone="warn">无 PDF</Badge>}
          </span>
        </div>

        <InlineField key={`title-${paper.id}`} label="标题" variant="title" value={paper.title} onCommit={(title) => title && props.onUpdate(paper.id, { title })} />
        <InlineField
          key={`authors-${paper.id}`}
          label="作者"
          value={paper.authors.join(', ')}
          placeholder="用逗号分隔"
          onCommit={(text) => props.onUpdate(paper.id, { authors: text.split(/[,，]/).map((a) => a.trim()).filter(Boolean) })}
        />
        <div className="pp-lib-detail__pair">
          <InlineField key={`venue-${paper.id}`} label="期刊 / 会议" value={paper.venue ?? ''} onCommit={(venue) => props.onUpdate(paper.id, { venue: venue || undefined })} />
          <InlineField
            key={`year-${paper.id}`}
            label="年份"
            value={paper.year ? String(paper.year) : ''}
            onCommit={(year) => props.onUpdate(paper.id, { year: /^\d{4}$/.test(year) ? Number(year) : undefined })}
          />
        </div>
        <InlineField key={`abstract-${paper.id}`} label="摘要" value={paper.abstract ?? ''} multiline onCommit={(abstract) => props.onUpdate(paper.id, { abstract: abstract || undefined })} />

        <div className="pp-lib-detail__section">
          <span className="pp-lib-inline__label">标签</span>
          <TagInput
            label="标签"
            selected={selectedTags}
            options={tags}
            onAdd={(tag) => props.onAddTag(paper.id, tag)}
            onRemove={(tagId) => props.onRemoveTag(paper.id, tagId)}
          />
        </div>

        <div className="pp-lib-detail__section">
          <span className="pp-lib-inline__label">文件夹</span>
          <button
            ref={moveRef}
            type="button"
            className="pp-lib-detail__folder"
            aria-haspopup="menu"
            aria-expanded={moveOpen}
            onClick={() => setMoveOpen((open) => !open)}
          >
            <Icon name="folder" size={15} />
            <span>{[...new Set([...(paper.folderId?[paper.folderId]:[]),...(paper.folderIds??[])])].map(id=>folderPath(folders,id)).join('；') || '未分类'}</span>
            <Icon name="chevronDown" size={12} strokeWidth={2} />
          </button>
        </div>

        <InlineField key={`note-${paper.id}`} label="短注释" value={paper.shortNote ?? ''} multiline placeholder="一句话记下为什么收藏它" onCommit={(note) => props.onUpdate(paper.id, { shortNote: note || undefined })} />

        <dl className="pp-lib-detail__facts">
          {paper.progress !== undefined && (
            <>
              <dt>阅读进度</dt>
              <dd>
                <ProgressBar value={paper.progress} label="阅读进度" detail={`${Math.round(paper.progress * 100)}%`} />
              </dd>
            </>
          )}
          <dt>批注</dt>
          <dd>{paper.annotationCount} 条</dd>
          {paper.pageCount !== undefined && (
            <>
              <dt>页数</dt>
              <dd>{paper.pageCount} 页</dd>
            </>
          )}
          <dt>添加</dt>
          <dd>{formatDate(paper.addedAt)}</dd>
          <dt>最近阅读</dt>
          <dd>{formatDate(paper.lastReadAt)}</dd>
        </dl>
      </div>

      <div className="pp-lib-detail__actions">
        <Button variant="primary" icon="file" disabled={!paper.hasPdf} onClick={() => props.onOpen(paper.id, false)}>
          {paper.hasPdf ? '打开阅读' : '还没有 PDF'}
        </Button>
        <Button variant="quiet" icon="openExternal" disabled={!paper.hasPdf} onClick={() => props.onOpen(paper.id, true)}>
          新标签页
        </Button>
        <span className="pp-lib-detail__spacer" />
        <Button variant="danger" icon="trash" onClick={() => props.onRemove(paper.id)}>
          移出
        </Button>
      </div>

      {moveOpen && (
        <Menu
          label="移动到文件夹"
          entries={folderEntries(folders, paper.folderId)}
          anchor={(() => {
            const box = moveRef.current?.getBoundingClientRect();
            return box ? { x: box.left, y: box.bottom + 6 } : { x: 0, y: 0 };
          })()}
          triggerRef={moveRef}
          onSelect={(id) => props.onMove(paper.id, id === '__root' ? null : id)}
          onClose={() => setMoveOpen(false)}
        />
      )}
    </GlassSurface>
  );
}
