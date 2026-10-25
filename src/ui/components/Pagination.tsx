import { Icon } from './Icon';
import { Segmented } from './Segmented';
import './Pagination.css';

const SIZES = [10, 20, 50, 100] as const;
export type PageSize = (typeof SIZES)[number];

interface PaginationProps {
  /** 1-based. */
  page: number;
  pageSize: PageSize;
  total: number;
  onPage: (page: number) => void;
  onPageSize: (size: PageSize) => void;
  /** Noun for the count, e.g. "篇". */
  unit?: string;
}

/** Page numbers with gaps: 1 … 4 5 6 … 12. */
function pageList(page: number, pages: number): (number | 'gap')[] {
  const wanted = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages));
  const sorted = [...wanted].sort((a, b) => a - b);
  const out: (number | 'gap')[] = [];
  sorted.forEach((n, index) => {
    const prev = sorted[index - 1];
    if (prev !== undefined && n - prev > 1) out.push('gap');
    out.push(n);
  });
  return out;
}

export function Pagination({ page, pageSize, total, onPage, onPageSize, unit = '篇' }: PaginationProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);

  return (
    <nav className="pp-pages" aria-label="分页">
      <span className="pp-pages__summary">
        {total === 0 ? `共 0 ${unit}` : `第 ${first}–${last} ${unit}，共 ${total} ${unit}`}
      </span>
      <span className="pp-pages__spacer" />
      <Segmented
        label="每页数量"
        size="sm"
        options={SIZES.map((size) => ({ value: String(size), label: String(size) }))}
        value={String(pageSize)}
        onChange={(value) => onPageSize(Number(value) as PageSize)}
      />
      {pages > 1 && (
        <span className="pp-pages__numbers">
          <button type="button" className="pp-pages__step" aria-label="上一页" disabled={page <= 1} onClick={() => onPage(page - 1)}>
            <Icon name="chevronRight" size={14} strokeWidth={2} className="pp-pages__prev" />
          </button>
          {pageList(page, pages).map((item, index) =>
            item === 'gap' ? (
              <span key={`gap-${index}`} className="pp-pages__gap" aria-hidden="true">
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                className="pp-pages__number"
                aria-label={`第 ${item} 页`}
                aria-current={item === page ? 'page' : undefined}
                onClick={() => onPage(item)}
              >
                {item}
              </button>
            ),
          )}
          <button type="button" className="pp-pages__step" aria-label="下一页" disabled={page >= pages} onClick={() => onPage(page + 1)}>
            <Icon name="chevronRight" size={14} strokeWidth={2} />
          </button>
        </span>
      )}
    </nav>
  );
}
