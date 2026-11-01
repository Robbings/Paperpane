import { useEffect, useRef, useState } from 'react';
import { Button, Checkbox, Dialog, Icon, Select, Spinner, TextField, toast } from '@/ui/components';
import { SettingRow } from '../SettingRow';
import { useSync } from '@/runtime/use-sync';
import { ConnectionStore } from '@/sync/settings';
import { WebDavClient } from '@/sync/webdav-client';
import { discoverZotero, zoteroArchive } from '@/zotero/webdav-discovery';
import { discoveryCatalog, type DiscoveredPaper } from '@/zotero/discovery-catalog';
import { ZoteroClient } from '@/zotero/client';
import { ZoteroMappings } from '@/data/zotero-mappings';
import { importZotero } from '@/zotero/import';
import { importPdfBlob } from '@/zotero/pdf-import';
import { ZoteroDestination } from '@/ui/library/ZoteroDestination';
import type { ZoteroCollection } from '@/zotero/types';
import type { FolderOption, ImportDestination } from '@/zotero/catalog';
import '@/ui/library/zotero.css';

/** Zotero attachments found on the WebDAV server: shown only when there are some, imported on request. */
export function ZoteroDiscovery() {
  const { connections } = useSync();
  const [keys, setKeys] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [rows, setRows] = useState<DiscoveredPaper[]>([]);
  const [collections, setCollections] = useState<ZoteroCollection[]>([]);
  const [folders, setFolders] = useState<FolderOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [reload, setReload] = useState(0);
  const [text, setText] = useState('');
  const [category, setCategory] = useState('all');
  const [mode, setMode] = useState<'collections' | 'folder'>('folder');
  const [folder, setFolder] = useState('root');
  const [failures, setFailures] = useState<string[]>([]);
  const [password, setPassword] = useState('');
  const [prompt, setPrompt] = useState<{ incorrect: boolean; resolve: (value: string | null) => void }>();
  const operation = useRef<AbortController | undefined>(undefined);
  const promptRef = useRef(prompt);
  promptRef.current = prompt;
  useEffect(
    () => () => {
      operation.current?.abort();
      promptRef.current?.resolve(null);
    },
    [],
  );

  useEffect(() => {
    setKeys([]);
    setSelected(new Set());
    operation.current?.abort();
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
        /* Detection is advisory; reading the list reports its own errors. */
      } finally {
        await db.close();
      }
    })();
    return () => abort.abort();
  }, [connections.dav?.url, connections.dav?.username]);

  useEffect(() => {
    if (!open || !keys.length) return;
    const abort = new AbortController(),
      settings = new ConnectionStore(),
      db = new ZoteroMappings();
    setLoading(true);
    setCollections([]);
    setSelected(new Set());
    setFailures([]);
    setCategory('all');
    setRows(keys.map((key, i) => ({ key, title: `附件 ${i + 1}`, paths: [], status: 'loading' })));
    void (async () => {
      try {
        const connection = await settings.dav();
        if (!connection) throw new Error('请先连接 WebDAV');
        const key = await settings.zotero(),
          client = key && connections.zotero ? new ZoteroClient(key, connections.zotero.userId) : undefined;
        const localFolders = await db.folders();
        if (abort.signal.aborted) return;
        setFolders(localFolders);
        setMode(client ? 'collections' : 'folder');
        await discoveryCatalog(
          keys,
          new WebDavClient(connection),
          client,
          abort.signal,
          (row) => {
            if (!abort.signal.aborted) setRows((old) => old.map((r) => (r.key === row.key ? row : r)));
          },
          (value) => {
            if (!abort.signal.aborted) setCollections(value);
          },
          (value) => {
            if (!abort.signal.aborted) toast.show({ tone: 'warning', message: value });
          },
        );
      } catch (e) {
        if (!abort.signal.aborted) toast.show({ tone: 'error', message: e instanceof Error ? e.message : '读取失败' });
      } finally {
        await settings.close();
        await db.close();
        if (!abort.signal.aborted) setLoading(false);
      }
    })();
    return () => abort.abort();
  }, [open, keys, reload, connections.zotero?.userId, connections.zotero?.hasKey]);

  const ignore = async () => {
    const db = new ConnectionStore();
    try {
      await db.write('transfer-zotero-ignored:' + connections.dav?.url, keys);
      setKeys([]);
    } finally {
      await db.close();
    }
  };
  const selectedRows = rows.filter((r) => selected.has(r.key) && r.status === 'ready');
  const canPreserve = !!connections.zotero && selectedRows.every((row) => !!row.paper);

  const run = async () => {
    if (operation.current || !selectedRows.length) return;
    setBusy(true);
    setDone(0);
    setFailures([]);
    const settings = new ConnectionStore(),
      db = new ZoteroMappings(),
      abort = new AbortController();
    operation.current = abort;
    const signal = abort.signal;
    let count = 0;
    const errors: string[] = [],
      succeeded = new Set<string>();
    const askPassword = (incorrect: boolean) =>
      new Promise<string | null>((resolve) => {
        setPassword('');
        setPrompt({ incorrect, resolve });
      });
    try {
      const connection = await settings.dav();
      if (!connection) throw new Error('请先连接 WebDAV');
      const dav = new WebDavClient(connection),
        key = await settings.zotero();
      const client = key && connections.zotero ? new ZoteroClient(key, connections.zotero.userId) : undefined;
      if (mode === 'collections' && (!client || !canPreserve)) throw new Error('部分附件没有分类信息，请选择导入到的文件夹');
      const destination: ImportDestination = mode === 'collections' ? { kind: 'collections', collections } : { kind: 'folder', folderId: folder === 'root' ? null : folder };
      const grouped = new Map<string, DiscoveredPaper[]>();
      for (const row of selectedRows) {
        const id = row.paper?.key ?? row.key;
        grouped.set(id, [...(grouped.get(id) ?? []), row]);
      }
      for (const group of grouped.values()) {
        signal.throwIfAborted();
        const first = group[0]!;
        try {
          if (client && first.paper) {
            await importZotero(
              client,
              [first.paper],
              destination.kind === 'folder' ? destination.folderId : null,
              signal,
              (result) => {
                if (result.ok) {
                  count += group.length;
                  for (const row of group) succeeded.add(row.key);
                } else errors.push(`${first.title}：${result.message}`);
              },
              askPassword,
              new Set(group.map((r) => r.key)),
              destination,
            );
          } else {
            const blob = await zoteroArchive(dav, first.key, first.filename, signal);
            const doc = await importPdfBlob(db, blob, first.filename ?? `${first.title}.pdf`, folder === 'root' ? null : folder, signal, askPassword);
            const item = await db.getItemForDocument(doc.id);
            if (item) await db.move([item.id], folder === 'root' ? null : folder);
            count++;
            succeeded.add(first.key);
          }
        } catch (e) {
          signal.throwIfAborted();
          errors.push(`${first.title}：${e instanceof Error ? e.message : '导入失败'}`);
        }
        setDone((n) => n + group.length);
      }
    } catch (e) {
      if (!signal.aborted) errors.push(e instanceof Error ? e.message : '导入失败');
    } finally {
      setSelected((old) => new Set([...old].filter((key) => !succeeded.has(key))));
      await settings.close();
      await db.close();
      operation.current = undefined;
      setBusy(false);
      const channel = new BroadcastChannel('paperpane-documents');
      channel.postMessage('imported');
      channel.close();
    }
    if (errors.length) {
      setFailures(errors);
      toast.show({ tone: 'warning', message: `${count} 个已导入，${errors.length} 个失败` });
    } else if (count) {
      toast.show({ tone: 'success', message: `已导入 ${count} 个附件`, duration: 3200 });
      setOpen(false);
    }
  };

  if (!keys.length) return null;
  const groupName = (row: DiscoveredPaper) => row.paths[0] ?? (row.paper ? '未分类' : '未关联分类');
  const categories = [...new Set(rows.filter((r) => r.status === 'ready').flatMap((r) => (r.paths.length ? r.paths : [groupName(r)])))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  const visible = rows.filter(
    (row) => (category === 'all' || row.paths.includes(category) || groupName(row) === category) && `${row.title} ${row.filename ?? ''} ${row.paths.join(' ')}`.toLocaleLowerCase().includes(text.toLocaleLowerCase()),
  );
  const ready = visible.filter((r) => r.status === 'ready');
  const groups = [...new Set(visible.map(groupName))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  const allPicked = !!ready.length && ready.every((r) => selected.has(r.key));
  const somePicked = ready.some((r) => selected.has(r.key));

  return (
    <>
      <SettingRow label="Zotero 附件" hint="WebDAV 上发现的 Zotero 附件；连接 Zotero 后会一起导入书目和批注">
        <span className="pp-set-value">发现 {keys.length} 个</span>
        <Button size="sm" onClick={() => setOpen(true)}>
          导入
        </Button>
        <Button size="sm" variant="quiet" onClick={() => void ignore()}>
          忽略
        </Button>
      </SettingRow>
      <Dialog
        size="lg"
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        title="导入 Zotero 附件"
        footer={
          <>
            <span className="pp-zotero-status" role="status">
              {busy ? (
                <>
                  <Spinner size={13} label="正在导入" />
                  {done} / {selectedRows.length}
                </>
              ) : failures.length ? (
                <span className="pp-set-value" data-tone="danger">
                  {failures.length} 个失败
                </span>
              ) : selectedRows.length ? (
                `已选 ${selectedRows.length} 个`
              ) : null}
            </span>
            <Button
              onClick={() => {
                operation.current?.abort();
                promptRef.current?.resolve(null);
                if (!busy) setOpen(false);
              }}
            >
              {busy ? '停止' : '关闭'}
            </Button>
            <Button variant="primary" disabled={busy || loading || !selectedRows.length || (mode === 'collections' && !canPreserve)} onClick={() => void run()}>
              导入
            </Button>
          </>
        }
      >
        <div className="pp-zotero-body">
          <div className="pp-zotero-filter">
            <TextField icon="search" clearable label="搜索附件" hideLabel value={text} onChange={setText} placeholder="论文名或文件名" disabled={busy} />
            {categories.length > 1 && (
              <Select label="分类" value={category} onChange={setCategory} disabled={busy} options={[{ value: 'all', label: '全部分类' }, ...categories.map((value) => ({ value, label: value }))]} />
            )}
          </div>
          <div className="pp-zotero-list pp-zotero-list--framed">
            <div className="pp-zotero-list__head">
              <Checkbox
                label={allPicked ? '取消全选' : '全选'}
                checked={allPicked}
                indeterminate={!allPicked && somePicked}
                disabled={busy || loading || !ready.length}
                onChange={(on) =>
                  setSelected((old) => {
                    const next = new Set(old);
                    for (const r of ready) on ? next.add(r.key) : next.delete(r.key);
                    return next;
                  })
                }
              />
              <span className="pp-zotero-pager">
                {loading && (
                  <>
                    <Spinner size={12} label="正在读取" />
                    <span>
                      {rows.filter((r) => r.status !== 'loading').length} / {rows.length}
                    </span>
                  </>
                )}
                {!loading && (
                  <button type="button" className="pp-zotero-link" disabled={busy} onClick={() => setReload((v) => v + 1)}>
                    重新读取
                  </button>
                )}
              </span>
            </div>
            <div className="pp-zotero-items">
              {groups.map((group) => (
                <section key={group} className="pp-zotero-group">
                  <h4>{group}</h4>
                  <ul>
                    {visible
                      .filter((r) => groupName(r) === group)
                      .sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'))
                      .map((row) => (
                        <li key={row.key} data-selected={selected.has(row.key) || undefined}>
                          <Checkbox
                            label={row.title}
                            description={(row.status === 'loading' ? '正在读取' : [row.filename, row.detail].filter(Boolean).join(' · ')) || undefined}
                            checked={selected.has(row.key)}
                            disabled={busy || row.status !== 'ready'}
                            onChange={(on) =>
                              setSelected((old) => {
                                const value = new Set(old);
                                if (on) value.add(row.key);
                                else value.delete(row.key);
                                return value;
                              })
                            }
                          />
                        </li>
                      ))}
                  </ul>
                </section>
              ))}
            </div>
          </div>
          <ZoteroDestination mode={mode} onMode={setMode} folder={folder} onFolder={setFolder} folders={folders} canPreserve={canPreserve} disabled={busy} />
          {failures.length > 0 && (
            <ul className="pp-zotero-problems">
              {failures.map((text) => (
                <li key={text} data-failed>
                  <Icon name="close" size={13} />
                  <span>
                    <small>{text}</small>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Dialog>
      <Dialog
        open={!!prompt}
        onClose={() => {
          prompt?.resolve(null);
          setPrompt(undefined);
        }}
        title="PDF 密码"
        description={prompt?.incorrect ? '密码不正确，请重试。' : '这篇 PDF 有密码保护。'}
        footer={
          <Button
            variant="primary"
            onClick={() => {
              prompt?.resolve(password);
              setPrompt(undefined);
            }}
          >
            打开
          </Button>
        }
      >
        <TextField label="密码" type="password" value={password} onChange={setPassword} />
      </Dialog>
    </>
  );
}
