import { modelConfigurationStatus } from '../ai/model-configuration.ts';
import type { SettingsView, StatusSummary } from '@/ui/settings/types';

function validSyncUrl(raw: string | undefined): boolean {
  try { const url=new URL(raw??'');return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password; }
  catch { return false; }
}

export function deriveSettingsStatus(settings: SettingsView, phase: 'loading' | 'ready' | 'failed'): StatusSummary {
  const base: StatusSummary = {
    local: phase === 'ready' ? 'saved' : 'unmodified', sync: 'unconfigured', lastSyncedAt: null,
    settingsState: phase, syncImplemented: false,
    syncConfigured: phase === 'ready' && settings.sync.enabled && validSyncUrl(settings.sync.webdavUrl),
    modelAvailability: phase === 'loading' ? 'checking' : 'unconfigured',
  };
  if (phase === 'loading') return { ...base, syncMessage: '正在读取同步状态…' };
  if (phase === 'failed') return { ...base, modelAvailability: 'unavailable', modelMessage: '模型配置读取失败', syncMessage: '同步配置读取失败' };
  if(settings.sync.enabled&&!base.syncConfigured)base.syncMessage='同步配置不完整，功能尚未接入';
  const model = modelConfigurationStatus(settings);
  return {
    ...base,
    modelAvailability: model.state,
    ...(model.state === 'configured' ? { modelLabel: model.label } : {}),
    ...(model.state === 'unavailable' ? { modelMessage: model.message } : {}),
  };
}
