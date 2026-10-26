import './StatusLine.css';
import type { SettingsSection, StatusSummary } from './types';

type Tone = 'ok' | 'neutral' | 'warn' | 'danger' | 'busy';

/** "刚刚", "5 分钟前", "3 小时前", "昨天", "3 天前", then the date. */
export function sinceText(iso: string, now = Date.now()): string {
  const minutes = Math.round((now - Date.parse(iso)) / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} 小时前`;
  const days = Math.round(minutes / (60 * 24));
  if (days < 7) return days === 1 ? '昨天' : `${days} 天前`;
  const date = new Date(iso);
  return date.getFullYear() === new Date(now).getFullYear() ? `${date.getMonth() + 1} 月 ${date.getDate()} 日` : iso.slice(0, 10);
}

function syncLine(status: StatusSummary): { text: string; tone: Tone } {
  const since = status.lastSyncedAt ? sinceText(status.lastSyncedAt) : null;
  switch (status.sync) {
    case 'unconfigured':
      return { text: '数据仅保存在本机', tone: 'warn' };
    case 'synced':
      return { text: since ? `已同步 · ${since}` : '已同步', tone: 'ok' };
    case 'syncing':
      return { text: '同步中…', tone: 'busy' };
    case 'pending':
      return { text: since ? `有改动待同步 · 上次 ${since}` : '有改动待同步', tone: 'neutral' };
    case 'failed':
      return { text: since ? `同步失败 · 上次成功 ${since}` : '同步失败', tone: 'danger' };
    case 'conflict':
      return { text: '同步有冲突，需要处理', tone: 'danger' };
  }
}

function modelLine(status: StatusSummary): { text: string; tone: Tone } {
  if (status.modelAvailability === 'unconfigured') return { text: '还没有配置模型', tone: 'warn' };
  if (status.modelAvailability === 'unavailable') return { text: '模型暂不可用', tone: 'danger' };
  return { text: '模型已配置', tone: 'ok' };
}

interface StatusLineProps {
  status: StatusSummary;
  /** Each line links to the section that fixes it. */
  onOpen?: (section: SettingsSection) => void;
  /** On one line instead of stacked. */
  inline?: boolean;
  className?: string;
}

/** Save, sync and model state in two short lines; shared by the settings page, quick settings and the popup. */
export function StatusLine({ status, onOpen, inline, className }: StatusLineProps) {
  const lines: { key: SettingsSection; text: string; tone: Tone }[] = [];
  if (status.local === 'failed') lines.push({ key: 'privacy', text: '有内容没能保存到本机', tone: 'danger' });
  lines.push({ key: 'sync', ...syncLine(status) }, { key: 'models', ...modelLine(status) });
  return (
    <ul className={className ? `pp-statusline ${className}` : 'pp-statusline'} data-inline={inline ? 'true' : undefined} aria-label="状态">
      {lines.map((line) => (
        <li key={line.key + line.text} data-tone={line.tone}>
          <span className="pp-statusline__dot" aria-hidden="true" />
          {onOpen ? (
            <button type="button" onClick={() => onOpen(line.key)}>
              {line.text}
            </button>
          ) : (
            <span>{line.text}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
