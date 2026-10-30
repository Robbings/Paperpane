import { useState } from "react";
import { Button, Dialog, Icon, TextField } from "@/ui/components";
import {
  presets,
  providerBrands,
  type ProviderPreset,
} from "@/ai/model-providers";
import { ProviderLogo } from "./ProviderLogo";

const groups = [
  { id: "popular", name: "常用厂商" },
  { id: "more", name: "更多模型厂商" },
  { id: "platform", name: "聚合与推理服务" },
];
export function ProviderPicker({
  onClose,
  onSelect,
}: {
  onClose: () => void;
  onSelect: (p: ProviderPreset) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [variant, setVariant] = useState<string | null>(null);
  const selected = providerBrands.find((b) => b.id === variant);
  const matches = providerBrands.filter(
    (b) =>
      (filter === "all" ||
        (filter === "platform"
          ? b.group === "platform"
          : b.group !== "platform")) &&
      `${b.name} ${b.website} ${b.keywords}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const custom = presets.find((p) => p.id === "custom")!;
  return (
    <div className="pp-provider-picker">
      <Dialog
        open
        onClose={onClose}
        title={selected ? `连接 ${selected.name}` : "添加供应商"}
        description={
          selected
            ? "选择与你的 API 密钥对应的服务区域。"
            : "选择一个熟悉的服务，开始配置你的阅读模型。"
        }
        size="lg"
        footer={
          !selected && (
            <button
              className="pp-provider-custom"
              onClick={() => onSelect(custom)}
            >
              <ProviderLogo size="sm" />
              <span>
                <strong>自定义兼容服务</strong>
                <small>使用自己的 API 地址或本地模型</small>
              </span>
              <Icon name="plus" size={18} />
            </button>
          )
        }
      >
        {selected ? (
          <>
            <Button
              variant="quiet"
              size="sm"
              icon="chevronLeft"
              onClick={() => setVariant(null)}
            >
              返回全部厂商
            </Button>
            <div className="pp-provider-variant-heading">
              <ProviderLogo brand={selected.id} size="lg" />
              <div>
                <h3>{selected.name}</h3>
                <p>{selected.website}</p>
              </div>
            </div>
            <div className="pp-provider-variants">
              {presets
                .filter((p) => p.brand === selected.id)
                .map((p) => (
                  <button key={p.id} onClick={() => onSelect(p)}>
                    <span>
                      <strong>{p.region ?? p.name}</strong>
                      <small>{new URL(p.url).hostname}</small>
                    </span>
                    <Icon name="chevronRight" size={18} />
                  </button>
                ))}
            </div>
          </>
        ) : (
          <>
            <div className="pp-provider-picker-tools">
              <TextField
                label="查找模型厂商"
                hideLabel
                icon="search"
                clearable
                placeholder="搜索厂商、模型或平台名称…"
                value={query}
                onChange={setQuery}
              />
              <div className="pp-provider-filters" aria-label="供应商分类">
                {[
                  ["all", "全部"],
                  ["direct", "模型厂商"],
                  ["platform", "聚合服务"],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    aria-pressed={filter === id}
                    onClick={() => setFilter(id!)}
                  >
                    {label}
                  </button>
                ))}
                <span aria-live="polite">{matches.length} 家服务</span>
              </div>
            </div>
            <div className="pp-provider-sections">
              {groups.map((group) => {
                const brands = matches.filter((b) => b.group === group.id);
                if (!brands.length) return null;
                return (
                  <section key={group.id} aria-label={group.name}>
                    <h3>
                      {group.name}
                      <span>{brands.length}</span>
                    </h3>
                    <div className="pp-provider-presets">
                      {brands.map((b) => {
                        const choices = presets.filter((p) => p.brand === b.id);
                        return (
                          <button
                            key={b.id}
                            className="pp-provider-preset"
                            aria-label={`添加 ${b.name}`}
                            onClick={() =>
                              choices.length > 1
                                ? setVariant(b.id)
                                : onSelect(choices[0]!)
                            }
                          >
                            <ProviderLogo brand={b.id} />
                            <span className="pp-provider-preset__copy">
                              <strong>{b.name}</strong>
                              <small>{b.website}</small>
                              <span>
                                {choices.length > 1
                                  ? `${choices.length} 个区域可选`
                                  : b.description}
                              </span>
                            </span>
                            <Icon
                              name="chevronRight"
                              size={16}
                              className="pp-provider-preset__arrow"
                            />
                          </button>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
              {!matches.length && (
                <div className="pp-provider-search-empty">
                  <Icon name="search" size={28} />
                  <strong>没有找到相关厂商</strong>
                  <p>换个关键词，或通过下方的自定义服务连接。</p>
                  <Button
                    variant="quiet"
                    onClick={() => {
                      setQuery("");
                      setFilter("all");
                    }}
                  >
                    查看全部厂商
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </Dialog>
    </div>
  );
}
