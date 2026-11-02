import { Select } from '@/ui/components';
import { SettingGroup, SettingRow } from '../../SettingRow';
import type { FeatureId, FeatureRouteView, SettingsDraft } from '../../types';

/** The features that pick their own model here; translation picks its engine on the translation page. */
const features: { id: FeatureId; label: string; hint?: string; visionOnly?: boolean }[] = [
  { id: 'discuss', label: '提问' },
  { id: 'explain', label: '解释' },
  { id: 'overview', label: '概览' },
  { id: 'vision', label: '图像识别', hint: '公式、表格和框选图片的识别；只列出支持图片的模型', visionOnly: true },
];

const route = (draft: SettingsDraft, feature: FeatureId): FeatureRouteView =>
  draft.features.find((f) => f.feature === feature) ?? { feature, enabled: true, modelId: null, reasoning: { kind: 'default' }, activeProfileId: 'default' };

/** The default model, and the model each feature uses when it should differ from it. */
export function DefaultModels({ draft, onChange }: { draft: SettingsDraft; onChange: (draft: SettingsDraft) => void }) {
  const label = (id: string) => {
    const model = draft.models.find((m) => m.id === id);
    const service = draft.endpoints.find((e) => e.id === model?.endpointId)?.name;
    return model ? `${model.label || model.modelId}${service ? ` · ${service}` : ''}` : '';
  };
  const options = (visionOnly?: boolean) =>
    draft.models
      .filter((m) => !visionOnly || m.vision)
      .map((m) => ({ value: m.id, label: label(m.id), shortLabel: m.label || m.modelId, group: m.endpointId }));
  const setRoute = (feature: FeatureId, modelId: string | null) =>
    onChange({ ...draft, features: [...draft.features.filter((f) => f.feature !== feature), { ...route(draft, feature), modelId }] });

  return (
    <SettingGroup title="默认模型">
      <SettingRow label="默认模型" hint="下面未单独指定的功能都用它" tour="default-model">
        <Select
          label="默认模型"
          value={draft.defaultModelId ?? ''}
          options={[{ value: '', label: '自动选择' }, ...options()]}
          onChange={(id) => onChange({ ...draft, defaultModelId: id || null })}
        />
      </SettingRow>
      {features.map((feature) => (
        <SettingRow key={feature.id} label={feature.label} hint={feature.hint}>
          <Select
            label={`${feature.label}模型`}
            value={route(draft, feature.id).modelId ?? ''}
            options={[{ value: '', label: '跟随默认模型' }, ...options(feature.visionOnly)]}
            onChange={(id) => setRoute(feature.id, id || null)}
          />
        </SettingRow>
      ))}
    </SettingGroup>
  );
}
