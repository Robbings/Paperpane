import { useRef, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { Badge, Icon, StarToggle } from '@/ui/components';
import { authorLine, columnDefaults, columnLabels, formatDate } from './columns';
import { PAPER_DRAG_TYPE } from './dragTypes';
import type { ColumnId, LibraryQuery, PaperView, TagView } from './types';

interface LibraryTableProps {
  papers: readonly PaperView[];
  tagsById: ReadonlyMap<string, TagView>;
  /** Visible optional columns, in order; star and title always come first. */
  columns: readonly ColumnId[];
  widths: Partial<Record<ColumnId, number>>;
  onWidth: (column: ColumnId, width: number) => void;
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
}

export function LibraryTable(props: LibraryTableProps) {
  const { papers, tagsById, widths, sort, mode, selectedIds, activeId } = props;
  const all: ColumnId[] = ['starred', 'title', ...props.columns];
  const anchor = useRef<string | null>(activeId);
  const bodyRef = useRef<HTMLTableSectionElement>(null);
  const selected = new Set(selectedIds);
  const ids = papers.map((p) => p.id);
  const allSelected = papers.length > 0 && ids.every((id) => selected.has(id));
  const someSelected = ids.some((id) => selected.has(id));

  const widthOf = (column: ColumnId) => widths[column] ?? columnDefaults[column].width;
  // The title column takes the remaining space; below its minimum the table scrolls sideways.
  const minTableWidth = 40 + all.reduce((sum, column) => sum + (column === 'title' ? columnDefaults.title.min : widthOf(column)), 0);

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

  // Column resize: drag the right edge of a header cell.
  const startResize = (event: PointerEvent<HTMLSpanElement>, column: ColumnId) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = widthOf(column);
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    document.body.style.cursor = 'col-resize';
    const move = (e: globalThis.PointerEvent) => props.onWidth(column, Math.max(columnDefaults[column].min, Math.round(startWidth + e.clientX - startX)));
    const end = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', end);
      target.removeEventListener('pointercancel', end);
      document.body.style.removeProperty('cursor');
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', end);
  };

  const cell = (paper: PaperView, column: ColumnId): ReactNode => {
    switch (column) {
      case 'starred':
        return <StarToggle starred={paper.starred} size="sm" onChange={(on) => props.onToggleStar(paper.id, on)} />;
      case 'title':
        return (
          <div className="pp-lib-title">
            <span className="pp-lib-title__text">
              {paper.title}
              {!paper.hasPdf && (
                <Badge tone="warn">无 PDF</Badge>
              )}
            </span>
            {mode === 'detailed' && (
              <>
                <span className="pp-lib-title__meta">
                  {authorLine(paper.authors)}
                  {paper.venue && ` · ${paper.venue}`}
                  {paper.year && ` · ${paper.year}`}
                </span>
                {paper.abstract && <span className="pp-lib-title__abstract">{paper.abstract}</span>}
                {paper.tagIds.length > 0 && <TagChips ids={paper.tagIds} tagsById={tagsById} />}
              </>
            )}
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
    <div className="pp-lib-table__scroll" data-mode={mode}>
      <table
        className="pp-lib-table"
        role="grid"
        aria-label="论文列表"
        aria-multiselectable="true"
        aria-rowcount={papers.length}
        style={{ minWidth: minTableWidth }}
      >
        <colgroup>
          <col style={{ width: 40 }} />
          {all.map((column) => (
            <col key={column} style={{ width: column === 'title' ? undefined : widthOf(column) }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th className="pp-lib-table__check">
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
            </th>
            {all.map((column) => {
              const sorted = sort.column === column;
              return (
                <th
                  key={column}
                  scope="col"
                  aria-sort={sorted ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined}
                  data-align={columnDefaults[column].align}
                  data-column={column}
                >
                  <button type="button" className="pp-lib-table__sort" onClick={() => props.onSort(column)}>
                    {column === 'starred' ? <Icon name="star" size={13} title="标星" /> : columnLabels[column]}
                    {sorted && <Icon name="chevronDown" size={12} strokeWidth={2} className={sort.direction === 'asc' ? 'pp-lib-table__asc' : undefined} />}
                  </button>
                  {column !== 'starred' && (
                    <span
                      className="pp-lib-table__resize"
                      role="separator"
                      aria-orientation="vertical"
                      aria-label={`调整「${columnLabels[column]}」列宽`}
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
                </td>
                {all.map((column) => (
                  <td key={column} data-align={columnDefaults[column].align} data-column={column}>
                    {cell(paper, column)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {papers.length === 0 && <div className="pp-lib-table__empty">{props.empty}</div>}
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
