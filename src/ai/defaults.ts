import type { OverviewCardDef } from "@/ui/reader/overview/types";
export const defaultCards: OverviewCardDef[] = [
  {
    id: "gist",
    name: "概括",
    prompt: "用一两句话简短概括论文解决什么问题、怎么做、得出什么结论。中文不超过 120 字，英文不超过 60 词。直白简洁，不铺垫。",
    output: "markdown",
    display: "lead",
    builtIn: true,
    visible: true,
  },
  {
    id: "keywords",
    name: "关键词",
    prompt: "列出 4–6 个互不重复、便于文献分类的主题或方法术语。只写术语本身（中文不超过 6 个字，英文不超过 3 个词），优先通用规范术语。每项是纯文本字符串；禁止引用编号（如 [^s98]、[s98]）、脚注、Markdown、序号、句子、解释、标点后缀及同义词重复。",
    output: "list",
    listStyle: "tags",
    builtIn: true,
    visible: true,
  },
  {
    id: "summary",
    name: "结构化摘要",
    prompt: "每项一两句，直击要点，不复述背景、不写套话；论文没报告的写“未报告”，不要编造数字。",
    output: "fields",
    schema: JSON.stringify({
      type: "object",
      properties: {
        question: { type: "string", title: "研究问题" },
        method: { type: "string", title: "方法" },
        data: { type: "string", title: "数据" },
        results: { type: "string", title: "主要结果" },
        limits: { type: "string", title: "局限" },
      },
      required: ["question", "method", "data", "results", "limits"],
      additionalProperties: false,
    }),
    builtIn: true,
    visible: true,
  },
  {
    id: "points",
    name: "要点",
    prompt: "列出 3–5 条最重要的结论：标题不超过 10 个字，正文一句话。",
    output: "list",
    listStyle: "items",
    builtIn: true,
    visible: true,
  },
];

/** Earlier built-in prompts, upgraded in place when a paper still uses them unchanged. */
const legacyPrompts: Record<string, readonly string[]> = {
  gist: ["用一两句话说清论文解决什么问题、怎么做、得出什么结论。直白简洁，不铺垫。", "用一两句话说清论文做了什么、为什么重要。"],
  keywords: ["列出 4–6 个关键词，只写术语本身（中文不超过 6 个字，英文不超过 3 个词），不加解释。", "列出 5–8 个准确的主题或方法关键词。"],
  summary: ["概括研究问题、方法、数据、结果和局限，不要虚构未报告的数字。"],
  points: ["列出 3–5 条最值得记住的结论，每条带短标题。"],
};
/** The prompt to send for a card: built-in cards still on an old default get the current one. */
export function currentCardPrompt(card: Pick<OverviewCardDef, "id" | "prompt" | "builtIn">): string {
  if (!card.builtIn || !legacyPrompts[card.id]?.includes(card.prompt)) return card.prompt;
  return defaultCards.find((c) => c.id === card.id)?.prompt ?? card.prompt;
}
