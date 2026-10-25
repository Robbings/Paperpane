import type { AppError } from '../contracts/common';
import { StorageFault } from '../data/database';
export class ImportFault extends Error {
  constructor(readonly detail: AppError) { super(detail.message); }
}
export function importError(error: unknown): AppError {
  if (error instanceof ImportFault) return error.detail;
  if (error instanceof StorageFault) return { code: error.kind === 'missing' ? 'FILE_MISSING' : error.kind === 'invalid' ? 'INVALID_INPUT' : 'SAVE_FAILED', message: error.message, recovery: [error.kind === 'missing' ? 'choose-file' : 'retry'] };
  const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : '';
  if (name === 'QuotaExceededError') return { code: 'QUOTA_EXCEEDED', message: '存储空间不足，文件尚未保存', recovery: ['free-space', 'retry'] };
  if (name === 'AbortError') return { code: 'CANCELLED', message: '导入已取消', recovery: ['retry'] };
  if (name === 'InvalidPDFException' || name === 'FormatError') return { code: 'CORRUPT_FILE', message: 'PDF 结构无法读取，文件可能不完整或已损坏', recovery: ['choose-file'] };
  if (name === 'PasswordException') return { code: 'PASSWORD_REQUIRED', message: '此 PDF 需要密码', recovery: ['enter-password'] };
  // Never display arbitrary exception text: it can contain a signed URL or file contents.
  return { code: 'SAVE_FAILED', message: '导入未完成，请重试；仍失败时请重新选择文件', recovery: ['retry', 'choose-file'] };
}
export function abortIfNeeded(signal: AbortSignal) { if (signal.aborted) throw new DOMException('Cancelled', 'AbortError'); }
