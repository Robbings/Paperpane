import { ModelSelect as Select } from "./ModelSelect";
import { useState } from "react";
import { Button, Dialog, Switch, TextField } from "@/ui/components";
import {
  metadataFields,
  newModel,
  protocols,
  type CatalogModel,
} from "@/ai/model-catalog";
import { modelProblems, reasoningValues } from "@/ai/model-capabilities";
import type {
  ModelConfigView,
  Protocol,
  ReasoningCapability,
} from "../../types";
export function ModelEditor({
  model,
  endpointProtocol,
  onClose,
  onSave,
  suggestion,
  catalogDate,
}: {
  model: ModelConfigView;
  endpointProtocol: Protocol;
  onClose: () => void;
  onSave: (m: ModelConfigView) => void;
  suggestion?: CatalogModel;
  catalogDate: string;
}) {
  const [value, setValue] = useState(model),
    [error, setError] = useState("");
  const edit = (patch: Partial<ModelConfigView>) =>
    setValue((v) => ({
      ...v,
      ...patch,
      metadataSource: "manual",
      overrides: [
        ...new Set([...(v.overrides ?? metadataFields), ...Object.keys(patch)]),
      ],
    }));
  const numeric = (
    field: "contextWindow" | "inputLimit" | "maxOutputTokens",
    label: string,
  ) => (
    <TextField
      label={label}
      inputMode="numeric"
      value={value[field] === undefined ? "" : String(value[field])}
      placeholder="待确认"
      onChange={(s) => edit({ [field]: s.trim() ? Number(s) : undefined })}
    />
  );
  function kind(kind: ReasoningCapability["kind"]) {
    const reasoning: ReasoningCapability =
      kind === "effort"
        ? { kind, values: ["low", "medium", "high"] }
        : kind === "budget"
          ? {
              kind,
              minTokens: 1024,
              maxTokens: 16000,
              presets: [1024, 4096, 8192],
            }
          : { kind };
    edit({ reasoning, defaultReasoning: undefined });
  }
  return (
    <div className="pp-model-editor">
      <Dialog
        open
        onClose={onClose}
        title="模型详情"
        description={model.label || model.modelId}
        size="md"
        footer={
          <>
            <Button variant="quiet" onClick={onClose}>
              取消
            </Button>
            <Button
              onClick={() => {
                const errors = modelProblems(value);
                if (errors.length) {
                  setError(errors[0]!);
                  return;
                }
                onSave({
                  ...value,
                  modelId: value.modelId.trim(),
                  label: value.label.trim() || value.modelId.trim(),
                });
              }}
            >
              完成
            </Button>
          </>
        }
      >
        <div className="pp-model-editor-fields">
          <TextField
            label="显示名称"
            value={value.label}
            onChange={(label) => edit({ label })}
          />
          <TextField
            label="请求模型 ID"
            value={value.modelId}
            onChange={(modelId) => edit({ modelId, catalogRef: undefined })}
          />
          <Select
            label="图片输入"
            value={
              value.visionKnown === false
                ? "unknown"
                : value.vision
                  ? "yes"
                  : "no"
            }
            options={[
              { value: "unknown", label: "待确认" },
              { value: "yes", label: "支持" },
              { value: "no", label: "不支持" },
            ]}
            onChange={(v) =>
              edit({ vision: v === "yes", visionKnown: v !== "unknown" })
            }
          />
          <Select
            label="思考方式"
            value={value.reasoning.kind}
            options={[
              { value: "unknown", label: "待确认" },
              { value: "none", label: "不支持控制" },
              { value: "auto", label: "模型自动" },
              { value: "toggle", label: "开关" },
              { value: "effort", label: "档位" },
              { value: "budget", label: "Token 预算" },
            ]}
            onChange={kind}
          />
          {value.reasoning.kind === "effort" && (
            <TextField
              label="可用思考档位"
              value={value.reasoning.values.join(", ")}
              description="按服务商支持的值填写，用逗号分隔。"
              onChange={(v) =>
                edit({
                  reasoning: {
                    kind: "effort",
                    values: v
                      .split(",")
                      .map((x) => x.trim())
                      .filter(Boolean),
                  },
                  defaultReasoning: undefined,
                })
              }
            />
          )}
          {value.reasoning.kind === "budget" && (
            <>
              <TextField
                label="最小思考预算"
                inputMode="numeric"
                value={String(value.reasoning.minTokens)}
                onChange={(s) =>
                  value.reasoning.kind === "budget" &&
                  edit({
                    reasoning: { ...value.reasoning, minTokens: Number(s) },
                    defaultReasoning: undefined,
                  })
                }
              />
              <TextField
                label="最大思考预算"
                inputMode="numeric"
                value={String(value.reasoning.maxTokens)}
                onChange={(s) =>
                  value.reasoning.kind === "budget" &&
                  edit({
                    reasoning: { ...value.reasoning, maxTokens: Number(s) },
                    defaultReasoning: undefined,
                  })
                }
              />
              <TextField
                label="预算预设"
                value={value.reasoning.presets.join(", ")}
                onChange={(s) =>
                  value.reasoning.kind === "budget" &&
                  edit({
                    reasoning: {
                      ...value.reasoning,
                      presets: s.split(",").map(Number),
                    },
                    defaultReasoning: undefined,
                  })
                }
              />
            </>
          )}
          <Select
            label="默认思考设置"
            value={value.defaultReasoning ?? ""}
            options={[
              { value: "", label: "跟随模型" },
              ...reasoningValues(value).map((v) => ({
                value: v,
                label: v === "on" ? "开启" : v === "off" ? "关闭" : v,
              })),
            ]}
            onChange={(v) => edit({ defaultReasoning: v || undefined })}
          />
          {numeric("contextWindow", "上下文容量（tokens）")}
          {numeric("inputLimit", "输入上限（tokens）")}
          {numeric("maxOutputTokens", "最大输出（tokens）")}
          {!value.contextWindow && (
            <p className="pp-model-caption">
              容量未知时，暂按 8K
              预算组织内容，可能使用检索或分块。请按服务商资料确认。
            </p>
          )}
          <Switch
            label="在讨论模型选择器中显示"
            description="默认模型及已被会话使用的模型会继续显示，避免中断现有会话。"
            checked={value.showInDiscussion}
            onChange={(showInDiscussion) => edit({ showInDiscussion })}
          />
          <details>
            <summary>高级设置</summary>
            <Select
              label="此模型的 API 格式"
              value={value.protocolOverride ?? ""}
              options={[
                {
                  value: "",
                  label: `跟随端点 · ${protocols.find((p) => p.value === endpointProtocol)?.label}`,
                },
                ...protocols,
              ]}
              onChange={(v) =>
                edit({
                  protocolOverride: (v || undefined) as Protocol | undefined,
                  defaultReasoning: undefined,
                  reasoning: { kind: "unknown" },
                  catalogRef: undefined,
                })
              }
            />
          </details>
          <div className="pp-model-source">
            <small>
              能力来源：
              {value.metadataSource === "catalog"
                ? "models.dev 目录"
                : value.metadataSource === "endpoint"
                  ? "端点返回"
                  : "手动设置"}
              {value.catalogRef &&
                ` · ${value.catalogRef.updatedAt.slice(0, 10)}`}
            </small>
            {suggestion && value.catalogRef && (
              <Button
                size="sm"
                variant="quiet"
                onClick={() => {
                  const next = newModel(
                    value.endpointId,
                    suggestion,
                    catalogDate,
                  );
                  setValue({
                    ...value,
                    ...Object.fromEntries(
                      metadataFields.map((k) => [k, next[k]]),
                    ),
                    metadataSource: "catalog",
                    catalogRef: next.catalogRef,
                    overrides: (value.overrides ?? []).filter(
                      (k) => !(metadataFields as readonly string[]).includes(k),
                    ),
                    defaultReasoning: undefined,
                  });
                }}
              >
                恢复目录建议
              </Button>
            )}
            <p>手动修改优先于目录更新；“完成”更新页面草稿，保存后生效。</p>
          </div>
          {error && <p role="alert">{error}</p>}
        </div>
      </Dialog>
    </div>
  );
}
