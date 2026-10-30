import type { DocumentAnchor } from '@/contracts/document';
import type { ImageAttachment } from '@/contracts/conversation';
import type { ResearchService } from './service';

export function withCaption(text: string, caption: string): string {
  const before = text.replace(/\s+$/, '');
  return `${before}${before ? '\n\n' : ''}图注：${caption.trim()}\n\n`;
}

/** Shared by PDF crops and clipboard images; pixels are stored before the attachment is published. */
export async function saveImageAttachment(service: ResearchService, blob: Blob, name: string, anchor: DocumentAnchor): Promise<ImageAttachment> {
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map(n => n.toString(16).padStart(2, '0')).join('');
  const assetId = `research-image:${hash}`;
  await service.store.files.put({ id: assetId, sha256: hash, blob, createdAt: new Date().toISOString() });
  return { id: crypto.randomUUID(), assetId, mimeType: 'image/png', name, anchor };
}

export async function clipboardImage(file: File): Promise<Blob> {
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp'].includes(file.type)) throw new Error('暂不支持这种图片格式');
  if (file.size > 20 * 1024 * 1024) throw new Error('图片不能超过 20 MB');
  const bitmap = await createImageBitmap(file);
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 40_000_000) throw new Error('图片尺寸过大');
    const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
    const canvas = new OffscreenCanvas(Math.max(1, Math.round(bitmap.width * scale)), Math.max(1, Math.round(bitmap.height * scale)));
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    canvas.width = canvas.height = 0;
    return blob;
  } finally { bitmap.close(); }
}

export async function appendClipboardImages(service: ResearchService, sid: string, files: readonly File[], finishAccepted = false) {
  if (files.length > 10) throw new Error('一次最多粘贴 10 张图片');
  for (const file of files) {
    if (service.disposed && !finishAccepted) throw new Error('对话已关闭');
    const blob = await clipboardImage(file);
    // Clipboard images belong to this paper's discussion, but have no invented PDF location.
    const attachment = await saveImageAttachment(service, blob, file.name || '粘贴的图片', { ...service.ref, pages: [] });
    const session = service.record.sessions.find(s => s.id === sid && !s.deletedAt);
    if (!session || (service.disposed && !finishAccepted)) throw new Error('对话已关闭');
    const result = await service.setDraft(sid, { text: session.draft.text, attachments: [...session.draft.attachments, attachment] });
    if (!result.ok) throw new Error(result.error.message);
  }
}
