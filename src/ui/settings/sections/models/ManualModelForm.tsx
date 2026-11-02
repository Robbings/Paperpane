import { TextField } from "@/ui/components";
import type { CatalogModel } from "@/ai/model-catalog";
import type { ReasoningCapability } from "../../types";
import { ModelSelect as Select } from "./ModelSelect";

export interface ManualDraft {
  modelId: string;
  label: string;
  /** "detect": look it up when the model is added. */
  vision: "detect" | "yes" | "no";
  reasoning: "detect" | ReasoningCapability["kind"];
  contextWindow: string;
  maxOutputTokens: string;
}

export const emptyManual: ManualDraft = { modelId: "", label: "", vision: "detect", reasoning: "detect", contextWindow: "", maxOutputTokens: "" };

const count = (s: string) => {
  const n = Number(s.replace(/[,\s_]/g, ""));
  return s.trim() && Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
};

/** The draft as a catalog entry; "自动识别" leaves a fact unknown so the lookup fills it. */
export function manualModel(draft: ManualDraft): CatalogModel {
  const kind = draft.reasoning === "detect" ? "unknown" : draft.reasoning;
  const reasoning: ReasoningCapability =
    kind === "effort"
      ? { kind, values: ["low", "medium", "high"] }
      : kind === "budget"
        ? { kind, minTokens: 1024, maxTokens: 16000, presets: [1024, 4096, 8192] }
        : { kind };
  return {
    provider: "",
    modelId: draft.modelId.trim(),
    label: draft.label.trim() || draft.modelId.trim(),
    vision: draft.vision === "detect" ? undefined : draft.vision === "yes",
    reasoning,
    contextWindow: count(draft.contextWindow),
    maxOutputTokens: count(draft.maxOutputTokens),
  };
}

/** A model the endpoint serves but no list shows: its id, and any facts the reader already knows. */
export function ManualModelForm({ value, onChange, added }: { value: ManualDraft; onChange: (value: ManualDraft) => void; added: readonly string[] }) {
  const set = (patch: Partial<ManualDraft>) => onChange({ ...value, ...patch });
  return (
    <div className="pp-model-manual">
      <div className="pp-model-manual__grid">
        <TextField label="请求模型 ID" value={value.modelId} placeholder="例如 gpt-4o-mini" onChange={(modelId) => set({ modelId })} />
        <TextField label="显示名称" value={value.label} placeholder="默认与 ID 相同" onChange={(label) => set({ label })} />
        <Select
          label="图片输入"
          value={value.vision}
          options={[
            { value: "detect", label: "自动识别" },
            { value: "yes", label: "支持" },
            { value: "no", label: "不支持" },
          ]}
          onChange={(vision) => set({ vision: vision as ManualDraft["vision"] })}
        />
        <Select
          label="思考方式"
          value={value.reasoning}
          options={[
            { value: "detect", label: "自动识别" },
            { value: "none", label: "不支持控制" },
            { value: "auto", label: "模型自动" },
            { value: "toggle", label: "开关" },
            { value: "effort", label: "档位" },
            { value: "budget", label: "Token 预算" },
          ]}
          onChange={(reasoning) => set({ reasoning: reasoning as ManualDraft["reasoning"] })}
        />
        <TextField label="上下文容量（tokens）" inputMode="numeric" value={value.contextWindow} placeholder="自动识别" onChange={(contextWindow) => set({ contextWindow })} />
        <TextField label="最大输出（tokens）" inputMode="numeric" value={value.maxOutputTokens} placeholder="自动识别" onChange={(maxOutputTokens) => set({ maxOutputTokens })} />
      </div>
      {added.length > 0 && (
        <p className="pp-model-manual__added">
          本次已添加：{added.join("、")}
        </p>
      )}
    </div>
  );
}
