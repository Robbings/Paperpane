import { Tooltip } from './Tooltip';
import './SaveStatus.css';

// Shared status vocabulary for local save and sync. These are UI-side
// names only; the shared types will come from src/contracts once agreed.
export type LocalSaveState = 'unmodified' | 'editing' | 'saving' | 'saved' | 'failed';
export type SyncState = 'unconfigured' | 'pending' | 'syncing' | 'synced' | 'failed' | 'conflict';

type Tone = 'neutral' | 'busy' | 'ok' | 'warn' | 'danger';

const localText: Record<LocalSaveState, { text: string; tone: Tone } | null> = {
  unmodified: null,
  editing: { text: '编辑中', tone: 'neutral' },
  saving: { text: '保存中', tone: 'busy' },
  saved: { text: '已保存到本机', tone: 'ok' },
  failed: { text: '保存失败', tone: 'danger' },
};

const syncText: Record<SyncState, { text: string; tone: Tone }> = {
  unconfigured: { text: '未配置同步', tone: 'warn' },
  pending: { text: '待同步', tone: 'neutral' },
  syncing: { text: '同步中', tone: 'busy' },
  synced: { text: '已同步', tone: 'ok' },
  failed: { text: '同步失败', tone: 'danger' },
  conflict: { text: '有冲突', tone: 'danger' },
};

interface SaveStatusProps {
  local: LocalSaveState;
  sync: SyncState;
  /** Sample data that is never stored: says so instead of claiming a save. */
  simulated?: boolean;
  className?: string;
}

const simulatedPart = { text: '演示内容，不会保存', tone: 'warn' as Tone };

/** Local save and remote sync are always shown separately; unsynced work is never called backed up. */
export function SaveStatus({ local, sync, simulated, className }: SaveStatusProps) {
  const parts = simulated ? [simulatedPart] : [localText[local], syncText[sync]].filter((part) => part !== null);
  const status = (
    <span role="status" aria-live="polite" className={className ? `pp-status ${className}` : 'pp-status'} tabIndex={simulated ? 0 : undefined}>
      {parts.map((part, index) => (
        <span key={part.text} className="pp-status__part">
          {index > 0 && (
            <span className="pp-status__sep" aria-hidden="true">
              ·
            </span>
          )}
          <span className="pp-status__dot" data-tone={part.tone} aria-hidden="true" />
          {part.text}
        </span>
      ))}
    </span>
  );
  return simulated ? <Tooltip label="这是示例数据，只存在于当前页面，刷新后会丢失。" placement="top">{status}</Tooltip> : status;
}
