import { useEffect, useRef, useState } from 'react';
import { Button, Checkbox, Dialog, Icon, IconButton, Spinner, TextField, Tree, toast } from '@/ui/components';
import { ConnectionStore } from '@/sync/settings';
import { ZoteroClient } from '@/zotero/client';
import type { ZoteroItem, ZoteroCollection } from '@/zotero/types';
import type { ZoteroTransferItemResult } from '@/zotero/import';
import { importZotero } from '@/zotero/import';
import { exportZotero } from '@/zotero/export';
import { collectionLabels, importable } from '@/zotero/catalog';
import { ZoteroDestination } from './ZoteroDestination';
import { ZoteroSetupSteps } from './ZoteroSetupSteps';
import './zotero.css';

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

/** "Smith 等 · 2021 · 方法 / 检索" from whatever the item has. */
function byline(item: ZoteroItem, collections: readonly ZoteroCollection[]) {
  const creators = item.data.creators ?? [];
  const first = creators[0] ? creators[0].lastName || creators[0].name || creators[0].firstName : undefined;
  const authors = first ? (creators.length > 1 ? `${first} 等` : first) : undefined;
  const year = item.data.date?.match(/\d{4}/)?.[0];
  return [authors, year, collectionLabels(item, collections)[0]].filter(Boolean).join(' · ');
}

const kind = (item: ZoteroItem) => (item.data.itemType === 'attachment' ? 'PDF' : item.meta?.numChildren ? '含附件' : '仅书目');

export function ZoteroImportDialog(props: Props) {
  const importing = props.mode === 'import';
  const [client, setClient] = useState<ZoteroClient>();
  const [state, setState] = useState<'connecting' | 'unconnected' | 'failed' | 'ready'>('connecting');
  const [failure, setFailure] = useState('');
  const [collections, setCollections] = useState<ZoteroCollection[]>([]);
  const [collection, setCollection] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [items, setItems] = useState<ZoteroItem[]>([]);
  const [selected, setSelected] = useState<Map<string, ZoteroItem>>(new Map());
  const [text, setText] = useState('');
  const [start, setStart] = useState(0);
  const [total, setTotal] = useState(0);
  const [destination, setDestination] = useState<'collections' | 'folder'>('collections');
  const [folder, setFolder] = useState(props.folderId ?? 'root');
  const [loading, setLoading] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(0);
  const [results, setResults] = useState<ZoteroTransferItemResult[]>([]);
  const [showProblems, setShowProblems] = useState(false);
  /** Set when a run ends: the dialog then says it is done and offers 完成. */
  const [finished, setFinished] = useState<number | null>(null);
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
    setState('connecting');
    setFailure('');
    setItems([]);
    setCollections([]);
    setCollection(null);
    setText('');
    setStart(0);
    setWritable(false);
    setResults([]);
    setShowProblems(false);
    setFinished(null);
    setSelected(new Map());
    setFolder(props.folderId ?? 'root');
    setDestination('collections');
    void (async () => {
      try {
        const [settings, key] = await Promise.all([db.view(), db.zotero()]);
        if (abort.signal.aborted) return;
        if (!settings.zotero || !key) {
          setState('unconnected');
          return;
        }
        const connection = new ZoteroClient(key, settings.zotero.userId);
        const tree = await connection.collections(abort.signal);
        if (abort.signal.aborted) return;
        setClient(connection);
        setWritable(settings.zotero.writable);
        setCollections(tree);
        setState('ready');
        if (!importing && !settings.zotero.writable)
          toast.show({ tone: 'warning', message: '这个 Zotero 密钥没有写入权限，无法导出', action: { label: '去设置', onAction: openSettings } });
      } catch (e) {
        if (abort.signal.aborted) return;
        setFailure(message(e, '读取失败'));
        setState('failed');
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
    setLoading(true);
    const timeout = setTimeout(() => {
      void client
        .items({ collection: collection ?? undefined, text, start }, abort.signal)
        .then((result) => {
          if (abort.signal.aborted) return;
          setItems(result.items.filter(importable));
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
    setShowProblems(false);
    setFinished(null);
    const failed = new Set(results.filter((r) => !r.ok).map((r) => r.key));
    const finished: ZoteroTransferItemResult[] = retry ? results.filter((r) => r.ok) : [];
    setResults(finished.slice());
    const done = (result: ZoteroTransferItemResult) => {
      finished.push(result);
      if (live.current) setResults((old) => [...old.filter((r) => r.key !== result.key), result]);
    };
    try {
      let batch: number;
      if (importing) {
        const papers = [...selected.values()].filter((i) => !retry || failed.has(i.key));
        batch = papers.length;
        setCount(finished.length + papers.length);
        const target = folder === 'root' ? null : folder;
        await importZotero(
          client,
          papers,
          destination === 'collections' ? null : target,
          abort.signal,
          done,
          (incorrect) =>
            new Promise((resolve) => {
              setPassword('');
              setPasswordPrompt({ incorrect, resolve });
            }),
          undefined,
          destination === 'collections' ? { kind: 'collections', collections } : { kind: 'folder', folderId: target },
        );
      } else {
        const ids = props.ids.filter((id) => !retry || failed.has(id));
        batch = ids.length;
        setCount(finished.length + ids.length);
        await exportZotero(client, ids, collection, abort.signal, done);
      }
      props.onDone();
      if (!live.current) return;
      const verb = importing ? '导入' : '导出';
      const bad = finished.filter((r) => !r.ok).length;
      const partial = finished.filter((r) => r.ok && r.warnings.length).length;
      setFinished(finished.length - bad);
      if (bad) {
        // Stay open on the problems, with retry in the footer.
        setShowProblems(true);
        toast.show({ tone: 'warning', message: `${finished.length - bad} 篇已${verb}，${bad} 篇失败` });
      } else {
        toast.show({ tone: 'success', message: `已${verb} ${batch} 篇${partial ? `，${partial} 篇有部分内容未导入` : ''}`, duration: 3200 });
        // Imported, with notes on what was left out: say so and let the reader close it.
        if (partial) {
          setSelected(new Map());
          setShowProblems(true);
        } else props.onClose();
      }
    } catch (e) {
      if (live.current && !abort.signal.aborted) toast.show({ tone: 'error', message: message(e, '操作失败'), action: { label: '重试', onAction: () => void run(retry) } });
    } finally {
      operation.current = undefined;
      if (live.current) setBusy(false);
    }
  };

  /** Every result of the current collection and search, across pages. */
  const selectAll = async () => {
    if (!client || operation.current) return;
    const abort = new AbortController();
    operation.current = abort;
    setSelecting(true);
    try {
      const rows = await client.allItems({ collection: collection ?? undefined, text }, abort.signal);
      if (!abort.signal.aborted) setSelected(new Map(rows.filter(importable).map((row) => [row.key, row])));
    } catch (e) {
      if (!abort.signal.aborted) toast.show({ tone: 'error', message: message(e, '全选失败') });
    } finally {
      operation.current = undefined;
      if (live.current) setSelecting(false);
    }
  };

  const locked = busy || selecting;
  const close = () => {
    if (locked) {
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
    if (locked) return;
    setCollection(id);
    setStart(0);
  };

  // ---- Not connected: a short note and the way to connect, not the whole picker. ----
  if (state === 'unconnected' || state === 'failed') {
    return (
      <Dialog
        open={props.open}
        onClose={close}
        title={importing ? '从 Zotero 导入' : '导出到 Zotero'}
        footer={
          <>
            <Button onClick={close}>关闭</Button>
            <Button variant="primary" onClick={openSettings}>
              去设置
            </Button>
          </>
        }
      >
        <div className="pp-zotero-connect">
          <p>{state === 'failed' ? `连接 Zotero 失败：${failure}` : '先在设置的「同步与备份」里连接 Zotero。'}</p>
          <ZoteroSetupSteps />
        </div>
      </Dialog>
    );
  }

  const nodes = collections.map((c) => ({ id: c.key, parentId: c.data.parentCollection || null, label: c.data.name, icon: 'folder' as const }));
  const problems = results.filter((r) => !r.ok || r.warnings.length);
  const failures = results.filter((r) => !r.ok).length;

  const sidebar = (
    <aside className="pp-zotero-collections">
      <div
        className="pp-tree__row pp-zotero-all"
        role="button"
        tabIndex={0}
        aria-selected={collection === null}
        style={{ paddingLeft: 6 }}
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
          label={pickedHere ? `本页 ${pickedHere}` : '本页'}
          checked={!!items.length && pickedHere === items.length}
          indeterminate={pickedHere > 0 && pickedHere < items.length}
          disabled={locked || loading || !items.length}
          onChange={pickPage}
        />
        {total > items.length && (
          <button type="button" className="pp-zotero-link" disabled={locked || loading} onClick={() => void selectAll()}>
            {selecting ? <Spinner size={12} label="正在全选" /> : `全选 ${total} 篇`}
          </button>
        )}
        <span className="pp-zotero-pager">
          {loading && <Spinner size={12} label="正在读取" />}
          {total > PAGE && (
            <>
              <span>
                {start + 1}–{Math.min(start + PAGE, total)} / {total}
              </span>
              <IconButton icon="chevronLeft" label="上一页" disabled={locked || loading || !start} onClick={() => setStart(Math.max(0, start - PAGE))} />
              <IconButton icon="chevronRight" label="下一页" disabled={locked || loading || start + PAGE >= total} onClick={() => setStart(start + PAGE)} />
            </>
          )}
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
                description={byline(item, collections) || undefined}
                checked={selected.has(item.key)}
                disabled={locked}
                onChange={(on) => pick(item, on)}
              />
              <span className="pp-zotero-kind">{kind(item)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  // Failed (and incomplete) items only; the rest went through.
  const problemList = showProblems && problems.length > 0 && (
    <ul className="pp-zotero-problems">
      {problems.map((r) => (
        <li key={r.key} data-failed={!r.ok || undefined}>
          <Icon name={r.ok ? 'exclaim' : 'close'} size={13} />
          <span>
            <strong>{r.title}</strong>
            <small>{r.ok ? [...new Set(r.warnings)].join('；') : r.message}</small>
          </span>
        </li>
      ))}
    </ul>
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
            <span className="pp-zotero-status" role="status">
              {busy ? (
                <>
                  <Spinner size={13} label="正在传输" />
                  {results.length} / {count}
                </>
              ) : finished !== null ? (
                <>
                  <span className="pp-zotero-done">
                    <Icon name="check" size={14} />
                    已{importing ? '导入' : '导出'} {finished} 篇
                  </span>
                  {problems.length > 0 && (
                    <button
                      type="button"
                      className="pp-zotero-link"
                      data-tone={failures ? 'danger' : undefined}
                      aria-expanded={showProblems}
                      onClick={() => setShowProblems((v) => !v)}
                    >
                      {failures ? `${failures} 篇失败` : `${problems.length} 篇有部分内容未导入`}
                    </button>
                  )}
                </>
              ) : importing && selected.size > 0 ? (
                `已选 ${selected.size} 篇`
              ) : null}
            </span>
            {failures > 0 && !busy && <Button onClick={() => void run(true)}>重试失败的</Button>}
            {finished !== null && !busy && !failures && !selected.size ? (
              <Button variant="primary" onClick={close}>
                完成
              </Button>
            ) : (
              <>
                <Button onClick={close}>{locked ? '取消' : '关闭'}</Button>
                <Button variant="primary" disabled={locked || !client || (importing ? !selected.size : !writable)} onClick={() => void run()}>
                  {importing ? '导入' : '导出'}
                </Button>
              </>
            )}
          </>
        }
      >
        {!client ? (
          <div className="pp-zotero-wait">
            <Spinner label="正在连接 Zotero" />
          </div>
        ) : (
          <div className="pp-zotero-body">
            {importing && (
              <TextField
                icon="search"
                clearable
                label="搜索 Zotero"
                hideLabel
                placeholder="搜索标题、作者"
                value={text}
                disabled={locked}
                onChange={(value) => {
                  setText(value);
                  setStart(0);
                }}
              />
            )}
            <div className="pp-zotero-picker" data-mode={props.mode}>
              {sidebar}
              {importing && list}
            </div>
            {importing && (
              <ZoteroDestination mode={destination} onMode={setDestination} folder={folder} onFolder={setFolder} folders={props.folders} disabled={locked} />
            )}
            {problemList}
          </div>
        )}
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
