import { providerBrand } from "./model-providers.ts";
import type { ModelConfigView, Protocol } from "../ui/settings/types";
export const UNKNOWN_CONTEXT = 8192;
export function contextLimit(m: ModelConfigView) {
  return Math.min(m.contextWindow ?? UNKNOWN_CONTEXT, m.inputLimit ?? Infinity);
}
/** Reserve enough room for any configured thinking budget; transport may use less. */
export function outputLimit(
  m: ModelConfigView,
  requested?: number | null,
  window = contextLimit(m),
) {
  const fallback =
    m.reasoning.kind === "budget"
      ? m.reasoning.maxTokens + 4096
      : Math.min(8192, Math.floor(window / 4));
  return Math.max(
    1,
    Math.min(
      requested ?? fallback,
      m.maxOutputTokens ?? Infinity,
      Math.floor(window / 2),
    ),
  );
}
export function reasoningValues(m: ModelConfigView): readonly string[] {
  return m.reasoning.kind === "effort"
    ? m.reasoning.values
    : m.reasoning.kind === "budget"
      ? m.reasoning.presets.map(String)
      : m.reasoning.kind === "toggle"
        ? ["off", "on"]
        : [];
}
export function modelProblems(m: ModelConfigView): string[] {
  const errors: string[] = [];
  for (const [name, value] of [
    ["上下文", m.contextWindow],
    ["输入上限", m.inputLimit],
    ["输出上限", m.maxOutputTokens],
  ] as const)
    if (
      value !== undefined &&
      (!Number.isInteger(value) || value < 1 || value > 10_000_000)
    )
      errors.push(`${name}须为 1–10000000 的整数。`);
  if (!m.modelId.trim()) errors.push("请填写请求模型 ID。");
  if (
    m.reasoning.kind === "effort" &&
    (!m.reasoning.values.length || m.reasoning.values.some((v) => !v.trim()))
  )
    errors.push("请填写可用思考档位。");
  if (m.reasoning.kind === "budget") {
    const r = m.reasoning;
    if (
      !Number.isInteger(r.minTokens) ||
      !Number.isInteger(r.maxTokens) ||
      r.minTokens < 0 ||
      r.maxTokens < r.minTokens ||
      r.maxTokens > 10_000_000 ||
      !r.presets.length ||
      r.presets.some(
        (v) => !Number.isInteger(v) || v < r.minTokens || v > r.maxTokens,
      )
    )
      errors.push("思考预算与预设必须在有效范围内。");
  }
  if (m.defaultReasoning && !reasoningValues(m).includes(m.defaultReasoning))
    errors.push("默认思考设置不在可用选项中。");
  return errors;
}
export function reasoningBody(
  protocol: Protocol,
  m: ModelConfigView,
  value?: string,
  presetId?: string,
): Record<string, unknown> {
  const effort = value ?? m.defaultReasoning;
  if (!effort) return {};
  const r = m.reasoning;
  if (r.kind === "effort" && !r.values.includes(effort))
    throw new Error("所选思考档位不受此模型支持。");
  if (
    r.kind === "budget" &&
    (!Number.isInteger(Number(effort)) ||
      Number(effort) < r.minTokens ||
      Number(effort) > r.maxTokens)
  )
    throw new Error("思考预算超出模型范围。");
  if (["none", "unknown", "auto"].includes(r.kind)) return {};
  if (r.kind === "toggle" && !["off", "on"].includes(effort))
    throw new Error("思考开关无效。");
  const brand = providerBrand(presetId)?.id;
  if (protocol === "openai-chat" && brand === "openrouter") {
    return {
      reasoning:
        r.kind === "budget"
          ? { max_tokens: Number(effort) }
          : r.kind === "toggle"
            ? { enabled: effort === "on" }
            : { effort },
    };
  }
  if (
    protocol === "openai-chat" &&
    ["deepseek", "moonshotai", "zhipuai", "volcengine"].includes(brand ?? "") &&
    r.kind === "toggle"
  ) {
    return { thinking: { type: effort === "on" ? "enabled" : "disabled" } };
  }
  if (
    protocol === "openai-chat" &&
    (brand === "alibaba" || brand === "siliconflow")
  ) {
    if (r.kind === "budget")
      return { enable_thinking: true, thinking_budget: Number(effort) };
    if (r.kind === "toggle") return { enable_thinking: effort === "on" };
  }
  if (
    (protocol === "openai-responses" || protocol === "openai-chat") &&
    r.kind === "budget"
  )
    throw new Error(
      "此 API 格式不支持数值思考预算，请选择服务商支持的档位或切换格式。",
    );
  if (
    (protocol === "openai-responses" || protocol === "openai-chat") &&
    r.kind === "toggle" &&
    effort === "on"
  )
    return {};
  if (protocol === "openai-responses")
    return { reasoning: { effort: effort === "off" ? "none" : effort } };
  if (protocol === "openai-chat")
    return { reasoning_effort: effort === "off" ? "none" : effort };
  if (protocol === "anthropic")
    return r.kind === "budget"
      ? {
          thinking: {
            type: Number(effort) > 0 ? "enabled" : "disabled",
            ...(Number(effort) > 0 ? { budget_tokens: Number(effort) } : {}),
          },
        }
      : r.kind === "toggle"
        ? { thinking: { type: effort === "on" ? "adaptive" : "disabled" } }
        : { thinking: { type: "adaptive" }, output_config: { effort } };
  return {
    thinkingConfig:
      r.kind === "budget"
        ? { thinkingBudget: Number(effort) }
        : r.kind === "toggle"
          ? { thinkingBudget: effort === "on" ? -1 : 0 }
          : { thinkingLevel: effort },
  };
}
