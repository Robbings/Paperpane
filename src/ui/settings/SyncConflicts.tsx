import { useEffect, useState } from 'react';
import { Button, Dialog, toast } from '@/ui/components';
import { TransferStore, type TransferConflict } from '@/data/transfer-store';
import { SettingRow } from './SettingRow';

const failed = (error: unknown) => toast.show({ tone: 'error', message: error instanceof Error ? error.message : '处理失败' });

/** Records changed on both sides: shown as a row only while there are some, one dialog per record. */
export function SyncConflicts() {
  const [items, setItems] = useState<TransferConflict[]>([]);
  const [selected, setSelected] = useState<TransferConflict>();
  const load = async () => {
    const db = new TransferStore();
    try {
      setItems(await db.conflicts());
    } finally {
      await db.close();
    }
  };
  useEffect(() => {
    void load();
    const channel = new BroadcastChannel('paperpane-transfer');
    channel.onmessage = () => void load();
    return () => channel.close();
  }, []);
  const resolve = async (choice: 'local' | 'remote') => {
    if (!selected) return;
    const db = new TransferStore();
    try {
      await db.resolveConflict(selected.id, choice);
      const next = await db.conflicts();
      setItems(next);
      setSelected(next[0]);
    } catch (error) {
      failed(error);
    } finally {
      await db.close();
    }
  };
  const reload = async () => {
    if (!selected) return;
    const db = new TransferStore();
    try {
      await db.refreshConflict(selected.id);
      const next = await db.conflicts();
      setItems(next);
      setSelected(next.find((c) => c.id === selected.id));
    } catch (error) {
      failed(error);
    } finally {
      await db.close();
    }
  };
  if (!items.length) return null;
  return (
    <>
      <SettingRow label="冲突" hint="两端都改过的内容，选择保留哪一份">
        <span className="pp-set-value" data-tone="warn">
          {items.length} 项待处理
        </span>
        <Button size="sm" onClick={() => setSelected(items[0])}>
          处理
        </Button>
      </SettingRow>
      <Dialog
        open={!!selected}
        onClose={() => setSelected(undefined)}
        title="选择保留的版本"
        description={items.length > 1 ? `还有 ${items.length - 1} 项` : undefined}
        size="lg"
        footer={
          <>
            <Button variant="quiet" onClick={() => void reload()}>
              重新读取
            </Button>
            <Button onClick={() => void resolve('local')}>保留本机</Button>
            <Button variant="primary" onClick={() => void resolve('remote')}>
              使用云端
            </Button>
          </>
        }
      >
        <div className="pp-transfer-compare">
          <section>
            <h3>本机</h3>
            <pre>{JSON.stringify(selected?.local, null, 2)}</pre>
          </section>
          <section>
            <h3>云端</h3>
            <pre>{JSON.stringify(selected?.remote, null, 2)}</pre>
          </section>
        </div>
      </Dialog>
    </>
  );
}
