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
  if (!settings.models.length) return base;
  const unavailable = (modelMessage: string): StatusSummary => ({ ...base, modelAvailability: 'unavailable', modelMessage });
  const route = settings.features.find(feature => feature.feature === 'translate' && feature.enabled);
  const selected = route?.modelId ?? settings.defaultModelId;
  if (!selected) return unavailable('请选择默认模型');
  const model = settings.models.find(item => item.id === selected);
  const endpoint = settings.endpoints.find(item => item.id === model?.endpointId);
  if (!model?.modelId.trim()) return unavailable('所选模型不存在或模型 ID 为空');
  if (!endpoint) return unavailable('模型关联的接口不存在');
  if (!['openai-chat', 'openai-responses'].includes(endpoint.protocol)) return unavailable('模型接口协议尚不支持');
  try {
    const url = new URL(endpoint.baseUrl);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) return unavailable('模型接口地址无效');
    if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return unavailable('远程模型接口需要 HTTPS');
  } catch { return unavailable('模型接口地址无效'); }
  return { ...base, modelAvailability: 'configured', modelLabel: model.label.trim() || model.modelId };
}
