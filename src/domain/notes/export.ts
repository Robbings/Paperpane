import { zipSync, strToU8 } from 'fflate';
import { NoteDatabase } from '@/data/note-database';
import { noteToMarkdown } from './codec';
import type { LibraryItem } from '@/contracts/library';

/** Portable Markdown with local images, usable outside the extension and in Zotero. */
export async function exportNotes(items: readonly LibraryItem[], includeShortNotes = true): Promise<Blob | undefined> {
  const db = new NoteDatabase();
  const files: Record<string, Uint8Array> = {};
  try {
    for (const [index, item] of items.entries()) {
      let markdown = '';
      if (item.document) {
        const result = noteToMarkdown((await db.readNote(item.document)).version.content);
        if (!result.ok) throw new Error(result.error.message);
        markdown = result.value;
      }
      if (!markdown.trim() && !(includeShortNotes && item.shortNote?.trim())) continue;
      const directory = `${index + 1}-${item.title.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 80) || 'paper'}`;
      if (includeShortNotes && item.shortNote?.trim()) files[`${directory}/short-note.md`] = strToU8(item.shortNote);
      for (const hash of new Set([...markdown.matchAll(/paperpane-asset:([a-f0-9]{64})/g)].map(match => match[1]!))) {
        const blob = await db.files.read('note-image:' + hash);
        const ext = ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/bmp': 'bmp' } as Record<string, string>)[blob.type] ?? 'png';
        const relative = `assets/${hash}.${ext}`;
        files[`${directory}/${relative}`] = new Uint8Array(await blob.arrayBuffer());
        markdown = markdown.replaceAll('paperpane-asset:' + hash, relative);
      }
      if (markdown.trim()) files[`${directory}/notes.md`] = strToU8(markdown);
    }
    if (!Object.keys(files).length) return;
    // Stable bytes make repeated exports idempotent; preserve the authored Markdown.
    return new Blob([new Uint8Array(zipSync(files, { mtime: new Date(1980, 0, 1), level: 6 }))], { type: 'application/zip' });
  } finally { await db.close(); }
}
