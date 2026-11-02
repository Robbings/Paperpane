import { ModelSelect as Select } from "./models/ModelSelect";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Button,
  Dialog,
  EmptyState,
  IconButton,
  Select as FieldSelect,
  TextField,
  toast,
} from "@/ui/components";
import {
  presets,
  protocols,
  newModel,
  refreshModel,
  type CatalogModel,
} from "@/ai/model-catalog";
import {
  readCatalog,
  updateCatalog,
  fetchEndpointModels,
  testConfiguredModel,
  completeCapabilities,
} from "@/runtime/model-settings-actions";
import type { EndpointDraft, ModelConfigView, SettingsDraft } from "../types";
import { SettingGroup, SettingRow } from "../SettingRow";
import { ModelSummary } from "./models/ModelSummary";
import { DefaultModels } from "./models/DefaultModels";
import { AdvancedSection } from "./AdvancedSection";
import { SettingsHeader } from "../SettingsHeader";
import { ModelEditor } from "./models/ModelEditor";
import { ManualModelForm, emptyManual, manualModel, type ManualDraft } from "./models/ManualModelForm";
import { ProviderPicker } from "./models/ProviderPicker";
import { ProviderList } from "./models/ProviderList";
import { ProviderLogo } from "./models/ProviderLogo";
import { providerBrand } from "@/ai/model-providers";
import "./models/models.css";
import "./models/model-detail.css";

const capacity = (n?: number) => (n ? `${Math.round(n / 1000)}K` : "待确认");
export function ModelsSection({
  draft,
  onChange,
  renderSaveBar,
  editor,
  setEditor,
  problems,
}: {
  draft: SettingsDraft;
  onChange: (v: SettingsDraft) => void;
  renderSaveBar: (layout: "floating" | "inline") => ReactNode;
  editor: ModelConfigView | null;
  setEditor: (model: ModelConfigView | null) => void;
  problems: ReadonlyMap<string, string>;
}) {
  const [active, setActive] = useState<string | null>(null),
    [search, setSearch] = useState(""),
    [adding, setAdding] = useState(false);
  const [modelQuery, setModelQuery] = useState(""),
    [capability, setCapability] = useState("all");
  const [picker, setPicker] = useState(false),
    [source, setSource] = useState("catalog"),
    [brand, setBrand] = useState("openai"),
    [query, setQuery] = useState("");
  const [catalog, setCatalog] = useState(readCatalog),
    [discovered, setDiscovered] = useState<CatalogModel[]>([]),
    [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  // Results go to toasts like everywhere else; an empty string is "nothing to say".
  const setMessage = (text: string) => {
    if (text) toast.show({ tone: "success", message: text, duration: 2600 });
  };
  const setError = (text: string) => {
    if (text) toast.show({ tone: "error", message: text });
  };
  const [testId, setTestId] = useState<string | null>(null),
    [mode, setMode] = useState<"text" | "image" | "structured">("text");
  const [manual, setManual] = useState<ManualDraft>(emptyManual),
    [manualAdded, setManualAdded] = useState<string[]>([]),
    [showKey, setShowKey] = useState(false);
  const [removing, setRemoving] = useState<{
    endpoint?: string;
    model?: string;
  } | null>(null);
  const operation = useRef<AbortController | null>(null),
    endpoint = draft.endpoints.find((e) => e.id === active),
    models = draft.models.filter((m) => m.endpointId === active);
  const signature = JSON.stringify([active, draft.endpoints, draft.models]);
  useEffect(() => {
    operation.current?.abort();
    setBusy(false);
    setMessage("");
    setError("");
    return () => operation.current?.abort();
  }, [signature]);
  useEffect(() => {
    setDiscovered([]);
    setPicker(false);
    setEditor(null);
    setShowKey(false);
  }, [
    active,
    endpoint?.baseUrl,
    endpoint?.protocol,
    JSON.stringify(endpoint?.key),
  ]);
  const patch = (v: Partial<EndpointDraft>) =>
    onChange({
      ...draft,
      endpoints: draft.endpoints.map((e) =>
        e.id === active ? { ...e, ...v } : e,
      ),
    });
  function cancel() {
    operation.current?.abort();
    setBusy(false);
  }
  async function run<T>(
    job: (s: AbortSignal) => Promise<T>,
    done: (v: T) => void,
  ) {
    cancel();
    const c = new AbortController();
    operation.current = c;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const v = await job(c.signal);
      if (!c.signal.aborted) done(v);
    } catch (e) {
      if (!c.signal.aborted)
        setError(e instanceof Error ? e.message : "操作失败");
    } finally {
      if (operation.current === c) setBusy(false);
    }
  }
  function addEndpoint(p: (typeof presets)[number]) {
    const id = crypto.randomUUID();
    onChange({
      ...draft,
      endpoints: [
        ...draft.endpoints,
        {
          id,
          name: p.name,
          presetId: p.id,
          protocol: p.protocol,
          baseUrl: p.url,
          hadKey: false,
          key: { kind: "keep" },
        },
      ],
    });
    setAdding(false);
    setActive(id);
  }
  function copyEndpoint() {
    if (!endpoint) return;
    const id = crypto.randomUUID();
    onChange({
      ...draft,
      endpoints: [
        ...draft.endpoints,
        {
          ...endpoint,
          id,
          name: endpoint.name + " · 副本",
          hadKey: false,
          key: { kind: "clear" },
        },
      ],
      models: [
        ...draft.models,
        ...models.map((m) => ({
          ...m,
          id: crypto.randomUUID(),
          endpointId: id,
        })),
      ],
    });
    setActive(id);
  }
  function refreshCatalog() {
    void run(updateCatalog, (v) => {
      setCatalog(v);
      onChange({
        ...draft,
        models: draft.models.map((m) => {
          const item = v.models.find(
            (x) =>
              x.provider === m.catalogRef?.provider &&
              x.modelId === m.catalogRef?.modelId &&
              x.protocol ===
                (m.protocolOverride ??
                  draft.endpoints.find((e) => e.id === m.endpointId)?.protocol),
          );
          return item ? refreshModel(m, item, v.updatedAt) : m;
        }),
      });
      setMessage("目录已更新");
    });
  }
  function openPicker() {
    setCapability("all");
    setSource("catalog");
    setBrand(
      presets.find((p) => p.id === endpoint?.presetId)?.provider || "openai",
    );
    setQuery("");
    setChosen([]);
    setManual(emptyManual);
    setManualAdded([]);
    setPicker(true);
  }
  const identity = (m: CatalogModel) =>
    `${m.provider}|${m.modelId}|${m.protocol ?? endpoint?.protocol}`;
  const already = (m: CatalogModel) =>
    models.some(
      (x) =>
        x.modelId === m.modelId &&
        (x.protocolOverride ?? endpoint?.protocol) ===
          (m.protocol ?? endpoint?.protocol),
    );
  /** Adds models after looking up what they can do (catalog, then the web, then defaults to check). */
  function addItems(items: CatalogModel[], keepOpen = false, onAdded?: () => void) {
    if (!endpoint) return;
    const fresh = items.filter((m) => !already(m));
    void run(
      (signal) => completeCapabilities(fresh, catalog, signal),
      (completed) => {
        const added = completed.map((m) => newModel(endpoint.id, m, catalog.updatedAt));
        onChange({
          ...draft,
          models: [...draft.models, ...added],
          defaultModelId: draft.defaultModelId ?? added[0]?.id ?? null,
        });
        if (keepOpen) onAdded?.();
        else setPicker(false);
        const guessed = added.filter((m) => m.capabilitiesGuessed).length;
        if (guessed) toast.show({ tone: 'warning', message: `${guessed} 个模型没查到资料，已用默认能力，请在详情里核对。` });
      },
    );
  }
  function remove() {
    if (!removing) return;
    const ids = removing.endpoint
      ? draft.models
          .filter((m) => m.endpointId === removing.endpoint)
          .map((m) => m.id)
      : [removing.model!];
    onChange({
      ...draft,
      endpoints: draft.endpoints.filter((e) => e.id !== removing.endpoint),
      models: draft.models.filter((m) => !ids.includes(m.id)),
      defaultModelId: ids.includes(draft.defaultModelId ?? "")
        ? null
        : draft.defaultModelId,
      features: draft.features.map((f) =>
        ids.includes(f.modelId ?? "") ? { ...f, modelId: null } : f,
      ),
      selectionTranslationEngine:
        draft.selectionTranslationEngine?.kind === "llm" &&
        ids.includes(draft.selectionTranslationEngine.modelId ?? "")
          ? { kind: "llm", modelId: null }
          : draft.selectionTranslationEngine,
    });
    if (removing.endpoint) setActive(null);
    setRemoving(null);
  }
  const rawItems =
    source === "endpoint"
      ? discovered
      : catalog.models.filter(
          (m) =>
            m.provider === brand &&
            !["deprecated", "retired"].includes(m.status ?? ""),
        );
  const items = rawItems.filter(
    (m) =>
      (m.label + " " + m.modelId).toLowerCase().includes(query.toLowerCase()) &&
      (capability === "all" ||
        (capability === "vision" && m.vision === true) ||
        (capability === "reasoning" &&
          !["none", "unknown"].includes(m.reasoning.kind))),
  );
  const notice = (
    <div className="pp-model-notice" aria-live="polite">
      {busy && (
        <p>
          正在处理…{" "}
          <Button
            size="sm"
            variant="quiet"
            onClick={cancel}
          >
            取消
          </Button>
        </p>
      )}
    </div>
  );
  return (
    <div className={`pp-model-settings${endpoint ? " pp-model-detail" : ""}`}>
      {!endpoint ? (
        <>
          <SettingsHeader title="模型" saveBar={renderSaveBar("inline")} />
          <DefaultModels draft={draft} onChange={onChange} />
          <SettingGroup
            title="模型服务"
            actions={
              <Button size="sm" variant="quiet" icon="plus" onClick={() => setAdding(true)}>
                添加供应商
              </Button>
            }
          >
            {draft.endpoints.length > 4 && (
              <div className="pp-provider-toolbar">
                <TextField icon="search" clearable label="搜索供应商" hideLabel placeholder="搜索名称或地址" value={search} onChange={setSearch} />
              </div>
            )}
          <ProviderList
            endpoints={draft.endpoints}
            models={draft.models}
            defaultModelId={draft.defaultModelId}
            query={search}
            onSelect={setActive}
          />
          {!draft.endpoints.length && (
            <div className="pp-model-empty pp-provider-empty">
              <div className="pp-provider-empty__logos">
                {["openai", "anthropic", "google", "deepseek"].map((brand) => (
                  <ProviderLogo key={brand} brand={brand} size="lg" />
                ))}
              </div>
              <h3>尚未添加供应商</h3>
              <Button
                variant="quiet"
                icon="plus"
                onClick={() => setAdding(true)}
              >
                添加第一个模型服务
              </Button>
            </div>
          )}
          </SettingGroup>
          <AdvancedSection runtime={draft.runtime} onChange={(runtime) => onChange({ ...draft, runtime })} problems={problems} />
        </>
      ) : (
        <>
          <SettingsHeader
            title={endpoint.name || "未命名服务"}
            leading={
              <>
                <IconButton icon="chevronLeft" label="返回模型服务" size="md" onClick={() => setActive(null)} />
                <ProviderLogo brand={providerBrand(endpoint.presetId)?.id} size="sm" />
              </>
            }
            actions={
              <>
                <IconButton icon="copy" label="复制配置" size="md" onClick={copyEndpoint} />
                <IconButton
                  icon="trash"
                  label="移除此供应商"
                  size="md"
                  className="pp-model-remove"
                  onClick={() => setRemoving({ endpoint: endpoint.id })}
                />
              </>
            }
            saveBar={renderSaveBar("inline")}
          />
          <div className="pp-model-detail-content">
            <SettingGroup title="连接">
              <SettingRow
                label="服务名称"
                hint="用于区分不同供应商、账户或端点，不影响模型请求。"
              >
                <TextField
                  label="服务名称"
                  hideLabel
                  value={endpoint.name}
                  onChange={(name) => patch({ name })}
                />
              </SettingRow>
              <SettingRow
                label="API 格式"
                hint="选择服务商支持的接口格式。Anthropic、Gemini 原生格式支持讨论、解释和概览；翻译仍需 OpenAI 兼容格式。"
              >
                <FieldSelect
                  label="API 格式"
                  value={endpoint.protocol}
                  options={protocols}
                  onChange={(protocol) => patch({ protocol })}
                  block
                />
              </SettingRow>
              <SettingRow
                label="API 地址"
                hint={`填写基础地址，请求会追加 ${endpoint.protocol === "anthropic" ? "/messages" : endpoint.protocol === "gemini" ? "/models/模型ID:streamGenerateContent" : endpoint.protocol === "openai-responses" ? "/responses" : "/chat/completions"}。修改地址后需重新填写密钥。`}
              >
                <TextField
                  label="API 基础地址"
                  hideLabel
                  value={endpoint.baseUrl}
                  onChange={(baseUrl) => patch({ baseUrl })}
                  placeholder="https://api.example.com/v1"
                />
              </SettingRow>
              <SettingRow
                label="API 密钥"
                hint="密钥仅保存在本机，不回填已保存的值。留空保留原密钥；清除后需保存生效。"
              >
                <div className="pp-model-detail-key">
                  <TextField
                    label="API 密钥"
                    hideLabel
                    type={showKey ? "text" : "password"}
                    autoComplete="new-password"
                    value={
                      endpoint.key.kind === "replace" ? endpoint.key.value : ""
                    }
                    placeholder={
                      endpoint.key.kind === "clear"
                        ? "保存后清除密钥"
                        : endpoint.hadKey && endpoint.key.kind === "keep"
                          ? "已设置，留空保持原密钥"
                          : "填写 API Key"
                    }
                    onChange={(value) =>
                      patch({
                        key: value
                          ? { kind: "replace", value }
                          : { kind: "keep" },
                      })
                    }
                  />
                  <IconButton
                    icon="lock"
                    label={showKey ? "隐藏新密钥" : "显示新密钥"}
                    size="md"
                    active={showKey}
                    onClick={() => setShowKey(!showKey)}
                  />
                  <IconButton
                    icon="close"
                    label="清除密钥"
                    size="md"
                    onClick={() => patch({ key: { kind: "clear" } })}
                  />
                </div>
              </SettingRow>
            </SettingGroup>
            <SettingGroup
              title="模型"
              hint="能力来自公开目录，仅供参考；可用右侧的测试确认"
              actions={
                <div className="pp-model-actions">
                  <span className="pp-model-detail-count">{models.length}</span>
                  <IconButton
                    icon="plus"
                    label="添加模型"
                    size="md"
                    onClick={openPicker}
                  />
                </div>
              }
            >
              {!!models.length && (
                <div className="pp-model-detail-search">
                  <TextField
                    label="搜索已添加模型"
                    hideLabel
                    icon="search"
                    clearable
                    placeholder="搜索模型"
                    value={modelQuery}
                    onChange={setModelQuery}
                  />
                </div>
              )}
              <div className="pp-model-list">
                {models
                  .filter((m) =>
                    (m.label + " " + m.modelId)
                      .toLowerCase()
                      .includes(modelQuery.toLowerCase()),
                  )
                  .map((m) => (
                    <div className="pp-model-row" key={m.id}>
                      <div className="pp-model-grow">
                        <strong>{m.label || m.modelId}</strong>
                        {m.label !== m.modelId && <small>{m.modelId}</small>}
                      </div>
                      <ModelSummary model={m} protocol={endpoint.protocol} />
                      <div className="pp-model-actions">
                        <IconButton
                          icon="edit"
                          label="编辑"
                          size="md"
                          onClick={() => setEditor(structuredClone(m))}
                        />
                        <IconButton
                          icon="send"
                          label="测试"
                          size="md"
                          onClick={() => {
                            setTestId(m.id);
                            setMode("text");
                          }}
                        />
                        <IconButton
                          icon="trash"
                          label="移除"
                          size="md"
                          className="pp-model-remove"
                          onClick={() => setRemoving({ model: m.id })}
                        />
                      </div>
                    </div>
                  ))}
              </div>
              {!models.length && (
                <EmptyState icon="model" title="尚未添加模型" />
              )}
              {!!models.length &&
                !models.some((m) =>
                  (m.label + " " + m.modelId)
                    .toLowerCase()
                    .includes(modelQuery.toLowerCase()),
                ) && <EmptyState icon="search" title="没有匹配的模型" />}
            </SettingGroup>
          </div>
        </>
      )}
      {!picker && !testId && notice}
      {adding && (
        <ProviderPicker
          onClose={() => setAdding(false)}
          onSelect={addEndpoint}
        />
      )}
      <Dialog
        open={picker && !!endpoint}
        onClose={() => {
          cancel();
          setPicker(false);
        }}
        title={`添加模型 · ${endpoint?.name ?? ""}`}
        size="lg"
        footer={
          <>
            <Button
              variant="quiet"
              onClick={() => {
                cancel();
                setPicker(false);
              }}
            >
              取消
            </Button>
            {source === "manual" ? (
              <Button
                variant="primary"
                disabled={busy || !manual.modelId.trim()}
                onClick={() => {
                  const id = manual.modelId.trim();
                  if (models.some((m) => m.modelId === id)) {
                    setError("这个模型已经添加过了");
                    return;
                  }
                  // Stays open for the next one; what was added is listed under the form.
                  addItems([manualModel(manual)], true, () => {
                    setManualAdded((list) => [...list, manual.label.trim() || id]);
                    setManual(emptyManual);
                    setMessage(`已添加 ${manual.label.trim() || id}`);
                  });
                }}
              >
                添加
              </Button>
            ) : (
              <Button
                disabled={!chosen.length}
                onClick={() =>
                  addItems(rawItems.filter((m) => chosen.includes(identity(m))))
                }
              >
                添加 {chosen.length} 个模型
              </Button>
            )}
          </>
        }
      >
        <div className="pp-model-tabs" role="tablist" aria-label="模型来源">
          {[
            ["catalog", "常用模型"],
            ["endpoint", "此端点模型"],
            ["manual", "手动添加"],
          ].map(([id, label]) => (
            <button
              role="tab"
              aria-selected={source === id}
              key={id}
              onClick={() => {
                setSource(id!);
                setChosen([]);
                setQuery("");
                setError("");
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {source === "manual" ? (
          <ManualModelForm value={manual} onChange={setManual} added={manualAdded} />
        ) : (
          <>
            <div className="pp-model-picker-tools">
              <Select
                label="能力筛选"
                value={capability}
                options={[
                  { value: "all", label: "全部模型" },
                  { value: "vision", label: "支持图片" },
                  { value: "reasoning", label: "支持思考" },
                ]}
                onChange={setCapability}
              />
              {source === "catalog" ? (
                <>
                <Select
                  label="模型厂商"
                  value={brand}
                  options={[
                    ...new Map(
                      presets
                        .filter((p) => p.provider)
                        .map((p) => [
                          p.provider,
                          {
                            value: p.provider,
                            label:
                              p.provider === "alibaba"
                                ? "Qwen / Alibaba"
                                : p.name,
                          },
                        ]),
                    ).values(),
                  ]}
                  onChange={(v) => {
                    setBrand(v);
                    setChosen([]);
                  }}
                />
                <IconButton
                  icon="sync"
                  label={`更新目录 · ${catalog.updatedAt.slice(0, 10)}`}
                  size="md"
                  disabled={busy}
                  className={busy ? "pp-model-refreshing" : undefined}
                  onClick={refreshCatalog}
                />
                </>
              ) : (
                <Button
                  disabled={busy}
                  onClick={() =>
                    endpoint &&
                    run(
                      (s) => fetchEndpointModels(endpoint, catalog, s),
                      (v) => {
                        setDiscovered(v);
                        setMessage(`找到 ${v.length} 个模型`);
                      },
                    )
                  }
                >
                  获取模型列表
                </Button>
              )}
              <TextField
                label="搜索模型"
                hideLabel
                value={query}
                onChange={setQuery}
                placeholder="搜索名称或 ID"
              />
            </div>
            <div className="pp-model-candidates">
              {items.map((m) => (
                <label key={identity(m)} className="pp-model-candidate">
                  <input
                    type="checkbox"
                    disabled={already(m)}
                    checked={already(m) || chosen.includes(identity(m))}
                    onChange={(e) =>
                      setChosen(
                        e.target.checked
                          ? [...chosen, identity(m)]
                          : chosen.filter((x) => x !== identity(m)),
                      )
                    }
                  />
                  <span className="pp-model-grow">
                    <strong>{m.label}</strong>
                    <small>{m.modelId}</small>
                    <span className="pp-model-badges">
                      <span>
                        {protocols.find((p) => p.value === m.protocol)?.label ??
                          "跟随端点"}
                      </span>
                      <span>
                        {capacity(m.contextWindow ?? m.inputLimit)} 上下文
                      </span>
                      {m.vision && <span>图片</span>}
                    </span>
                  </span>
                  <small>
                    {already(m) ? "已添加" : m.status === "beta" ? "预览" : ""}
                  </small>
                </label>
              ))}
            </div>
            {!items.length && (
              <p className="pp-model-caption">
                {source === "endpoint" && !discovered.length
                  ? "点击获取，或者从常用目录添加。"
                  : "没有匹配的模型，可尝试其他关键词或手动添加。"}
              </p>
            )}
          </>
        )}
        {picker && notice}
      </Dialog>
      {editor && (
        <ModelEditor
          model={editor}
          endpointProtocol={endpoint?.protocol ?? "openai-chat"}
          onClose={() => setEditor(null)}
          onSave={(m) => {
            onChange({
              ...draft,
              models: draft.models.map((x) => (x.id === m.id ? m : x)),
            });
            setEditor(null);
          }}
          suggestion={catalog.models.find(
            (m) =>
              m.provider === editor.catalogRef?.provider &&
              m.modelId === editor.catalogRef?.modelId,
          )}
          catalogDate={catalog.updatedAt}
        />
      )}
      <Dialog
        open={!!testId}
        onClose={() => {
          cancel();
          setTestId(null);
        }}
        title="测试模型"
        description="会发送一次测试请求，可能计费。"
        footer={
          <>
            <Button
              variant="quiet"
              onClick={() => {
                cancel();
                setTestId(null);
              }}
            >
              关闭
            </Button>
            <Button
              disabled={busy || !testId}
              onClick={() =>
                testId &&
                run(
                  (s) =>
                    testConfiguredModel(
                      structuredClone(draft),
                      testId,
                      mode,
                      s,
                    ),
                  (v) =>
                    setMessage(
                      `${mode === "text" ? "文本" : mode === "image" ? "图片" : "结构化输出"}测试通过 · ${Math.round(v.usage.elapsedMs)} ms · ${new Date(v.at).toLocaleTimeString()}`,
                    ),
                )
              }
            >
              发送测试请求
            </Button>
          </>
        }
      >
        <Select
          label="测试内容"
          value={mode}
          options={[
            { value: "text", label: "文字响应" },
            { value: "image", label: "图片识别（红色测试图）" },
            { value: "structured", label: "结构化输出" },
          ]}
          onChange={(v) => {
            cancel();
            setMode(v);
            setMessage("");
            setError("");
          }}
        />
        {testId && notice}
      </Dialog>
      <Dialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        title="移除模型配置"
        description="保存后生效；用到它的功能会改用默认模型。"
        footer={
          <>
            <Button variant="quiet" onClick={() => setRemoving(null)}>
              取消
            </Button>
            <Button onClick={remove}>确认移除</Button>
          </>
        }
      />
    </div>
  );
}
