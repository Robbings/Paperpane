import { useEffect, useRef, useState } from 'react';
import { Button, Checkbox, Dialog, EmptyState, Icon, IconButton, ProgressBar, Select, Spinner, TextField, Tree, toast } from '@/ui/components';
import { ConnectionStore } from '@/sync/settings';
import { ZoteroClient } from '@/zotero/client';
import type { ZoteroItem, ZoteroCollection } from '@/zotero/types';
import type { ZoteroTransferItemResult } from '@/zotero/import';
import { importZotero } from '@/zotero/import';
import { exportZotero } from '@/zotero/export';

interface Props {
  open: boolean;
  mode: 'import' | 'export';
  ids: readonly string[];
  folderId: string | null;
  folders: readonly { id: string; name: string; parentId: string | null }[];
  onClose: () => void;
  onDone: () => void;
}

const PAGE = 50;
const openSettings = () => window.open('options.html#sync', '_blank', 'noopener');
const message = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

/** "Smith 等 · 2021 · Nature" from whatever the item has. */
function byline(item: ZoteroItem) {
  const creators = item.data.creators ?? [];
  const first = creators[0] ? creators[0].lastName || creators[0].name || creators[0].firstName : undefined;
  const authors = first ? (creators.length > 1 ? `${first} 等` : first) : undefined;
  const year = item.data.date?.match(/\d{4}/)?.[0];
  return [authors, year, item.data.publicationTitle].filter(Boolean).join(' · ');
}

const kind = (item: ZoteroItem) => (item.data.itemType === 'attachment' ? 'PDF' : item.meta?.numChildren ? '含附件' : '仅书目');

export function ZoteroImportDialog(props: Props) {
  const importing = props.mode === 'import';
  const [client, setClient] = useState<ZoteroClient>();
  const [failure, setFailure] = useState('');
  const [collections, setCollections] = useState<ZoteroCollection[]>([]);
  const [collection, setCollection] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [items, setItems] = useState<ZoteroItem[]>([]);
  const [selected, setSelected] = useState<Map<string, ZoteroItem>>(new Map());
  const [text, setText] = useState('');
  const [start, setStart] = useState(0);
  const [total, setTotal] = useState(0);
  const [folder, setFolder] = useState(props.folderId ?? 'root');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(0);
  const [results, setResults] = useState<ZoteroTransferItemResult[]>([]);
  const [writable, setWritable] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordPrompt, setPasswordPrompt] = useState<{ incorrect: boolean; resolve: (value: string | null) => void }>();
  const operation = useRef<AbortController | undefined>(undefined);
  const passwordRef = useRef<typeof passwordPrompt>(undefined);
  const live = useRef(true);
  passwordRef.current = passwordPrompt;

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      operation.current?.abort();
      passwordRef.current?.resolve(null);
    };
  }, []);

  useEffect(() => {
    if (!props.open) return;
    const abort = new AbortController();
    const db = new ConnectionStore();
    setClient(undefined);
    setFailure('');
    setItems([]);
    setCollections([]);
    setCollection(null);
    setText('');
    setStart(0);
    setWritable(false);
    setResults([]);
    setSelected(new Map());
    setFolder(props.folderId ?? 'root');
    void (async () => {
      try {
        const [settings, key] = await Promise.all([db.view(), db.zotero()]);
        if (!settings.zotero || !key) throw new Error('还没有连接 Zotero');
        const connection = new ZoteroClient(key, settings.zotero.userId);
        const tree = await connection.collections(abort.signal);
        if (abort.signal.aborted) return;
        setClient(connection);
        setWritable(settings.zotero.writable);
        setCollections(tree);
        if (!importing && !settings.zotero.writable)
          toast.show({ tone: 'warning', message: '这个 Zotero 密钥没有写入权限，无法导出。', action: { label: '去设置', onAction: openSettings } });
      } catch (e) {
        if (!abort.signal.aborted) setFailure(message(e, '读取失败'));
      } finally {
        await db.close();
      }
    })();
    return () => {
      abort.abort();
      operation.current?.abort();
      passwordRef.current?.resolve(null);
    };
  }, [props.open]);

  useEffect(() => {
    if (!props.open || !client || !importing) return;
    const abort = new AbortController();
    const timeout = setTimeout(() => {
      setLoading(true);
      void client
        .items({ collection: collection ?? undefined, text, start }, abort.signal)
        .then((result) => {
          if (abort.signal.aborted) return;
          setItems(result.items.filter((i) => !['note', 'annotation'].includes(i.data.itemType)));
          setTotal(result.total);
        })
        .catch((e) => {
          if (!abort.signal.aborted) toast.show({ tone: 'error', message: message(e, '读取 Zotero 文献失败') });
        })
        .finally(() => {
          if (!abort.signal.aborted) setLoading(false);
        });
    }, 250);
    return () => {
      clearTimeout(timeout);
      abort.abort();
    };
  }, [props.open, client, collection, text, start, props.mode]);

  const run = async (retry = false) => {
    if (!client || operation.current) return;
    const abort = new AbortController();
    operation.current = abort;
    setBusy(true);
    const failed = new Set(results.filter((r) => !r.ok).map((r) => r.key));
    if (!retry) setResults([]);
    else setResults((old) => old.filter((r) => r.ok));
    const finished: ZoteroTransferItemResult[] = [];
    const done = (result: ZoteroTransferItemResult) => {
      finished.push(result);
      if (live.current) setResults((old) => [...old.filter((r) => r.key !== result.key), result]);
    };
    try {
      if (importing) {
        const batch = [...selected.values()].filter((i) => !retry || failed.has(i.key));
        setCount(batch.length);
        await importZotero(client, batch, folder === 'root' ? null : folder, abort.signal, done, (incorrect) =>
          new Promise((resolve) => {
            setPassword('');
            setPasswordPrompt({ incorrect, resolve });
          }),
        );
      } else {
        const batch = props.ids.filter((id) => !retry || failed.has(id));
        setCount(batch.length);
        await exportZotero(client, batch, collection, abort.signal, done);
      }
      props.onDone();
      if (live.current) {
        const bad = finished.filter((r) => !r.ok).length;
        const verb = importing ? '导入' : '导出';
        toast.show(
          bad
            ? { tone: 'warning', message: `${finished.length - bad} 篇已${verb}，${bad} 篇失败。` }
            : { tone: 'success', message: `已${verb} ${finished.length} 篇。` },
        );
      }
    } catch (e) {
      if (live.current && !abort.signal.aborted) toast.show({ tone: 'error', message: message(e, '操作失败'), action: { label: '重试', onAction: () => void run(retry) } });
    } finally {
      operation.current = undefined;
      if (live.current) setBusy(false);
    }
  };

  const close = () => {
    if (busy) {
      operation.current?.abort();
      passwordRef.current?.resolve(null);
    }
    props.onClose();
  };

  const pick = (item: ZoteroItem, on: boolean) =>
    setSelected((old) => {
      const next = new Map(old);
      if (on) next.set(item.key, item);
      else next.delete(item.key);
      return next;
    });
  const pickedHere = items.filter((i) => selected.has(i.key)).length;
  const pickPage = (on: boolean) =>
    setSelected((old) => {
      const next = new Map(old);
      for (const item of items) on ? next.set(item.key, item) : next.delete(item.key);
      return next;
    });
  const choose = (id: string | null) => {
    if (busy) return;
    setCollection(id);
    setStart(0);
  };

  const nodes = collections.map((c) => ({ id: c.key, parentId: c.data.parentCollection || null, label: c.data.name, icon: 'folder' as const }));
  const failures = results.filter((r) => !r.ok).length;
  const action = importing ? `导入${selected.size ? ` ${selected.size} 篇` : ''}` : '导出';

  const sidebar = (
    <aside className="pp-zotero-collections">
      <div className="pp-tree__row pp-zotero-all" role="button" tabIndex={0} aria-selected={collection === null} style={{ paddingLeft: 6 }}
        onClick={() => choose(null)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            choose(null);
          }
        }}
      >
        <span className="pp-tree__twisty" />
        <Icon name="library" size={16} className="pp-tree__icon" />
        <span className="pp-tree__label">{importing ? '全部文献' : '我的文库'}</span>
      </div>
      <Tree
        label="Zotero 分类"
        nodes={nodes}
        selectedId={collection}
        onSelect={choose}
        expandedIds={expanded}
        onToggle={(id, on) =>
          setExpanded((old) => {
            const next = new Set(old);
            if (on) next.add(id);
            else next.delete(id);
            return next;
          })
        }
      />
    </aside>
  );

  const list = (
    <section className="pp-zotero-list">
      <div className="pp-zotero-list__head">
        <Checkbox
          label={pickedHere ? `本页已选 ${pickedHere}` : '全选本页'}
          checked={!!items.length && pickedHere === items.length}
          indeterminate={pickedHere > 0 && pickedHere < items.length}
          disabled={busy || loading || !items.length}
          onChange={pickPage}
        />
        <span className="pp-zotero-pager">
          {loading && <Spinner size={12} label="正在读取" />}
          <span>{total ? `${start + 1}–${Math.min(start + PAGE, total)} / ${total}` : ''}</span>
          <IconButton icon="chevronLeft" label="上一页" disabled={busy || loading || !start} onClick={() => setStart(Math.max(0, start - PAGE))} />
          <IconButton icon="chevronRight" label="下一页" disabled={busy || loading || start + PAGE >= total} onClick={() => setStart(start + PAGE)} />
        </span>
      </div>
      {!items.length && !loading ? (
        <p className="pp-zotero-list__empty">{text ? '没有匹配的文献' : '这个分类里没有文献'}</p>
      ) : (
        <ul className="pp-zotero-items" data-loading={loading || undefined}>
          {items.map((item) => (
            <li key={item.key} data-selected={selected.has(item.key) || undefined}>
              <Checkbox
                label={item.data.title || item.data.filename || item.key}
                description={byline(item) || undefined}
                checked={selected.has(item.key)}
                disabled={busy}
                onChange={(on) => pick(item, on)}
              />
              <span className="pp-zotero-kind">{kind(item)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  const body = failure ? (
    <EmptyState
      icon="link"
      title={failure}
      actions={
        <Button variant="primary" onClick={openSettings}>
          去设置
        </Button>
      }
    />
  ) : !client ? (
    <div className="pp-zotero-wait">
      <Spinner label="正在连接 Zotero" />
    </div>
  ) : (
    <>
      {importing && (
        <div className="pp-zotero-toolbar">
          <TextField icon="search" clearable label="搜索 Zotero" hideLabel placeholder="搜索标题、作者" value={text} disabled={busy}
            onChange={(value) => {
              setText(value);
              setStart(0);
            }}
          />
          <span className="pp-zotero-target">
            导入到
            <Select
              label="导入到"
              value={folder}
              onChange={setFolder}
              disabled={busy}
              options={[{ value: 'root', label: '未分类' }, ...props.folders.map((f) => ({ value: f.id, label: f.name }))]}
            />
          </span>
        </div>
      )}
      <div className="pp-zotero-picker" data-mode={props.mode}>
        {sidebar}
        {importing && list}
      </div>
      {(busy || results.length > 0) && (
        <div className="pp-zotero-results">
          {busy && <ProgressBar label="正在传输" value={count ? results.length / count : undefined} detail={`${results.length} / ${count}`} />}
          {results.length > 0 && (
            <ul>
              {results.map((r) => (
                <li key={r.key} data-failed={!r.ok || undefined}>
                  <Icon name={r.ok ? (r.warnings.length ? 'exclaim' : 'check') : 'close'} size={14} />
                  <span>
                    <strong>{r.title}</strong>
                    <small>{[r.message, ...new Set(r.warnings)].filter(Boolean).join('；')}</small>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );

  return (
    <>
      <Dialog
        size="lg"
        open={props.open}
        onClose={close}
        title={importing ? '从 Zotero 导入' : '导出到 Zotero'}
        description={importing ? undefined : `已选 ${props.ids.length} 篇，选择要放入的 Zotero 分类。`}
        footer={
          <>
            {failures > 0 && (
              <Button disabled={busy} onClick={() => void run(true)}>
                重试 {failures} 个失败项
              </Button>
            )}
            <Button onClick={close}>{busy ? '取消' : '关闭'}</Button>
            <Button variant="primary" disabled={busy || !client || (importing ? !selected.size : !writable)} onClick={() => void run()}>
              {action}
            </Button>
          </>
        }
      >
        {body}
      </Dialog>
      <Dialog
        open={!!passwordPrompt}
        onClose={() => {
          passwordPrompt?.resolve(null);
          setPasswordPrompt(undefined);
        }}
        title="PDF 密码"
        description={passwordPrompt?.incorrect ? '密码不正确，请重试。' : '这篇 PDF 有密码保护。'}
        footer={
          <Button
            variant="primary"
            onClick={() => {
              passwordPrompt?.resolve(password);
              setPasswordPrompt(undefined);
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
