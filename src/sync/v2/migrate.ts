import type { TransferStore } from '@/data/transfer-store';
import type { TransferAsset, TransferSnapshot } from '@/contracts/transfer';
import { assetMime, assetPath } from '@/transfer/assets';
import { createBackup, sha256 } from '@/transfer/backup';
import { uploadCloudBackup } from '../cloud-backup';
import { responseBytes, validate } from '../engine';
import { inflate, type SyncManifest } from '../manifest';
import { DavError, type WebDavClient } from '../webdav-client';

// 从第一版同步迁移，每台设备在每个服务器上只做一次：
//   1. 用过第一版的设备（或服务器上有第一版清单）先传一份只含记录的云备份；
//   2. 按第一版的方式把服务器上的 manifest.json 三方合并进本机，基准是本机上次第一版同步的结果；
//   3. 之后照常加入第二版的库，本机与库不同的值另存为版本。
// 第一版的 manifest.json 只读不改，旧版客户端仍能读到它。

export async function migrateFromV1(client: WebDavClient, store: TransferStore, local: TransferSnapshot, where: string, signal: AbortSignal): Promise<{ backup?: string; merged: boolean }> {
  let baseline: { url: string; manifest: SyncManifest } | undefined;
  await store.updateTransferState((_s, meta) => {
    baseline = meta.find((r) => r.key === 'transfer-sync-baseline')?.value as typeof baseline;
    return {};
  });
  const base = baseline?.url === where ? baseline.manifest : undefined;
  let remote: SyncManifest | undefined;
  try {
    remote = JSON.parse(new TextDecoder().decode(await responseBytes(await client.download('paperpane/manifest.json', signal), 64 * 1024 * 1024, signal)));
    validate(remote!);
  } catch (e) {
    if (!(e instanceof DavError) || e.status !== 404) throw e;
  }
  if (!remote && !base) return { merged: false };

  // Records only: the PDFs are not changed by syncing, and a full backup could be gigabytes.
  const backup = await uploadCloudBackup(client, await createBackup(await store.snapshot(false)), signal);
  if (!remote) return { backup, merged: false };

  const have = new Set(local.assets.map((a) => a.database + ':' + a.id));
  const fetched: TransferAsset[] = [];
  for (const a of remote.assets) {
    if (have.has(a.database + ':' + a.id)) continue;
    try {
      const bytes = await responseBytes(await client.download(`paperpane/${assetPath(a)}`, signal), 1024 * 1024 * 1024, signal);
      if ((await sha256(bytes)) !== a.sha256) continue;
      fetched.push({ ...a, blob: new Blob([new Uint8Array(bytes)], { type: assetMime(a) }) });
    } catch (e) {
      // A file the old library lost is reported missing by the reader, not a reason to stop.
      if (signal.aborted) throw e;
    }
  }
  const incoming = inflate(remote, local);
  incoming.assets = fetched;
  await store.restore(incoming, base ? inflate(base, local) : undefined);
  return { backup, merged: true };
}
