import { useState } from 'react';
import { Button, Dialog, EmptyState, toast } from '@/ui/components';
import { SettingRow } from './SettingRow';
import { TransferStore } from '@/data/transfer-store';

type TrashItem = Awaited<ReturnType<TransferStore['trash']>>[number];
const title = (item: TrashItem) => String(item.record.title ?? item.record.name ?? item.record.label ?? item.record.quote ?? item.key);
const failed = (error: unknown) => toast.show({ tone: 'error', message: error instanceof Error ? error.message : '读取失败' });

/** Deleted papers and notes that sync kept, ready to restore. */
export function SyncTrash() {
  const [items, setItems] = useState<TrashItem[]>([]);
  const [open, setOpen] = useState(false);
  const load = async () => {
    const db = new TransferStore();
    try {
      setItems(await db.trash());
      setOpen(true);
    } catch (error) {
      failed(error);
    } finally {
      await db.close();
    }
  };
  const restore = async (item: TrashItem) => {
    const db = new TransferStore();
    try {
      await db.restoreTrash(item);
      setItems(await db.trash());
      toast.show({ tone: 'success', message: `已恢复「${title(item)}」`, duration: 2600 });
    } catch (error) {
      failed(error);
    } finally {
      await db.close();
    }
  };
  return (
    <>
      <SettingRow label="回收站">
        <Button size="sm" onClick={() => void load()}>
          查看
        </Button>
      </SettingRow>
      <Dialog open={open} onClose={() => setOpen(false)} title="回收站">
        {items.length ? (
          <ul className="pp-set-list">
            {items.map((item) => (
              <li key={item.store + item.key}>
                <span>{title(item)}</span>
                <Button size="sm" onClick={() => void restore(item)}>
                  恢复
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon="trash" title="回收站是空的" />
        )}
      </Dialog>
    </>
  );
}
