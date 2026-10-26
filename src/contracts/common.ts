/** Portable DTOs only: no React, editor, browser or SDK instances. */
export type Id = string;
export type Revision = string;
export type ISODate = string;
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type RecoveryAction = 'retry' | 'choose-file' | 'enter-password' | 'request-access' | 'free-space' | 'resolve-conflict' | 'configure-model' | 'change-model' | 'reload';
export type ErrorCode = 'NOT_FOUND' | 'INVALID_INPUT' | 'UNSUPPORTED_FILE' | 'CORRUPT_FILE' | 'PASSWORD_REQUIRED' | 'WRONG_PASSWORD' | 'ACCESS_DENIED' | 'FILE_MISSING' | 'QUOTA_EXCEEDED' | 'CONFLICT' | 'CANCELLED' | 'NETWORK' | 'MODEL_UNAVAILABLE' | 'RATE_LIMITED' | 'SAVE_FAILED' | 'BUSY' | 'STALE_CONFIRMATION' | 'UNSUPPORTED_CONTENT';
export interface AppError { code: ErrorCode; message: string; recovery: readonly RecoveryAction[] }
export type Result<T> = { ok: true; value: T } | { ok: false; error: AppError };
export type LocalSaveState = 'unmodified' | 'editing' | 'saving' | 'saved' | 'failed';
export type SyncState = 'unconfigured' | 'pending' | 'syncing' | 'synced' | 'failed' | 'conflict';
export interface SaveStatus { local: LocalSaveState; sync: SyncState; error?: AppError }
export interface RecordStamp { id: Id; revision: Revision; createdAt: ISODate; updatedAt: ISODate; deletedAt?: ISODate }
export type Snapshot<T> = {
  /** Demo snapshots must always render a visible “演示，不会保存” label. */
  mode: 'demo' | 'live';
  data: T;
} & ({ state: 'loading' | 'ready' } | { state: 'partial' | 'failed'; error: AppError });
/** Stable immutable snapshot until a change; subscriptions do not invoke immediately. */
export interface Readable<T> {
  getSnapshot(): Snapshot<T>;
  subscribe(listener: () => void): () => void;
}
export interface ExportArtifact { filename: string; mimeType: string; text: string; warnings: readonly string[] }
export const success = <T>(value: T): Result<T> => ({ ok: true, value });
export const failure = <T = never>(code: ErrorCode, message: string, recovery: readonly RecoveryAction[] = []): Result<T> => ({ ok: false, error: { code, message, recovery } });
