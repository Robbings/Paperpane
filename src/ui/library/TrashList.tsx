import { Button, EmptyState, Icon, ScrollArea } from '@/ui/components';

/** What the trash holds: deleted folders (with what went with them) and papers removed on their own. */
export interface TrashView {
  folders: { id: string; name: string; deletedAt: string; folders: number; papers: number }[];
  papers: { id: string; title: string; trashedAt: string }[];
}

export type TrashKind = 'paper' | 'folder';

interface TrashListProps {
  trash: TrashView | null;
  /** Days an entry stays before it is deleted for good. */
  days: number;
  onRestore: (kind: TrashKind, id: string) => void;
  onPurge: (kind: TrashKind, id: string, name: string) => void;
  onEmpty: () => void;
}

const DAY = 86_400_000;
function when(at: string, days: number, now = Date.now()) {
  const ago = Math.floor((now - Date.parse(at)) / DAY);
  const left = Math.max(0, days - ago);
  return `${ago <= 0 ? '今天' : `${ago} 天前`}删除 · ${left > 0 ? `${left} 天后自动彻底删除` : '即将彻底删除'}`;
}

/** The library's trash: restore, delete for good, or empty it. */
export function TrashList({ trash, days, onRestore, onPurge, onEmpty }: TrashListProps) {
  const rows = trash
    ? [
        ...trash.folders.map((f) => ({
          kind: 'folder' as const,
          id: f.id,
          name: f.name,
          at: f.deletedAt,
          detail: [f.folders ? `${f.folders} 个子文件夹` : '', f.papers ? `${f.papers} 篇论文` : ''].filter(Boolean).join('、'),
        })),
        ...trash.papers.map((p) => ({ kind: 'paper' as const, id: p.id, name: p.title || '未命名论文', at: p.trashedAt, detail: '' })),
      ].sort((a, b) => b.at.localeCompare(a.at))
    : [];
  if (trash && !rows.length)
    return (
      <div className="pp-trash pp-trash--empty">
        <EmptyState icon="trash" title="回收站是空的" description={`删除的论文和文件夹会在这里保留 ${days} 天，之后连同 PDF、批注和笔记一起彻底删除。`} />
      </div>
    );
  return (
    <div className="pp-trash">
      <div className="pp-trash__bar">
        <p>放在这里超过 {days} 天的内容会连同 PDF、批注和笔记一起彻底删除。</p>
        <Button size="sm" variant="quiet" icon="trash" disabled={!rows.length} onClick={onEmpty}>
          清空回收站
        </Button>
      </div>
      <ScrollArea className="pp-trash__scroll">
        <ul className="pp-trash__list">
          {rows.map((row) => (
            <li key={row.kind + row.id} className="pp-trash__row">
              <Icon name={row.kind === 'folder' ? 'folder' : 'file'} size={16} />
              <div className="pp-trash__text">
                <span className="pp-trash__name" title={row.name}>
                  {row.name}
                </span>
                <span className="pp-trash__meta">
                  {row.detail ? `含 ${row.detail} · ` : ''}
                  {when(row.at, days)}
                </span>
              </div>
              <Button size="sm" variant="quiet" onClick={() => onRestore(row.kind, row.id)}>
                恢复
              </Button>
              <Button size="sm" variant="quiet" className="pp-trash__purge" onClick={() => onPurge(row.kind, row.id, row.name)}>
                彻底删除
              </Button>
            </li>
          ))}
        </ul>
      </ScrollArea>
    </div>
  );
}
