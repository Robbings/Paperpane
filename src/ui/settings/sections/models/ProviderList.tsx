import { Icon, Tooltip } from "@/ui/components";
import { providerBrand, protocols } from "@/ai/model-providers";
import type { EndpointDraft, ModelConfigView } from "../../types";
import { ProviderLogo } from "./ProviderLogo";

export function ProviderList({
  endpoints,
  models,
  defaultModelId,
  query,
  onSelect,
}: {
  endpoints: readonly EndpointDraft[];
  models: readonly ModelConfigView[];
  defaultModelId: string | null;
  query: string;
  onSelect: (id: string) => void;
}) {
  const filtered = endpoints.filter((e) => {
    const brand = providerBrand(e.presetId);
    return `${e.name} ${e.baseUrl} ${brand?.name ?? ""} ${brand?.keywords ?? ""}`
      .toLowerCase()
      .includes(query.trim().toLowerCase());
  });
  return (
    <div className="pp-provider-list">
      {filtered.map((e) => {
        const brand = providerBrand(e.presetId);
        const items = models.filter((m) => m.endpointId === e.id);
        const isDefault = items.some((m) => m.id === defaultModelId);
        const hasKey =
          (e.key.kind === "replace" && !!e.key.value.trim()) ||
          (e.hadKey && e.key.kind === "keep");
        return (
          <button
            key={e.id}
            className="pp-provider-card"
            onClick={() => onSelect(e.id)}
          >
            <div className="pp-provider-card__main">
              <ProviderLogo brand={brand?.id} size="lg" />
              <span className="pp-model-grow">
                <span className="pp-provider-card__title">
                  <strong>{e.name || "未命名服务"}</strong>
                  {isDefault && (
                    <span className="pp-provider-default-tag">默认服务</span>
                  )}
                </span>
                <small className="pp-provider-address">
                  {e.baseUrl || "尚未填写 API 地址"}
                </small>
              </span>
              <Tooltip
                label={
                  hasKey ? "已填写密钥；连通性需通过测试确认" : "未填写密钥"
                }
              >
                <span
                  className="pp-provider-key-state"
                  data-ready={hasKey}
                  aria-label={hasKey ? "已填写密钥" : "未填写密钥"}
                >
                  <Icon name={hasKey ? "lock" : "sliders"} size={13} />
                </span>
              </Tooltip>
              <span className="pp-provider-card__arrow">
                <Icon name="chevronRight" size={18} />
              </span>
            </div>
            <div className="pp-provider-card__footer">
              <Tooltip
                label={`API 格式：${protocols.find((p) => p.value === e.protocol)?.label}`}
              >
                <span className="pp-provider-protocol">
                  <Icon name="link" size={13} />
                </span>
              </Tooltip>
              <span className="pp-provider-model-summary">
                <Icon name="model" size={14} />
                <b>{items.length} 个模型</b>
                <span>
                  {items.length
                    ? items
                        .slice(0, 2)
                        .map((m) => m.label || m.modelId)
                        .join(" · ") + (items.length > 2 ? ` 等` : "")
                    : ""}
                </span>
              </span>
            </div>
          </button>
        );
      })}
      {!!endpoints.length && !filtered.length && (
        <div className="pp-model-empty">
          <Icon name="search" size={24} />
          <h3>没有匹配的服务</h3>
          <p>试试其他名称或 API 地址。</p>
        </div>
      )}
    </div>
  );
}
