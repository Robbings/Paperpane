import test from "node:test";
import assert from "node:assert/strict";
import {
  bundledCatalog,
  newModel,
  parseCatalog,
  refreshModel,
} from "../src/ai/model-catalog.ts";
import {
  contextLimit,
  outputLimit,
  modelProblems,
  reasoningBody,
} from "../src/ai/model-capabilities.ts";
import { discoverModels } from "../src/ai/model-discovery.ts";
import {
  presets,
  providerBrands,
  catalogProviders,
  chatRequestOptions,
} from "../src/ai/model-providers.ts";
const signal = () => new AbortController().signal;
const json = (value) =>
  new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
  });
const model = () =>
  newModel(
    "endpoint",
    {
      provider: "",
      modelId: "test",
      label: "Test",
      reasoning: { kind: "unknown" },
    },
    "2026-10-30",
  );
test("bundled catalog covers all five vendors and preserves unknown vs false", () => {
  for (const provider of ["openai", "anthropic", "google", "xai", "alibaba"])
    assert.ok(bundledCatalog.models.some((m) => m.provider === provider));
  const m = model();
  assert.equal(m.visionKnown, false);
  assert.equal(contextLimit(m), 8192);
  assert.deepEqual(modelProblems(m), []);
});
test("refresh preserves old explicit values, overrides and stable identities", () => {
  const m = { ...model(), contextWindow: 9000, overrides: ["contextWindow"] };
  const n = refreshModel(
    m,
    {
      provider: "openai",
      modelId: "test",
      label: "Changed",
      contextWindow: 128000,
      vision: true,
      reasoning: { kind: "none" },
    },
    "new",
  );
  assert.equal(n.id, m.id);
  assert.equal(n.label, m.label);
  assert.equal(n.contextWindow, 9000);
  assert.equal(n.vision, true);
  const old = { ...m, overrides: undefined };
  assert.equal(
    refreshModel(
      old,
      {
        provider: "openai",
        modelId: "test",
        label: "x",
        vision: true,
        reasoning: { kind: "none" },
      },
      "new",
    ).vision,
    false,
  );
});
test("catalog schema refuses empty or malformed sources and does not invent context", () => {
  assert.throws(() => parseCatalog({}));
  const c = parseCatalog({
    openai: {
      models: {
        x: {
          name: "X",
          modalities: { output: ["text"] },
          limit: { context: -1 },
        },
      },
    },
  });
  assert.equal(c.models[0].contextWindow, undefined);
  assert.equal(c.models[0].vision, undefined);
});
test("current catalog reasoning_options array preserves effort, budget and toggle", () => {
  const entry = (reasoning_options) => ({
    modalities: { output: ["text"] },
    reasoning: true,
    reasoning_options,
  });
  const c = parseCatalog({
    openai: {
      models: {
        a: entry([{ type: "effort", values: ["low", "high", null] }]),
        b: entry([{ type: "budget_tokens", min: 1024, max: 4096 }]),
        c: entry([{ type: "toggle" }]),
      },
    },
  });
  assert.deepEqual(
    c.models.map((m) => m.reasoning.kind),
    ["effort", "budget", "toggle"],
  );
  assert.deepEqual(c.models[0].reasoning.values, ["low", "high"]);
});
test("discovery follows pagination with auth, de-duplicates, and never sends prompts", async () => {
  const calls = [];
  const rows = await discoverModels(
    "https://test.example/v1",
    "anthropic",
    "private",
    signal(),
    async (u, o) => {
      calls.push({ url: String(u), options: o });
      return json(
        calls.length === 1
          ? { data: [{ id: "a" }], has_more: true, last_id: "a" }
          : {
              data: [
                { id: "a" },
                { id: "b", max_input_tokens: 64000, max_tokens: 4096 },
              ],
              has_more: false,
            },
      );
    },
  );
  assert.deepEqual(
    rows.map((m) => m.modelId),
    ["a", "b"],
  );
  assert.equal(rows[1].inputLimit, 64000);
  assert.match(calls[1].url, /after_id=a/);
  assert.equal(calls[0].options.headers["x-api-key"], "private");
  assert.equal(calls[0].options.redirect, "error");
  assert.equal(calls[0].options.body, undefined);
});
test("Gemini filters non-generative models and strips only models/ prefix", async () => {
  const rows = await discoverModels(
    "https://test.example/v1beta",
    "gemini",
    "key",
    signal(),
    async () =>
      json({
        models: [
          {
            name: "models/chat",
            supportedGenerationMethods: ["generateContent"],
            inputTokenLimit: 32000,
          },
          {
            name: "models/embed",
            supportedGenerationMethods: ["embedContent"],
          },
        ],
      }),
  );
  assert.deepEqual(
    rows.map((m) => m.modelId),
    ["chat"],
  );
});
test("failed or looping discovery reports actionable failure; cancelled work sends nothing", async () => {
  await assert.rejects(
    discoverModels(
      "https://a.test",
      "openai-chat",
      "",
      signal(),
      async () => new Response("", { status: 404 }),
    ),
    /没有模型列表/,
  );
  await assert.rejects(
    discoverModels("https://a.test", "anthropic", "", signal(), async () =>
      json({ data: [], has_more: true, last_id: "same" }),
    ),
    /分页异常/,
  );
  const c = new AbortController();
  c.abort();
  let calls = 0;
  await assert.rejects(
    discoverModels("https://a.test", "openai-chat", "", c.signal, async () => {
      calls++;
      return json({ data: [] });
    }),
  );
  assert.equal(calls, 0);
});
test("thinking parameters are protocol-specific and Qwen toggle is not reasoning_effort", () => {
  const m = {
    ...model(),
    reasoning: { kind: "effort", values: ["low", "high"] },
  };
  assert.deepEqual(reasoningBody("openai-responses", m, "high"), {
    reasoning: { effort: "high" },
  });
  assert.deepEqual(reasoningBody("gemini", m, "low"), {
    thinkingConfig: { thinkingLevel: "low" },
  });
  assert.throws(() => reasoningBody("openai-chat", m, "max"), /不受/);
  assert.deepEqual(
    reasoningBody(
      "openai-chat",
      { ...m, reasoning: { kind: "toggle" } },
      "off",
      "alibaba-cn",
    ),
    { enable_thinking: false },
  );
  assert.deepEqual(
    reasoningBody(
      "anthropic",
      {
        ...m,
        reasoning: {
          kind: "budget",
          minTokens: 0,
          maxTokens: 4096,
          presets: [1024],
        },
      },
      "1024",
    ),
    { thinking: { type: "enabled", budget_tokens: 1024 } },
  );
});
test("validation rejects NaN budgets and impossible defaults; input limit caps context", () => {
  const m = {
    ...model(),
    contextWindow: 128000,
    inputLimit: 32000,
    defaultReasoning: "high",
  };
  assert.equal(contextLimit(m), 32000);
  assert.ok(modelProblems(m).length);
  assert.ok(modelProblems({ ...m, contextWindow: NaN }).length);
});

test("input/output planning reserves the configured reasoning budget and caps global output", () => {
  const m = {
    ...model(),
    contextWindow: 128000,
    maxOutputTokens: 32000,
    reasoning: {
      kind: "budget",
      minTokens: 1024,
      maxTokens: 16000,
      presets: [4096, 16000],
    },
  };
  assert.equal(outputLimit(m), 20096);
  assert.equal(outputLimit(m, 64000), 32000);
  assert.equal(outputLimit({ ...m, contextWindow: 8192 }), 4096);
});

test("provider templates have unique identities, usable catalogs and separate Qwen regions", () => {
  assert.equal(providerBrands.length, 15);
  assert.equal(new Set(presets.map((p) => p.id)).size, presets.length);
  for (const p of presets.filter((p) => p.provider)) {
    assert.equal(new URL(p.url).protocol, "https:");
    assert.ok(providerBrands.some((b) => b.id === p.brand));
    assert.ok(
      bundledCatalog.models.some(
        (m) =>
          m.provider === p.provider &&
          m.protocol === p.protocol &&
          !["retired", "deprecated"].includes(m.status),
      ),
      p.id,
    );
  }
  assert.notEqual(
    presets.find((p) => p.id === "alibaba-cn").provider,
    presets.find((p) => p.id === "alibaba-intl").provider,
  );
  const catalog = parseCatalog(
    Object.fromEntries(
      catalogProviders.map((id) => [
        id,
        { models: { test: { modalities: { output: ["text"] } } } },
      ]),
    ),
  );
  assert.deepEqual(
    new Set(catalog.models.map((m) => m.provider)),
    new Set(catalogProviders),
  );
});
test("compatible providers receive supported output fields without OpenAI metadata", () => {
  for (const id of [
    "deepseek",
    "moonshotai-cn",
    "zhipuai",
    "groq",
    "siliconflow-cn",
    "openrouter",
  ]) {
    const body = chatRequestOptions(id, 2048, "session");
    assert.equal(body.max_tokens, 2048);
    assert.equal(body.max_completion_tokens, undefined);
    assert.equal(body.metadata, undefined);
  }
  assert.deepEqual(chatRequestOptions("mistral", 2048, "session"), {
    max_tokens: 2048,
  });
  assert.equal(
    chatRequestOptions("custom", 2048, "session").max_completion_tokens,
    2048,
  );
});
test("new providers use their own thinking controls", () => {
  const toggle = { ...model(), reasoning: { kind: "toggle" } };
  for (const id of ["deepseek", "moonshotai-cn", "zhipuai", "volcengine"]) {
    assert.deepEqual(reasoningBody("openai-chat", toggle, "off", id), {
      thinking: { type: "disabled" },
    });
  }
  assert.deepEqual(reasoningBody("openai-chat", toggle, "off", "openrouter"), {
    reasoning: { enabled: false },
  });
  assert.deepEqual(
    reasoningBody("openai-chat", toggle, "on", "siliconflow-cn"),
    { enable_thinking: true },
  );
});
