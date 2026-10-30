import { PaperDatabase } from "@/data/database";
const db = new PaperDatabase();
const references = new Map<string, string>();
export const assetHash = (url: string) =>
  /^paperpane-asset:([a-f0-9]{64})$/.exec(url)?.[1] ?? references.get(url);
export const assetPattern = /paperpane-asset:([a-f0-9]{64})/g;
export const markdownWork = {
  pending: new Set<Promise<unknown>>(),
  failures: new Map<string, () => Promise<unknown>>(),
  values: new Map<string, string>(),
  discarders: new Map<string, () => void>(),
  epochs: new Map<string, number>(),
  get unsaved() {
    return this.pending.size > 0 || this.failures.size > 0;
  },
  async prepareToLeave() {
    await Promise.allSettled([...this.pending]);
    if (!this.failures.size) this.values.clear();
    return !this.failures.size;
  },
};
export function cancelMarkdownUploads(key: string) {
  markdownWork.epochs.set(key, (markdownWork.epochs.get(key) ?? 0) + 1);
  markdownWork.discarders.get(key)?.();
  markdownWork.discarders.delete(key);
  markdownWork.failures.delete(key);
}
export function trackMarkdownWork<T>(job: Promise<T>) {
  markdownWork.pending.add(job);
  void job.finally(() => markdownWork.pending.delete(job)).catch(() => {});
  return job;
}
export class MarkdownAssets {
  private urls = new Map<string, string>();
  private disposed = false;
  async url(hash: string) {
    if (this.urls.has(hash)) return this.urls.get(hash)!;
    const blob = await db.files.read("note-image:" + hash);
    if (this.disposed) throw new Error("编辑器已关闭");
    // Another hydration may have completed while this read was pending.
    if (this.urls.has(hash)) return this.urls.get(hash)!;
    const url = URL.createObjectURL(blob);
    this.urls.set(hash, url);
    references.set(url, hash);
    return url;
  }
  async hydrate(md: string) {
    let result = md;
    for (const [, hash] of md.matchAll(assetPattern)) {
      try {
        result = result.replaceAll(
          "paperpane-asset:" + hash,
          await this.url(hash!),
        );
      } catch {
        /* Preserve unresolved immutable references so a retry never erases an image. */
      }
    }
    return result;
  }
  canonical(md: string) {
    let value = md;
    for (const [url, hash] of references)
      value = value.replaceAll(url, "paperpane-asset:" + hash);
    return value;
  }
  async upload(file: File) {
    if (
      ![
        "image/png",
        "image/jpeg",
        "image/webp",
        "image/gif",
        "image/bmp",
      ].includes(file.type) ||
      file.size > 20 * 1024 * 1024
    )
      throw new Error("请使用不超过 20 MB 的图片");
    const bitmap = await createImageBitmap(file);
    let blob: Blob;
    try {
      if (
        !bitmap.width ||
        !bitmap.height ||
        bitmap.width * bitmap.height > 40000000
      )
        throw new Error("图片尺寸过大");
      const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height)),
        canvas = new OffscreenCanvas(
          Math.max(1, Math.round(bitmap.width * scale)),
          Math.max(1, Math.round(bitmap.height * scale)),
        );
      canvas
        .getContext("2d")!
        .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      blob = await canvas.convertToBlob({ type: "image/png" });
      canvas.width = canvas.height = 0;
    } finally {
      bitmap.close();
    }
    const hash = [
      ...new Uint8Array(
        await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()),
      ),
    ]
      .map((n) => n.toString(16).padStart(2, "0"))
      .join("");
    await db.files.put({
      id: "note-image:" + hash,
      sha256: hash,
      blob,
      createdAt: new Date().toISOString(),
    });
    return { hash, reference: "paperpane-asset:" + hash };
  }
  dispose() {
    this.disposed = true;
    for (const url of this.urls.values()) URL.revokeObjectURL(url);
    this.urls.clear();
  }
}
