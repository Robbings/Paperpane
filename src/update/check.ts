import { browser } from 'wxt/browser';

// 检查新版本：去 GitHub 查最新的正式 Release，结果记在本机，不同步。
// 弹窗里的提示可以关掉；关掉的是那一个版本，下一个版本还会再提示。

export const REPOSITORY = 'https://github.com/Robbings/Paperpane';
const LATEST = 'https://api.github.com/repos/Robbings/Paperpane/releases/latest';
/** What the last check found (written by checks only). */
const RESULT_KEY = 'update-check';
/** The version whose popup notice was closed (written by the popup only). */
const DISMISSED_KEY = 'update-dismissed';
/** Automatic checks are spaced at least this far apart. */
const INTERVAL = 20 * 60 * 60 * 1000;

export interface ReleaseView {
  /** Without the leading v, e.g. 0.1.4. */
  version: string;
  /** The release page, where the zips are. */
  url: string;
  /** The release notes, Markdown. */
  notes: string;
  /** ISO 8601. */
  publishedAt?: string;
  /** The zip for this browser, when the release has one. */
  asset?: string;
}

export interface UpdateCheck {
  /** ISO 8601 of the last finished check, successful or not. */
  checkedAt?: string;
  /** The newest release seen; may be the version already installed. */
  latest?: ReleaseView;
  /** Why the last check failed. A failure keeps the release found before. */
  error?: string;
}

export interface UpdateState extends UpdateCheck {
  current: string;
  /** A newer version than this one exists. */
  available: boolean;
  /** The popup notice for latest was closed. */
  dismissed: boolean;
  /** Installed from a web store, which updates the extension by itself. */
  store: boolean;
}

/** Compares dotted versions numerically; a leading v and any -suffix are ignored. */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) => v.replace(/^v/i, '').split('-')[0]!.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const x = parts(a), y = parts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d) return Math.sign(d);
  }
  return 0;
}

export const currentVersion = () => browser.runtime.getManifest().version;

/** Store installs ('normal') are updated by the browser; unpacked ones are 'development'. */
async function fromStore(): Promise<boolean> {
  try {
    const self = await browser.management?.getSelf?.();
    return self?.installType === 'normal' || self?.installType === 'admin';
  } catch {
    return false;
  }
}

const edge = () => /\bEdg\//.test(navigator.userAgent);

/** The release notes without their own title line, which repeats the version. */
const notesOf = (body: unknown) => (typeof body === 'string' ? body.replace(/^\s*#\s[^\n]*\n+/, '').trim() : '');

async function fetchLatest(signal?: AbortSignal): Promise<ReleaseView> {
  let response: Response;
  try {
    response = await fetch(LATEST, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store', signal: signal ?? AbortSignal.timeout(15000) });
  } catch {
    throw new Error('连不上 GitHub，请检查网络');
  }
  if (response.status === 403 || response.status === 429) throw new Error('GitHub 暂时限制了访问，请稍后再试');
  if (!response.ok) throw new Error(`GitHub 返回 ${response.status}`);
  const data = (await response.json()) as { tag_name?: unknown; html_url?: unknown; body?: unknown; published_at?: unknown; assets?: { name?: unknown }[] };
  if (typeof data.tag_name !== 'string' || !/^v?\d+(\.\d+)*/.test(data.tag_name)) throw new Error('没读懂最新版本的信息');
  const suffix = edge() ? '-edge.zip' : '-chrome.zip';
  const asset = data.assets?.map((a) => a.name).find((name): name is string => typeof name === 'string' && name.endsWith(suffix));
  return {
    version: data.tag_name.replace(/^v/i, ''),
    url: typeof data.html_url === 'string' && data.html_url.startsWith(REPOSITORY + '/') ? data.html_url : `${REPOSITORY}/releases/latest`,
    notes: notesOf(data.body),
    publishedAt: typeof data.published_at === 'string' ? data.published_at : undefined,
    asset,
  };
}

async function readCheck(): Promise<UpdateCheck> {
  const value = (await browser.storage.local.get(RESULT_KEY))[RESULT_KEY];
  return value && typeof value === 'object' ? (value as UpdateCheck) : {};
}

export async function readUpdate(): Promise<UpdateState> {
  const [check, stored, store] = await Promise.all([readCheck(), browser.storage.local.get(DISMISSED_KEY), fromStore()]);
  const current = currentVersion();
  const available = !store && !!check.latest && compareVersions(check.latest.version, current) > 0;
  return { ...check, current, store, available, dismissed: available && stored[DISMISSED_KEY] === check.latest!.version };
}

/**
 * Asks GitHub for the newest release and records it. `automatic` skips the
 * request when a check finished recently, and store installs are never checked.
 */
export async function checkForUpdate({ automatic = false, signal }: { automatic?: boolean; signal?: AbortSignal } = {}): Promise<UpdateState> {
  const before = await readCheck();
  if (await fromStore()) return readUpdate();
  if (automatic && before.checkedAt && Date.now() - Date.parse(before.checkedAt) < INTERVAL) return readUpdate();
  let next: UpdateCheck;
  try {
    next = { checkedAt: new Date().toISOString(), latest: await fetchLatest(signal) };
  } catch (error) {
    next = { ...before, checkedAt: new Date().toISOString(), error: error instanceof Error ? error.message : '检查更新失败' };
  }
  await browser.storage.local.set({ [RESULT_KEY]: next });
  return readUpdate();
}

/** Closes the popup notice for this version only. */
export async function dismissUpdate(version: string): Promise<void> {
  await browser.storage.local.set({ [DISMISSED_KEY]: version });
}

/** Calls back whenever a check or a dismissal is recorded, in any page. */
export function onUpdateChanged(listener: () => void): () => void {
  const handle = (changes: Record<string, unknown>, area: string) => {
    if (area === 'local' && (RESULT_KEY in changes || DISMISSED_KEY in changes)) listener();
  };
  browser.storage.onChanged.addListener(handle);
  return () => browser.storage.onChanged.removeListener(handle);
}

/** Background: check once a day and when the browser starts. Development builds only check on request. */
export function installUpdateCheck() {
  if (import.meta.env.DEV) return;
  const alarm = 'paperpane-update-check';
  const run = () => void checkForUpdate({ automatic: true }).catch(() => {});
  // The worker restarts often; re-creating the alarm each time would keep pushing it back.
  void browser.alarms.get(alarm).then((existing) => {
    if (!existing) void browser.alarms.create(alarm, { delayInMinutes: 1, periodInMinutes: 6 * 60 });
  });
  browser.alarms.onAlarm.addListener((event) => {
    if (event.name === alarm) run();
  });
  browser.runtime.onStartup.addListener(run);
  browser.runtime.onInstalled.addListener(run);
}
