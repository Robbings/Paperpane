import { useEffect, useRef, useState } from 'react';
import { Button, Dialog, ProgressBar, Switch, TextField, toast } from '@/ui/components';
import { requestImportOrigin } from '@/document/permissions';
import { useSync } from '@/runtime/use-sync';
import { useTransfer } from '@/runtime/use-transfer';
import { cloudBackups, downloadCloudBackup, uploadCloudBackup } from '@/sync/cloud-backup';
import { synchronize } from '@/sync/engine';
import { ConnectionStore } from '@/sync/settings';
import { WebDavClient } from '@/sync/webdav-client';
import { ZoteroClient } from '@/zotero/client';
import { SettingGroup, SettingRow } from '../SettingRow';
import { sinceText } from '../StatusLine';
import { SyncConflicts } from '../SyncConflicts';
import { SyncTrash } from '../SyncTrash';
import { ZoteroDiscovery } from './ZoteroDiscovery';

const failed = (error: unknown, fallback: string) => toast.show({ tone: 'error', message: error instanceof Error ? error.message : fallback });
const done = (message: string) => toast.show({ tone: 'success', message, duration: 2600 });

/** A short state beside a group title: a dot and a word. */
function Badge({ tone, children }: { tone: 'ok' | 'warn' | 'busy' | 'idle'; children: string }) {
  return (
    <span className="pp-set-badge" data-tone={tone}>
      <span aria-hidden="true" />
      {children}
    </span>
  );
}

/** WebDAV: connect, then sync now or automatically. */
function WebDavGroup() {
  const { connections, state } = useSync();
  const dav = connections.dav;
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'connect' | 'sync' | null>(null);
  const controller = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (dav) {
      setUrl(dav.url);
      setUsername(dav.username);
    }
  }, [dav?.url, dav?.username]);

  const connect = async () => {
    const access = requestImportOrigin(url);
    setBusy('connect');
    const db = new ConnectionStore();
    const abort = new AbortController();
    controller.current = abort;
    try {
      if (!(await access)) throw new Error('没有获得 WebDAV 访问权限');
      const old = await db.dav();
      const secret = password || (old?.url === url && old.username === username ? old.password : '');
      if (!secret) throw new Error('请输入 WebDAV 密码');
      const connection = { url, username, password: secret };
      const capability = await new WebDavClient(connection).probe(abort.signal);
      await db.saveDav(connection, capability.conditional, dav?.automatic ?? false);
      setPassword('');
      setEditing(false);
      if (capability.conditional) done('WebDAV 已连接');
      else toast.show({ tone: 'warning', message: '已连接，但这个服务器不支持可靠的同步，只能做云备份' });
    } catch (error) {
      failed(error, '连接失败');
    } finally {
      await db.close();
      controller.current = undefined;
      setBusy(null);
    }
  };
  const sync = async () => {
    setBusy('sync');
    const abort = new AbortController();
    controller.current = abort;
    try {
      await synchronize(abort.signal);
      done('同步完成');
    } catch (error) {
      if (!abort.signal.aborted) failed(error, '同步失败');
    } finally {
      controller.current = undefined;
      setBusy(null);
    }
  };
  const automatic = async (value: boolean) => {
    const db = new ConnectionStore();
    try {
      const connection = await db.dav();
      if (connection) await db.saveDav(connection, !!dav?.conditional, value);
    } catch (error) {
      failed(error, '没能保存');
    } finally {
      await db.close();
    }
  };
  const disconnect = async () => {
    const db = new ConnectionStore();
    try {
      await db.disconnect('dav');
      setUrl('');
      setUsername('');
      setPassword('');
    } catch (error) {
      failed(error, '没能断开');
    } finally {
      await db.close();
    }
  };

  const running = busy === 'sync' || state.phase === 'running';
  const badge = !dav ? (
    <Badge tone="idle">未连接</Badge>
  ) : running ? (
    <Badge tone="busy">同步中</Badge>
  ) : state.phase === 'failed' ? (
    <Badge tone="warn">同步失败</Badge>
  ) : !dav.conditional ? (
    <Badge tone="warn">仅云备份</Badge>
  ) : (
    <Badge tone="ok">已连接</Badge>
  );

  return (
    <SettingGroup title="WebDAV 同步" actions={badge}>
      {!dav || editing ? (
        <>
          <SettingRow label="地址">
            <TextField label="WebDAV 地址" hideLabel placeholder="https://dav.example.com/paperpane" value={url} onChange={setUrl} />
          </SettingRow>
          <SettingRow label="用户名">
            <TextField label="WebDAV 用户名" hideLabel value={username} onChange={setUsername} />
          </SettingRow>
          <SettingRow label="密码">
            <TextField
              label="WebDAV 密码"
              hideLabel
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={setPassword}
              placeholder={dav?.hasPassword ? '已设置，留空保持不变' : ''}
            />
          </SettingRow>
          <div className="pp-set-actions">
            {busy === 'connect' && <ProgressBar label="正在连接" />}
            {editing && (
              <Button size="sm" variant="quiet" disabled={!!busy} onClick={() => setEditing(false)}>
                取消
              </Button>
            )}
            <Button size="sm" variant="primary" disabled={!!busy || !url.trim()} onClick={() => void connect()}>
              连接
            </Button>
          </div>
        </>
      ) : (
        <>
          <SettingRow label="服务器">
            <span className="pp-set-value" title={dav.url}>
              {dav.username ? `${dav.username} · ` : ''}
              {dav.url.replace(/^https?:\/\//, '')}
            </span>
            <Button size="sm" variant="quiet" disabled={running} onClick={() => setEditing(true)}>
              修改
            </Button>
            <Button size="sm" variant="quiet" disabled={running} onClick={() => void disconnect()}>
              断开
            </Button>
          </SettingRow>
          <SettingRow label="立即同步" hint="合并两端已保存的内容；有冲突时由你选择保留哪一份">
            <span className="pp-set-value">{state.lastSuccess ? `上次 ${sinceText(state.lastSuccess)}` : '尚未同步'}</span>
            {running ? (
              <Button size="sm" variant="quiet" onClick={() => controller.current?.abort()}>
                取消
              </Button>
            ) : (
              <Button size="sm" disabled={!dav.conditional} onClick={() => void sync()}>
                同步
              </Button>
            )}
          </SettingRow>
          <SettingRow label="自动同步" hint="浏览器开着时每五分钟同步一次">
            <Switch label="自动同步" hideLabel checked={dav.automatic} disabled={running || !dav.conditional} onChange={(value) => void automatic(value)} />
          </SettingRow>
          <SyncConflicts />
          <ZoteroDiscovery />
        </>
      )}
    </SettingGroup>
  );
}

/** Backups: a file on this computer, or a copy on the WebDAV server. */
function BackupGroup() {
  const { connections } = useSync();
  const transfer = useTransfer();
  const input = useRef<HTMLInputElement>(null);
  const [cloud, setCloud] = useState<string[] | undefined>();
  const [cloudBusy, setCloudBusy] = useState(false);

  useEffect(() => {
    if (!transfer.message) return;
    if (transfer.result) done(transfer.message);
    else toast.show({ tone: 'error', message: transfer.message });
  }, [transfer.message]);

  const download = async () => {
    const blob = await transfer.backup();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Paperpane-${new Date().toISOString().slice(0, 10)}.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  };
  const remote = async (action: 'upload' | 'list' | string) => {
    setCloudBusy(true);
    const db = new ConnectionStore();
    try {
      const connection = await db.dav();
      if (!connection) throw new Error('请先连接 WebDAV');
      const client = new WebDavClient(connection);
      if (action === 'upload') {
        const blob = await transfer.backup();
        if (blob) {
          await uploadCloudBackup(client, blob);
          done('云备份已保存');
        }
      } else if (action === 'list') {
        const paths = await cloudBackups(client);
        if (paths.length) setCloud(paths);
        else toast.show({ message: '服务器上还没有云备份' });
      } else {
        const blob = await downloadCloudBackup(client, action);
        await transfer.inspect(blob);
        setCloud(undefined);
      }
    } catch (error) {
      failed(error, '云备份操作失败');
    } finally {
      setCloudBusy(false);
      await db.close();
    }
  };

  const busy = transfer.busy || cloudBusy;
  const preview = transfer.preview;
  const records = preview?.databases.reduce((n, d) => n + Object.values(d.stores).reduce((m, r) => m + r.length, 0), 0) ?? 0;
  return (
    <SettingGroup title="备份" actions={busy ? <Badge tone="busy">处理中</Badge> : undefined}>
      <SettingRow label="本机备份" hint="论文、书目、批注、笔记和研究内容，不含密钥">
        <Button size="sm" disabled={busy} onClick={() => void download()}>
          导出
        </Button>
        <Button size="sm" disabled={busy} onClick={() => input.current?.click()}>
          恢复
        </Button>
      </SettingRow>
      <SettingRow label="云备份" hint={connections.dav ? '在 WebDAV 上另存一份完整备份' : '连接 WebDAV 后可用'}>
        <Button size="sm" disabled={busy || !connections.dav} onClick={() => void remote('upload')}>
          备份
        </Button>
        <Button size="sm" disabled={busy || !connections.dav} onClick={() => void remote('list')}>
          恢复
        </Button>
      </SettingRow>
      <SyncTrash />
      {busy && (
        <div className="pp-set-actions">
          <ProgressBar label="正在处理备份" />
        </div>
      )}
      <input
        ref={input}
        hidden
        type="file"
        accept=".zip,application/zip"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void transfer.inspect(file);
        }}
      />
      <Dialog open={cloud !== undefined} onClose={() => setCloud(undefined)} title="选择云备份">
        <ul className="pp-set-list">
          {cloud?.map((path) => (
            <li key={path}>
              <span>{path.split('/').at(-1)}</span>
              <Button size="sm" disabled={cloudBusy} onClick={() => void remote(path)}>
                恢复
              </Button>
            </li>
          ))}
        </ul>
      </Dialog>
      <Dialog
        open={!!preview}
        onClose={transfer.dismiss}
        title="恢复备份"
        description={
          preview
            ? `${preview.version === 1 ? '旧版备份，可能缺少笔记与图片' : preview.complete ? '完整备份' : '数据备份'} · ${preview.assets.length} 个附件 · ${records} 条记录`
            : undefined
        }
        footer={
          <>
            <Button onClick={transfer.dismiss} disabled={transfer.busy}>
              取消
            </Button>
            <Button variant="primary" onClick={() => void transfer.restore()} disabled={transfer.busy}>
              合并恢复
            </Button>
          </>
        }
      />
    </SettingGroup>
  );
}

/** Zotero: an API key for importing from and exporting to the Zotero library. */
function ZoteroGroup() {
  const { connections } = useSync();
  const zotero = connections.zotero;
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const connect = async () => {
    const access = requestImportOrigin('https://api.zotero.org');
    setBusy(true);
    const db = new ConnectionStore();
    try {
      if (!(await access)) throw new Error('没有获得 Zotero 访问权限');
      const secret = key || (await db.zotero());
      if (!secret) throw new Error('请输入 Zotero API Key');
      const result = await new ZoteroClient(secret).connection();
      await db.saveZotero(secret, String(result.userID), !!result.access.user?.write);
      setKey('');
      if (!result.access.user?.files) toast.show({ tone: 'warning', message: 'Zotero 已连接，但这个 API Key 不能读取附件' });
    } catch (error) {
      failed(error, '连接失败');
    } finally {
      setBusy(false);
      await db.close();
    }
  };
  const disconnect = async () => {
    const db = new ConnectionStore();
    try {
      await db.disconnect('zotero');
      setKey('');
    } finally {
      await db.close();
    }
  };
  return (
    <SettingGroup title="Zotero" actions={zotero ? <Badge tone="ok">{zotero.writable ? '已连接 · 可导入导出' : '已连接 · 只读'}</Badge> : <Badge tone="idle">未连接</Badge>}>
      {zotero ? (
        <SettingRow label="API Key" hint="只保存在本机；断开后已导入的论文保留">
          <span className="pp-set-value">已设置</span>
          <Button size="sm" variant="quiet" onClick={() => void disconnect()}>
            断开
          </Button>
        </SettingRow>
      ) : (
        <SettingRow label="API Key" hint="在 zotero.org 的设置里创建，需要读取文献库的权限">
          <TextField label="Zotero API Key" hideLabel type="password" autoComplete="new-password" value={key} onChange={setKey} />
          <Button size="sm" variant="primary" disabled={busy || !key.trim()} onClick={() => void connect()}>
            {busy ? '连接中…' : '连接'}
          </Button>
        </SettingRow>
      )}
    </SettingGroup>
  );
}

/** 同步与备份: WebDAV, backups and Zotero, each one group with its state beside the title. */
export function SyncPage() {
  return (
    <>
      <WebDavGroup />
      <BackupGroup />
      <ZoteroGroup />
    </>
  );
}
