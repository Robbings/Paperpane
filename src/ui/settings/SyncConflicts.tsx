import { useEffect, useState } from 'react';
import { Button, Dialog, toast } from '@/ui/components';
import { TransferStore } from '@/data/transfer-store';
import { stable } from '@/sync/merge';
import { SettingRow } from './SettingRow';

type Version = Awaited<ReturnType<TransferStore['versions']>>[number];

const time = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '' : date.toLocaleString('zh-CN', { hour12: false, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};
const labels: Record<string, string> = { markdown: '正文', comment: '旁注', text: '文字', shortNote: '笔记', title: '标题', name: '名称', color: '颜色', deletedAt: '移除状态', inLibrary: '文献库状态' };

/** A readable text for a saved value, whatever its shape. */
function text(value: unknown): string {
  if (value === undefined || value === null) return '（空）';
  if (typeof value === 'string') return value.replace(/paperpane-asset:[a-f0-9]{64}/g, '［图片］') || '（空）';
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(text).join('\n\n');
  const record = value as Record<string, unknown>;
  for (const key of ['markdown', 'comment', 'text', 'shortNote', 'content', 'messages', 'sessions', 'title', 'name']) if (record[key] !== undefined) return text(record[key]);
  return '（结构化内容）';
}

/** One side of the comparison, with the part that differs from the other marked. */
function Difference({ value, other }: { value: unknown; other: unknown }) {
  const a = text(value),
    b = text(other);
  let start = 0,
    end = a.length,
    otherEnd = b.length;
  while (start < end && start < otherEnd && a[start] === b[start]) start++;
  while (end > start && otherEnd > start && a[end - 1] === b[otherEnd - 1]) {
    end--;
    otherEnd--;
  }
  return (
    <div className="pp-saved-version-content">
      {a.slice(0, start)}
      <mark>{a.slice(start, end)}</mark>
      {a.slice(end)}
    </div>
  );
}

/**
 * Sync merges both sides on its own; where both changed the same text, the other version is
 * kept here. A row appears only while there are some, and switching to one is optional.
 */
export function SyncConflicts() {
  const [items, setItems] = useState<Version[]>([]);
  const [selected, setSelected] = useState<Version>();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = async () => {
    const db = new TransferStore();
    try {
      const values = await db.versions();
      setItems(values);
      setSelected((old) => (old ? values.find((v) => v.id === old.id) : values[0]));
    } finally {
      await db.close();
    }
  };
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      if (alive) void load().catch(() => undefined);
    };
    refresh();
    const channel = new BroadcastChannel('paperpane-transfer');
    channel.onmessage = refresh;
    return () => {
      alive = false;
      channel.close();
    };
  }, []);
  const apply = async () => {
    if (!selected || busy) return;
    setBusy(true);
    const db = new TransferStore();
    try {
      const result = await db.useVersion(selected.id, selected.current);
      await load();
      toast.show(result === 'changed' ? { tone: 'warning', message: '内容刚被改过，已刷新对比' } : { tone: 'success', message: '已换用这份内容', duration: 2600 });
    } catch (e) {
      toast.show({ tone: 'error', message: e instanceof Error ? e.message : '没能换用' });
      await load().catch(() => undefined);
    } finally {
      await db.close();
      setBusy(false);
    }
  };
  const alternatives = items.filter((v) => stable(v.current) !== stable(v.value));
  if (!alternatives.length) return null;
  const same = !!selected && stable(selected.current) === stable(selected.value);

  return (
    <>
      <SettingRow label="另存的版本" hint="两端改了同一处时，另一份保留在这里；不处理也不影响同步">
        <span className="pp-set-value">{alternatives.length} 项</span>
        <Button size="sm" onClick={() => setOpen(true)}>
          查看
        </Button>
      </SettingRow>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="另存的版本"
        size="lg"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>关闭</Button>
            <Button variant="primary" disabled={busy || !selected || same || selected.value === undefined} onClick={() => void apply()}>
              {same ? '正在使用' : '换用另存的'}
            </Button>
          </>
        }
      >
        <div className="pp-saved-versions">
          <nav aria-label="版本">
            {alternatives.map((v) => (
              <button type="button" className="pp-saved-version-item" aria-pressed={v.id === selected?.id} key={v.id} onClick={() => setSelected(v)}>
                <strong>{v.paper}</strong>
                <span>
                  {v.context} · {labels[v.path.at(-1) ?? ''] ?? '内容'}
                </span>
                <time dateTime={v.savedAt}>{time(v.savedAt)}</time>
              </button>
            ))}
          </nav>
          {selected && (
            <div className="pp-transfer-compare">
              <section>
                <h4>当前</h4>
                <Difference value={selected.current} other={selected.value} />
              </section>
              <section>
                <h4>另存 · {time(selected.savedAt)}</h4>
                <Difference value={selected.value} other={selected.current} />
              </section>
            </div>
          )}
        </div>
      </Dialog>
    </>
  );
}
