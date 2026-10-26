import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { Badge, Icon, ScrollArea, StarToggle } from '@/ui/components';
import { authorLine, columnDefaults, columnLabels, formatDate } from './columns';
import { PAPER_DRAG_TYPE } from './dragTypes';
import type { ColumnId, LibraryQuery, PaperView, TagView } from './types';

interface LibraryTableProps {
  papers: readonly PaperView[];
  tagsById: ReadonlyMap<string, TagView>;
  /** Visible optional columns, in order, after the title and star. Columns that do not fit the width are left out. */
  columns: readonly ColumnId[];
  widths: Partial<Record<ColumnId, number>>;
  onWidths: (patch: Partial<Record<ColumnId, number>>) => void;
  sort: LibraryQuery['sort'];
  onSort: (column: ColumnId) => void;
  mode: 'compact' | 'detailed';
  selectedIds: readonly string[];
  /** The paper shown in the detail pane and the keyboard position. */
  activeId: string | null;
  onSelection: (selectedIds: string[], activeId: string | null) => void;
  onOpen: (id: string, newTab: boolean) => void;
  onToggleStar: (id: string, starred: boolean) => void;
  /** Shown instead of rows when the list is empty. */
  empty: ReactNode;
  /** More results exist beyond those loaded; scrolling near the end asks for them. */
  hasMore: boolean;
  onLoadMore: () => void;
}

const CHECK = 40;
/** Horizontal padding of the scrolling area. */
const GUTTER = 24;
const ABSTRACT_MAX = 600;

/** Very long abstracts (e.g. a whole paper picked up by mistake) are cut before the line clamp. */
const clip = (text: string) => (text.length > ABSTRACT_MAX ? `${text.slice(0, ABSTRACT_MAX).trimEnd()}…` : text);

export function LibraryTable(props: LibraryTableProps) {
  const { papers, tagsById, widths, sort, mode, selectedIds, activeId, hasMore, onLoadMore } = props;
  const anchor = useRef<string | null>(activeId);
  const bodyRef = useRef<HTMLTableSectionElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(Number.POSITIVE_INFINITY);
  const selected = new Set(selectedIds);
  const ids = papers.map((p) => p.id);
  const allSelected = papers.length > 0 && ids.every((id) => selected.has(id));
  const someSelected = ids.some((id) => selected.has(id));

  const widthOf = (column: ColumnId) => widths[column] ?? columnDefaults[column].width;

  // Detailed rows carry authors, venue and year themselves; only a date column stays beside them.
  const wanted: ColumnId[] = mode === 'detailed' ? [sort.column === 'lastReadAt' ? 'lastReadAt' : 'addedAt'] : [...props.columns];
  // The title takes the remaining space. When the list gets narrow, columns
  // drop from the end instead of the table scrolling sideways.
  const needed = (columns: readonly ColumnId[]) => CHECK + widthOf('starred') + columnDefaults.title.min + columns.reduce((sum, c) => sum + widthOf(c), 0);
  const shown = [...wanted];
  while (shown.length > 0 && needed(shown) > available) shown.pop();
  const all: ColumnId[] = ['title', 'starred', ...shown];

  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setAvailable(el.clientWidth - GUTTER));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Load more when the end is near, and keep loading while the rows do not fill the view.
  const maybeLoadMore = () => {
    const el = viewport.current;
    if (el && hasMore && el.scrollTop + el.clientHeight > el.scrollHeight - 240) onLoadMore();
  };
  useEffect(maybeLoadMore, [papers.length, hasMore, available]);

  const rangeTo = (id: string) => {
    const from = ids.indexOf(anchor.current ?? id);
    const to = ids.indexOf(id);
    const [a, b] = from < to ? [from, to] : [to, from];
    return ids.slice(Math.max(a, 0), b + 1);
  };

  const onRowClick = (event: MouseEvent, id: string) => {
    if (event.shiftKey) {
      props.onSelection(rangeTo(id), id);
    } else if (event.metaKey || event.ctrlKey) {
      props.onSelection(selected.has(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id], id);
      anchor.current = id;
    } else {
      props.onSelection([id], id);
      anchor.current = id;
    }
  };

  const focusRow = (id: string) => bodyRef.current?.querySelector<HTMLElement>(`[data-paper-id="${CSS.escape(id)}"]`)?.focus();

  const onRowKey = (event: KeyboardEvent, id: string) => {
    const index = ids.indexOf(id);
    const move = (next: string | undefined) => {
      if (!next) return;
      event.preventDefault();
      if (event.shiftKey) props.onSelection(rangeTo(next), next);
      else {
        props.onSelection([next], next);
        anchor.current = next;
      }
      focusRow(next);
    };
    if (event.key === 'ArrowDown') move(ids[index + 1]);
    else if (event.key === 'ArrowUp') move(ids[index - 1]);
    else if (event.key === 'Home') move(ids[0]);
    else if (event.key === 'End') move(ids[ids.length - 1]);
    else if (event.key === 'Enter') {
      event.preventDefault();
      props.onOpen(id, event.metaKey || event.ctrlKey);
    } else if (event.key === ' ') {
      event.preventDefault();
      props.onSelection(selected.has(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id], id);
    } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      props.onSelection(ids, id);
    }
  };

  // Column resize: the edge between a column and the next one follows the
  // pointer. The next column gives or takes the space, so nothing else moves;
  // the edge after the star column trades space with the title instead.
  const [resizing, setResizing] = useState<ColumnId | null>(null);
  const startResize = (event: PointerEvent<HTMLSpanElement>, column: ColumnId) => {
    const next = all[all.indexOf(column) + 1];
    if (!next || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startLeft = widthOf(column);
    const startNext = widthOf(next);
    const titleRoom = (bodyRef.current?.closest('table')?.querySelector<HTMLElement>('th[data-column="title"]')?.offsetWidth ?? 0) - columnDefaults.title.min;
    const growsLeft = column !== 'starred';
    // How far the edge may travel: the next column keeps its minimum on the right;
    // on the left, the column (or the title) keeps its own.
    const maxRight = startNext - columnDefaults[next].min;
    const maxLeft = growsLeft ? startLeft - columnDefaults[column].min : Math.max(0, titleRoom);
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    setResizing(column);
    const move = (e: globalThis.PointerEvent) => {
      const delta = Math.round(Math.min(maxRight, Math.max(-maxLeft, e.clientX - startX)));
      props.onWidths(growsLeft ? { [column]: startLeft + delta, [next]: startNext - delta } : { [next]: startNext - delta });
    };
    const end = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', end);
      target.removeEventListener('pointercancel', end);
      document.body.style.removeProperty('cursor');
      document.body.style.removeProperty('user-select');
      setResizing(null);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', end);
  };

  const cell = (paper: PaperView, column: ColumnId): ReactNode => {
    switch (column) {
      case 'starred':
        return (
          <div className="pp-lib-cell-center">
            <StarToggle starred={paper.starred} size="sm" onChange={(on) => props.onToggleStar(paper.id, on)} />
          </div>
        );
      case 'title':
        return mode === 'detailed' ? (
          <DetailedEntry paper={paper} tagsById={tagsById} />
        ) : (
          <div className="pp-lib-title">
            <span className="pp-lib-title__text">{paper.title}</span>
            {!paper.hasPdf && <Badge tone="warn">无 PDF</Badge>}
          </div>
        );
      case 'authors':
        return authorLine(paper.authors);
      case 'year':
        return paper.year ?? '—';
      case 'venue':
        return paper.venue ?? '—';
      case 'addedAt':
        return formatDate(paper.addedAt);
      case 'lastReadAt':
        return formatDate(paper.lastReadAt);
      case 'tags':
        return <TagChips ids={paper.tagIds} tagsById={tagsById} />;
      case 'pages':
        return paper.pageCount ?? '—';
    }
  };

  return (
    <ScrollArea className="pp-lib-table__area" viewportClassName="pp-lib-table__scroll" viewportRef={viewport} data-mode={mode} onScroll={maybeLoadMore}>
      <table
        className="pp-lib-table"
        role="grid"
        aria-label="论文列表"
        aria-multiselectable="true"
        aria-rowcount={papers.length}
        data-resizing={resizing ? 'true' : undefined}
        style={{ minWidth: needed(shown) }}
      >
        <colgroup>
          <col style={{ width: CHECK }} />
          {all.map((column) => (
            <col key={column} style={{ width: column === 'title' ? undefined : widthOf(column) }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th className="pp-lib-table__check">
              <div className="pp-lib-cell-center">
              <span className="pp-checkbox">
                <input
                  type="checkbox"
                  aria-label="选择本页全部论文"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected && !allSelected;
                  }}
                  onChange={() => props.onSelection(allSelected ? [] : ids, activeId)}
                />
                <span className="pp-checkbox__box" aria-hidden="true">
                  {allSelected ? <Icon name="check" size={12} strokeWidth={2.4} /> : someSelected && <Icon name="minus" size={12} strokeWidth={2.4} />}
                </span>
              </span>
              </div>
            </th>
            {all.map((column) => {
              const sorted = sort.column === column;
              return (
                <th
                  key={column}
                  scope="col"
                  aria-sort={sorted ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined}
                  data-column={column}
                >
                  <button
                    type="button"
                    className="pp-lib-table__sort"
                    aria-label={column === 'starred' ? '按标星排序' : undefined}
                    onClick={() => props.onSort(column)}
                  >
                    {column === 'starred' ? <Icon name="star" size={16} /> : <span className="pp-lib-table__label">{columnLabels[column]}</span>}
                    {sorted && <Icon name="chevronDown" size={11} strokeWidth={2.2} className="pp-lib-table__arrow" data-dir={sort.direction} />}
                  </button>
                  {column !== 'title' && column !== all[all.length - 1] && (
                    <span
                      className="pp-lib-table__resize"
                      data-active={resizing === column ? 'true' : undefined}
                      role="separator"
                      aria-orientation="vertical"
                      aria-label={`调整「${columnLabels[column]}」与右侧一列的分界`}
                      onPointerDown={(event) => startResize(event, column)}
                    />
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody ref={bodyRef}>
          {papers.map((paper) => {
            const isSelected = selected.has(paper.id);
            return (
              <tr
                key={paper.id}
                data-paper-id={paper.id}
                aria-selected={isSelected}
                data-active={paper.id === activeId ? 'true' : undefined}
                tabIndex={paper.id === (activeId ?? ids[0]) ? 0 : -1}
                draggable
                onDragStart={(event) => {
                  const dragging = isSelected ? selectedIds : [paper.id];
                  event.dataTransfer.setData(PAPER_DRAG_TYPE, JSON.stringify(dragging));
                  event.dataTransfer.effectAllowed = 'move';
                }}
                onClick={(event) => onRowClick(event, paper.id)}
                onDoubleClick={() => props.onOpen(paper.id, false)}
                onAuxClick={(event) => {
                  if (event.button === 1) props.onOpen(paper.id, true);
                }}
                onKeyDown={(event) => onRowKey(event, paper.id)}
              >
                <td className="pp-lib-table__check" onClick={(event) => event.stopPropagation()}>
                  <div className="pp-lib-cell-center">
                  <span className="pp-checkbox">
                    <input
                      type="checkbox"
                      tabIndex={-1}
                      aria-label={`选择「${paper.title}」`}
                      checked={isSelected}
                      onChange={() => {
                        props.onSelection(isSelected ? selectedIds.filter((x) => x !== paper.id) : [...selectedIds, paper.id], paper.id);
                        anchor.current = paper.id;
                      }}
                    />
                    <span className="pp-checkbox__box" aria-hidden="true">
                      {isSelected && <Icon name="check" size={12} strokeWidth={2.4} />}
                    </span>
                  </span>
                  </div>
                </td>
                {all.map((column) => (
                  <td key={column} data-column={column}>
                    {cell(paper, column)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {papers.length === 0 && <div className="pp-lib-table__empty">{props.empty}</div>}
    </ScrollArea>
  );
}

/** A detailed row: title, bibliographic line, the start of the abstract, then tags and reading facts. */
function DetailedEntry({ paper, tagsById }: { paper: PaperView; tagsById: ReadonlyMap<string, TagView> }) {
  const meta = [authorLine(paper.authors), paper.venue, paper.year].filter(Boolean).join(' · ');
  const facts = [
    paper.progress !== undefined && paper.progress > 0 ? `读到 ${Math.round(paper.progress * 100)}%` : null,
    paper.annotationCount > 0 ? `${paper.annotationCount} 条批注` : null,
  ].filter(Boolean);
  return (
    <div className="pp-lib-entry">
      <span className="pp-lib-entry__title">{paper.title}</span>
      <span className="pp-lib-entry__meta">
        {meta || '作者未知'}
        {!paper.hasPdf && <Badge tone="warn">无 PDF</Badge>}
      </span>
      {paper.abstract && <span className="pp-lib-entry__abstract">{clip(paper.abstract)}</span>}
      {(paper.tagIds.length > 0 || facts.length > 0) && (
        <span className="pp-lib-entry__foot">
          {paper.tagIds.length > 0 && <TagChips ids={paper.tagIds} tagsById={tagsById} />}
          {facts.length > 0 && <span className="pp-lib-entry__facts">{facts.join(' · ')}</span>}
        </span>
      )}
    </div>
  );
}

function TagChips({ ids, tagsById }: { ids: readonly string[]; tagsById: ReadonlyMap<string, TagView> }) {
  if (ids.length === 0) return <span className="pp-lib-muted">—</span>;
  return (
    <span className="pp-lib-chips">
      {ids.map((id) => (
        <span key={id} className="pp-lib-chip">
          {tagsById.get(id)?.label ?? id}
        </span>
      ))}
    </span>
  );
}
