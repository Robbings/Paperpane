import { useEffect, useRef, useState } from 'react';
import { Button, Checkbox, Dialog, ProgressBar, toast } from '@/ui/components';
import { SettingRow } from '../SettingRow';
import { useSync } from '@/runtime/use-sync';
import { ConnectionStore } from '@/sync/settings';
import { WebDavClient } from '@/sync/webdav-client';
import { discoverZotero, zoteroArchive } from '@/zotero/webdav-discovery';
import { ZoteroClient } from '@/zotero/client';
import { ZoteroMappings } from '@/data/zotero-mappings';
import { importZotero } from '@/zotero/import';
import { importPdfBlob } from '@/zotero/pdf-import';

/** Zotero attachments found on the WebDAV server: shown only when there are some, imported on request. */
export function ZoteroDiscovery() {
  const { connections } = useSync();
  const [keys, setKeys] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const operation = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => operation.current?.abort(), []);
  useEffect(() => {
    setKeys([]);
    setSelected(new Set());
    if (!connections.dav) return;
    const db = new ConnectionStore(),
      abort = new AbortController();
    void (async () => {
      try {
        const connection = await db.dav();
        if (!connection) return;
        const found = await discoverZotero(new WebDavClient(connection), abort.signal);
        const ignored = await db.raw<string[]>('transfer-zotero-ignored:' + connection.url);
        if (!abort.signal.aborted) setKeys(found.filter((k) => !ignored?.includes(k)));
      } catch {
        /* Detection is advisory; connection and explicit imports report their own errors. */
      } finally {
        await db.close();
      }
    })();
    return () => abort.abort();
  }, [connections.dav?.url]);

  const ignore = async () => {
    const db = new ConnectionStore();
    try {
      await db.write('transfer-zotero-ignored:' + connections.dav?.url, keys);
      setKeys([]);
    } finally {
      await db.close();
    }
  };
  const run = async () => {
    setBusy(true);
    const settings = new ConnectionStore(),
      db = new ZoteroMappings();
    const abort = new AbortController();
    operation.current = abort;
    const signal = abort.signal;
    let count = 0;
    const errors: string[] = [];
    try {
      const connection = await settings.dav();
      if (!connection) throw new Error('请先连接 WebDAV');
      const dav = new WebDavClient(connection),
        key = await settings.zotero(),
        client = key && connections.zotero ? new ZoteroClient(key, connections.zotero.userId) : undefined;
      for (const attachmentKey of selected) {
        signal.throwIfAborted();
        try {
          if (client) {
            const attachment = await client.item(attachmentKey, signal),
              paper = attachment.data.parentItem ? await client.item(attachment.data.parentItem, signal) : attachment;
            await importZotero(client, [paper], null, signal, (result) => {
              if (result.ok) count++;
              else errors.push(result.message);
            }, undefined, new Set([attachmentKey]));
          } else {
            const blob = await zoteroArchive(dav, attachmentKey, undefined, signal);
            await importPdfBlob(db, blob, `${attachmentKey}.pdf`, null, signal);
            count++;
          }
        } catch (e) {
          errors.push(e instanceof Error ? e.message : '导入失败');
        }
      }
      if (count) toast.show({ tone: 'success', message: `已导入 ${count} 项`, duration: 2600 });
      if (errors.length) toast.show({ tone: 'error', message: `${errors.length} 项没能导入：${errors[0]}` });
      if (!errors.length) setOpen(false);
    } catch (e) {
      if (!signal.aborted) toast.show({ tone: 'error', message: e instanceof Error ? e.message : '导入失败' });
    } finally {
      await settings.close();
      await db.close();
      operation.current = undefined;
      setBusy(false);
    }
  };
  if (!keys.length) return null;
  const all = selected.size === keys.length;
  return (
    <>
      <SettingRow label="Zotero 附件" hint="在 WebDAV 上发现的 Zotero 附件；连接 Zotero 后会一起导入书目和批注">
        <span className="pp-set-value">发现 {keys.length} 个</span>
        <Button size="sm" onClick={() => setOpen(true)}>
          导入
        </Button>
        <Button size="sm" variant="quiet" onClick={() => void ignore()}>
          忽略
        </Button>
      </SettingRow>
      <Dialog
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        title="导入 Zotero 附件"
        description={connections.zotero ? undefined : '尚未连接 Zotero，只会导入 PDF'}
        footer={
          <>
            <Button
              onClick={() => {
                if (busy) operation.current?.abort();
                else setOpen(false);
              }}
            >
              {busy ? '停止' : '取消'}
            </Button>
            <Button variant="primary" disabled={busy || !selected.size} onClick={() => void run()}>
              导入{selected.size ? ` ${selected.size} 项` : ''}
            </Button>
          </>
        }
      >
        <div className="pp-set-pick-head">
          <Checkbox label={all ? '取消全选' : '全选'} checked={all} indeterminate={!all && selected.size > 0} disabled={busy} onChange={(on) => setSelected(on ? new Set(keys) : new Set())} />
          <span>已选 {selected.size} / {keys.length}</span>
        </div>
        <ul className="pp-set-list pp-set-list--scroll">
          {keys.map((key) => (
            <li key={key}>
              <Checkbox
                label={key}
                checked={selected.has(key)}
                disabled={busy}
                onChange={(on) =>
                  setSelected((old) => {
                    const value = new Set(old);
                    if (on) value.add(key);
                    else value.delete(key);
                    return value;
                  })
                }
              />
            </li>
          ))}
        </ul>
        {busy && <ProgressBar label="正在导入" />}
      </Dialog>
    </>
  );
}
