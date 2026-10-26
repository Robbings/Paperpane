import { getSchema } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Mathematics } from '@tiptap/extension-mathematics';
import { MarkdownManager } from '@tiptap/markdown';
import type { NoteContent } from '../../contracts/notes';
import { failure, success, type Result } from '../../contracts/common';
/** Import this module lazily. UI uses the same schema; persistence stores JSON. */
export const noteExtensions = [StarterKit, Mathematics.configure({ katexOptions: { trust: false, throwOnError: false } })];
const schema = getSchema(noteExtensions);
const markdown = new MarkdownManager({ extensions: noteExtensions });
export function validateNote(content: NoteContent): Result<void> {
  if (content.format !== 'paperpane-richtext' || content.schemaVersion !== 1 || content.doc.type !== 'doc') return failure('UNSUPPORTED_CONTENT', '不支持此笔记格式');
  try { const node = schema.nodeFromJSON(content.doc); node.check(); return success(undefined); }
  catch { return failure('UNSUPPORTED_CONTENT', '笔记包含不支持或无效的节点'); }
}
export function noteToMarkdown(content: NoteContent): Result<string> {
  const valid = validateNote(content); if (!valid.ok) return valid;
  try { return success(markdown.serialize(content.doc)); }
  catch { return failure('UNSUPPORTED_CONTENT', '无法导出此笔记'); }
}
