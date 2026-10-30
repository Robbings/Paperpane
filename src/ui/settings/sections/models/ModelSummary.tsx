import { Icon, Tooltip, type IconName } from "@/ui/components";
import type { ModelConfigView, Protocol } from "../../types";
import { protocols } from "@/ai/model-catalog";

/** Compact facts; full capability descriptions stay in the shared tooltip. */
export function ModelSummary({
  model,
  protocol,
}: {
  model: ModelConfigView;
  protocol: Protocol;
}) {
  const facts: { icon: IconName; label: string; quiet?: boolean }[] = [
    {
      icon: "image",
      label: `图片输入：${model.visionKnown === false ? "待确认" : model.vision ? "支持" : "不支持"}`,
      quiet: !model.vision,
    },
    {
      icon: "gauge",
      label: `思考设置：${model.reasoning.kind === "effort" ? model.reasoning.values.join(" / ") : model.reasoning.kind === "budget" ? "Token 预算" : model.reasoning.kind === "toggle" ? "开关" : model.reasoning.kind === "auto" ? "模型自动" : model.reasoning.kind === "none" ? "不支持控制" : "待确认"}`,
      quiet: ["none", "unknown"].includes(model.reasoning.kind),
    },
  ];
  if (model.protocolOverride && model.protocolOverride !== protocol)
    facts.push({
      icon: "link",
      label: `API 格式：${protocols.find((p) => p.value === model.protocolOverride)?.label}`,
    });
  if (!model.showInDiscussion)
    facts.push({ icon: "minus", label: "已在讨论模型选择器中隐藏" });
  return (
    <div className="pp-model-summary">
      <Tooltip
        label={`上下文容量：${model.contextWindow ? model.contextWindow.toLocaleString() + " tokens" : "待确认"}`}
      >
        <span tabIndex={0}>
          {model.contextWindow
            ? `${Math.round(model.contextWindow / 1000)}K`
            : "—"}
        </span>
      </Tooltip>
      {facts.map((f) => (
        <Tooltip key={f.icon} label={f.label}>
          <span tabIndex={0} aria-label={f.label} data-quiet={f.quiet}>
            <Icon name={f.icon} size={14} />
          </span>
        </Tooltip>
      ))}
    </div>
  );
}
