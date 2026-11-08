import { responseBytes } from '../engine';
import { DavError, type WebDavClient } from '../webdav-client';

// 不靠列目录发现新文件。有的服务器（OpenList 挂 OneDrive）目录列表会长时间是旧的，
// 但按已知路径下载总是可靠的，所以：
//
//   changes/<sha256>.bin   每个文件开头写明写入者和它的上一个文件，同一写入者的文件连成一条链
//   heads/<写入者>.json     这个写入者最新的文件名，以及它知道的所有写入者
//   writers.json           写入者名单，新设备从这里开始找
//
// 读的时候：名单 → 各写入者的指针 → 顺着链往回下载，直到碰到已经合并过的文件。
// 名单和指针可能被并发写入覆盖掉一项，所以每个指针都带着已知写入者的名单互相补全，
// 写完还要读回来核对。能列目录的服务器照样列，结果取并集。

export const ROOT = 'paperpane/sync-v2';
export const CHANGES = ROOT + '/changes';
export const HEADS = ROOT + '/heads';
const REGISTRY = ROOT + '/writers.json';
export const NAME = /^[a-f0-9]{64}\.bin$/;
const WRITER = /^[a-f0-9]{32}$/;

export interface Header {
  /** Who wrote the file. Copies of one browser profile share it. */
  writer: string;
  /** The file this writer wrote just before, or null for its first. */
  prev: string | null;
}

const MAGIC = new TextEncoder().encode('PPV2\n');

/** A change file: magic, header length (4 bytes), header JSON, then the Automerge bytes. */
export function pack(header: Header, chunk: Uint8Array): Uint8Array {
  const json = new TextEncoder().encode(JSON.stringify(header));
  const out = new Uint8Array(MAGIC.length + 4 + json.length + chunk.length);
  out.set(MAGIC, 0);
  new DataView(out.buffer).setUint32(MAGIC.length, json.length);
  out.set(json, MAGIC.length + 4);
  out.set(chunk, MAGIC.length + 4 + json.length);
  return out;
}

export function unpack(bytes: Uint8Array): { header?: Header; chunk: Uint8Array } {
  if (bytes.length < MAGIC.length + 4 || MAGIC.some((b, i) => bytes[i] !== b)) return { chunk: bytes };
  const length = new DataView(bytes.buffer, bytes.byteOffset).getUint32(MAGIC.length);
  const start = MAGIC.length + 4;
  try {
    const header = JSON.parse(new TextDecoder().decode(bytes.subarray(start, start + length)));
    const valid = header && WRITER.test(header.writer) && (header.prev === null || NAME.test(header.prev));
    return { header: valid ? header : undefined, chunk: bytes.subarray(start + length) };
  } catch {
    return { chunk: bytes.subarray(start + length) };
  }
}

export const newWriter = () => crypto.randomUUID().replace(/-/g, '');

interface Pointer {
  writer: string;
  heads: string[];
  writers: string[];
}

async function getJson(client: WebDavClient, path: string, signal: AbortSignal): Promise<any> {
  try {
    const bytes = await responseBytes(await client.download(path, signal), 4 * 1024 * 1024, signal);
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (e) {
    if (signal.aborted) throw e;
    // Missing, briefly unavailable or half-written: treated as empty, read again next time.
    return undefined;
  }
}
const names = (v: unknown, pattern: RegExp) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && pattern.test(x)) : []);

/** Every writer reachable from the registry and the writers already known, with their newest files. */
export async function readPointers(client: WebDavClient, known: Iterable<string>, signal: AbortSignal) {
  const registry = await getJson(client, REGISTRY, signal);
  const writers = new Set([...known, ...names(registry?.writers, WRITER)]);
  const heads = new Map<string, string[]>();
  for (let changed = true; changed; ) {
    changed = false;
    for (const writer of [...writers]) {
      if (heads.has(writer)) continue;
      const pointer = await getJson(client, `${HEADS}/${writer}.json`, signal);
      heads.set(writer, names(pointer?.heads, NAME));
      for (const other of names(pointer?.writers, WRITER)) if (!writers.has(other)) { writers.add(other); changed = true; }
    }
  }
  return { writers, heads, registered: names(registry?.writers, WRITER) };
}

type Write = (path: string, body: Blob) => Promise<void>;
const json = (value: unknown) => new Blob([JSON.stringify(value)], { type: 'application/json' });

/**
 * Points this writer's pointer at `latest`. The pointer is read, merged and written
 * back, then read again: a copy of this profile writing the same pointer at the same
 * time keeps its own head, and a lost write is noticed and retried.
 */
export async function publishPointer(client: WebDavClient, write: Write, writer: string, latest: string, replaced: string[], writers: Set<string>, signal: AbortSignal) {
  const path = `${HEADS}/${writer}.json`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const current = await getJson(client, path, signal);
    const heads = new Set(names(current?.heads, NAME).filter((n) => !replaced.includes(n)));
    heads.add(latest);
    const pointer: Pointer = { writer, heads: [...heads].sort(), writers: [...new Set([...writers, ...names(current?.writers, WRITER), writer])].sort() };
    await write(path, json(pointer));
    const back = await getJson(client, path, signal);
    if (names(back?.heads, NAME).includes(latest)) return;
  }
  throw new Error('同步指针没能写入，请稍后重试');
}

/** Adds this writer to the registry when it is missing; others' entries are kept. */
export async function register(client: WebDavClient, write: Write, writer: string, writers: Set<string>, signal: AbortSignal) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const current = await getJson(client, REGISTRY, signal);
    const listed = names(current?.writers, WRITER);
    if (listed.includes(writer)) return;
    await write(REGISTRY, json({ writers: [...new Set([...listed, ...writers, writer])].sort() }));
  }
  throw new Error('同步设备名单没能写入，请稍后重试');
}

/** Best effort: servers whose listings are current find files faster this way. */
export async function listed(client: WebDavClient, signal: AbortSignal): Promise<string[]> {
  try {
    return (await client.names(CHANGES, signal)).filter((n) => NAME.test(n));
  } catch (e) {
    if (signal.aborted || (e instanceof DavError && [401, 403].includes(e.status))) throw e;
    return [];
  }
}
