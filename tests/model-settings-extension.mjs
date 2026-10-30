import assert from "node:assert/strict";
import http from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { checkModelSettingsConcurrency } from './model-settings-concurrency.mjs';
const { chromium } = await import(
  process.env.PAPERPANE_PLAYWRIGHT_MODULE
    ? pathToFileURL(process.env.PAPERPANE_PLAYWRIGHT_MODULE).href
    : "playwright"
);
const extension = resolve(
  process.env.PAPERPANE_EXTENSION_DIR ?? ".output/chrome-mv3",
);
const staticMode = process.env.PAPERPANE_STATIC === "1";
const out = resolve("backups/model-settings-validation");
await mkdir(out, { recursive: true });
let requests = [],
  listMode = "ok";
const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
    });
    res.end();
    return;
  }
  if (staticMode && !req.url.startsWith("/v1")) {
    const path = resolve(
      extension,
      "." + new URL(req.url, "http://localhost").pathname,
    );
    if (!path.startsWith(extension + "/")) {
      res.writeHead(403);
      res.end();
      return;
    }
    try {
      const data = await readFile(path);
      res.setHeader(
        "Content-Type",
        path.endsWith(".js")
          ? "text/javascript"
          : path.endsWith(".css")
            ? "text/css"
            : path.endsWith(".html")
              ? "text/html"
              : "application/octet-stream",
      );
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end();
    }
    return;
  }
  let raw = "";
  for await (const c of req) raw += c;
  const body = raw ? JSON.parse(raw) : undefined;
  requests.push({ path: req.url, body, auth: req.headers.authorization });
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.url.startsWith("/v1/models") && !req.url.includes(":stream")) {
    if (listMode === "404") {
      res.writeHead(404);
      res.end("{}");
      return;
    }
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        data: [
          { id: "local-model", display_name: "Local model" },
          { id: "second-model" },
        ],
      }),
    );
    return;
  }
  const text =
    body?.text?.format ||
    body?.response_format ||
    body?.output_config?.format ||
    body?.generationConfig?.responseFormat
      ? ' {"ok":true}'
      : JSON.stringify(body).includes("image") ||
          JSON.stringify(body).includes("inlineData")
        ? "red"
        : "OK";
  let frames;
  if (req.url.endsWith("/responses"))
    frames = [
      {
        type: "response.completed",
        response: {
          status: "completed",
          output: [
            { type: "message", content: [{ type: "output_text", text }] },
          ],
          usage: { input_tokens: 1, output_tokens: 1 },
        },
      },
    ];
  else if (req.url.endsWith("/messages"))
    frames = [
      { type: "message_start", message: { usage: { input_tokens: 1 } } },
      { type: "content_block_delta", delta: { type: "text_delta", text } },
      {
        type: "message_delta",
        delta: { stop_reason: "end_turn" },
        usage: { output_tokens: 1 },
      },
      { type: "message_stop" },
    ];
  else if (req.url.includes(":streamGenerateContent"))
    frames = [
      {
        candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }],
        usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
      },
    ];
  else
    frames = [
      {
        choices: [{ delta: { content: text }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      },
    ];
  res.writeHead(200, { "content-type": "text/event-stream" });
  for (const f of frames) res.write("data: " + JSON.stringify(f) + "\n\n");
  res.end();
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/v1`;
const context = await chromium.launchPersistentContext(
  resolve("browser-profiles/models-" + Date.now()),
  {
    executablePath: process.env.PAPERPANE_CHROMIUM,
    headless: true,
    viewport: { width: 1440, height: 1100 },
    ignoreDefaultArgs: ["--disable-extensions"],
    args: staticMode
      ? []
      : [
          `--disable-extensions-except=${extension}`,
          `--load-extension=${extension}`,
        ],
  },
);
console.log("Browser launched");
context.setDefaultTimeout(15000);
const errors = [];
context.on("page", (p) => p.on("pageerror", (e) => errors.push(e.message)));
try {
  const worker = staticMode
    ? null
    : (context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker")));
  const root = staticMode
    ? base.replace(/\/v1$/, "")
    : `chrome-extension://${new URL(worker.url()).host}`;
  console.log(
    "Validation mode:",
    staticMode
      ? "static production UI (extension loading blocked by browser policy)"
      : "loaded extension",
  );
  const page = await context.newPage();
  await page.goto(root + "/options.html#models");
  await page.getByRole("button", { name: "添加供应商", exact: true }).click();
  await page.getByRole("button", { name: /自定义兼容服务/ }).click();
  async function type(label, value) {
    const input = page.getByLabel(label, { exact: true });
    await input.click();
    await input.press("ControlOrMeta+A");
    await input.pressSequentially(value, { delay: 5 });
    await input.press("Tab");
  }
  await type("服务名称", "Local endpoint");
  await type("API 基础地址", base);
  await type("API 密钥", "local-fixture-key");
  console.log(
    "Form heading:",
    await page.locator(".pp-model-detail-identity h1").innerText(),
  );
  await page
    .getByRole("button", { name: "添加模型", exact: true })
    .first()
    .click();
  await page.getByRole("tab", { name: "此端点模型" }).click();
  await page.getByRole("button", { name: "获取模型列表" }).click();
  await page.getByText("端点返回 2 个模型。").waitFor();
  await page
    .locator(".pp-model-candidate")
    .filter({ hasText: "local-model" })
    .getByRole("checkbox")
    .check();
  await page
    .locator(".pp-model-candidate")
    .filter({ hasText: "second-model" })
    .getByRole("checkbox")
    .check();
  await page.getByRole("button", { name: "添加 2 个模型" }).click();
  assert.equal(requests.filter((r) => r.body).length, 0);
  assert.equal(requests[0].auth, "Bearer local-fixture-key");
  await page
    .locator(".pp-set-savebar")
    .getByRole("button", { name: "保存", exact: true })
    .click();
  await page.getByText("已保存", { exact: true }).waitFor();
  await page.reload();
  await page
    .locator(".pp-provider-card")
    .filter({ hasText: "Local endpoint" })
    .click();
  assert.equal(
    await page.getByLabel("API 密钥", { exact: true }).inputValue(),
    "",
  );
  assert.equal(await page.locator(".pp-model-row").count(), 2);
  console.log(
    "PASS: production UI discovery, authenticated GET only, bulk add, save, reload and redacted key",
  );
  let row = page.locator(".pp-model-row").filter({ hasText: "local-model" });
  await row.getByRole("button", { name: "编辑", exact: true }).click();
  await type("显示名称", "Reading model");
  await type("上下文容量（tokens）", "32000");
  await type("最大输出（tokens）", "4096");
  await page.getByRole("button", { name: "完成", exact: true }).click();
  assert.ok(
    await page
      .locator(".pp-model-row")
      .filter({ hasText: "local-model" })
      .getByText("Reading model", { exact: true })
      .count(),
  );
  await page
    .locator(".pp-set-savebar")
    .getByRole("button", { name: "保存", exact: true })
    .click();
  await page.getByText("已保存", { exact: true }).waitFor();
  await page.screenshot({ path: resolve(out, "endpoint.png"), fullPage: true });
  console.log(
    "PASS: model name is independent of request ID; capacity persists through real settings store",
  );
  async function select(label, text) {
    await page
      .getByRole("button", { name: new RegExp("^" + label + "：") })
      .click();
    await page
      .getByRole("menuitemcheckbox", { name: text, exact: true })
      .click();
  }
  for (const protocol of [
    "OpenAI Chat Completions",
    "OpenAI Responses",
    "Anthropic Messages",
    "Gemini 原生",
  ]) {
    row = page.locator(".pp-model-row").filter({ hasText: "local-model" });
    await row.getByRole("button", { name: "编辑", exact: true }).click();
    await page.getByText("高级设置", { exact: true }).click();
    await select("此模型的 API 格式", protocol);
    if (protocol === "Anthropic Messages") {
      await select("思考方式", "Token 预算");
      await type("最小思考预算", "1024");
      await type("最大思考预算", "2048");
      await type("预算预设", "1024, 2048");
      await select("默认思考设置", "2048");
    }
    await page.getByRole("button", { name: "完成", exact: true }).click();
    await row.getByRole("button", { name: "测试", exact: true }).click();
    await page.getByRole("button", { name: "发送测试请求" }).click();
    await page.getByText(/文本测试通过/).waitFor();
    if (protocol === "Anthropic Messages") {
      const sent = requests.at(-1).body;
      assert.equal(sent.thinking.budget_tokens, 2048);
      assert.ok(sent.max_tokens > sent.thinking.budget_tokens);
    }
    await page
      .getByRole("button", { name: "关闭", exact: true })
      .last()
      .click();
    console.log("PASS: production stream adapter " + protocol);
  }
  row = page.locator(".pp-model-row").filter({ hasText: "local-model" });
  await row.getByRole("button", { name: "测试", exact: true }).click();
  await select("测试内容", "图片识别（红色测试图）");
  await page.getByRole("button", { name: "发送测试请求" }).click();
  await page.getByText(/图片测试通过/).waitFor();
  await select("测试内容", "结构化输出");
  await page.getByRole("button", { name: "发送测试请求" }).click();
  await page.getByText(/结构化输出测试通过/).waitFor();
  await page.getByRole("button", { name: "关闭", exact: true }).last().click();
  assert.equal(requests.filter((r) => r.body).length, 6);
  assert.ok(
    requests
      .filter((r) => r.body)
      .every((r) => (r.path + JSON.stringify(r.body)).includes("local-model")),
  );
  console.log(
    "PASS: image and structured output through the actual model client; only explicit tests generate",
  );
  await page.evaluate(async (base) => {
    await new Promise((resolve) => {
      navigator.locks.request("paperpane-model:" + base + ":0", async () => {
        resolve();
        await new Promise((r) => (globalThis.__releaseModelSlot = r));
      });
    });
  }, base);
  const beforeCancel = requests.length;
  await row.getByRole("button", { name: "测试", exact: true }).click();
  await page.getByRole("button", { name: "发送测试请求" }).click();
  await page.getByText("正在处理…", { exact: false }).first().waitFor();
  await page.getByRole("button", { name: "关闭", exact: true }).last().click();
  await page.evaluate(() => globalThis.__releaseModelSlot());
  await page.waitForTimeout(250);
  assert.equal(requests.length, beforeCancel);
  console.log("PASS: closing queued test prevents dispatch after slot release");
  listMode = "404";
  await page.getByRole("button", { name: "添加模型", exact: true }).click();
  await page.getByRole("tab", { name: "此端点模型" }).click();
  await page.getByRole("button", { name: "获取模型列表" }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: /没有模型列表/ })
    .waitFor();
  await page.getByRole("tab", { name: "常用模型" }).click();
  await page.getByLabel("搜索模型", { exact: true }).fill("gpt-5");
  assert.ok((await page.locator(".pp-model-candidate").count()) > 0);
  await page.getByRole("button", { name: "取消", exact: true }).last().click();
  console.log("PASS: 404 discovery falls back to offline catalog");
  await page.getByRole("button", { name: "复制配置" }).click();
  assert.equal(
    await page.getByLabel("API 密钥", { exact: true }).inputValue(),
    "",
  );
  await page.getByRole("button", { name: "返回模型服务" }).click();
  await page.screenshot({
    path: resolve(out, "providers.png"),
    fullPage: true,
    animations: "disabled",
  });
  const second = await context.newPage();
  await second.goto(root + "/options.html#models");
  await second
    .locator(".pp-provider-card")
    .filter({ hasText: "Local endpoint" })
    .click();
  const rename = second.getByLabel("服务名称", { exact: true });
  await rename.click();
  await rename.press("ControlOrMeta+A");
  await rename.pressSequentially("Shared renamed");
  await rename.press("Tab");
  await second
    .locator(".pp-set-savebar")
    .getByRole("button", { name: "保存", exact: true })
    .click();
  await second.getByText("已保存", { exact: true }).waitFor();
  await page.bringToFront();
  await page.locator(".pp-provider-card").filter({has: page.getByText("Local endpoint", {exact: true})}).click();
  await page
    .locator(".pp-set-savebar")
    .getByRole("button", { name: "保存", exact: true })
    .click();
  await page.getByRole("button", { name: "合并后保存" }).waitFor();
  assert.equal(await page.locator('.pp-model-detail-toolbar .pp-set-savebar[data-state="warn"]').count(), 1);
  await page.screenshot({path: resolve(out, "conflict.png"), animations:"disabled"});
  await page.getByRole("button", { name: "合并后保存" }).click();
  await page.getByText("已保存", { exact: true }).waitFor();
  await page.reload();
  await page
    .locator(".pp-provider-card")
    .filter({ hasText: "Shared renamed" })
    .waitFor();
  assert.equal(await page.locator(".pp-provider-card").count(), 2);
  await second.close();
  console.log(
    "PASS: concurrent windows merge endpoint rename with added service and model edits",
  );
  await page
    .locator(".pp-provider-card")
    .filter({ hasText: "Shared renamed" })
    .click();
  const afterSave = requests.length;
  await type("API 基础地址", base + "/changed");
  await page.getByRole("button", { name: "添加模型", exact: true }).click();
  await page.getByRole("tab", { name: "此端点模型" }).click();
  await page.getByRole("button", { name: "获取模型列表" }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: /重新填写密钥/ })
    .waitFor();
  assert.equal(requests.length, afterSave);
  await page.getByRole("button", { name: "取消", exact: true }).last().click();
  await page
    .locator(".pp-set-savebar")
    .getByRole("button", { name: "放弃", exact: true })
    .click();
  console.log(
    "PASS: changing destination cannot forward a previously saved key",
  );
  await page
    .locator(".pp-model-row")
    .first()
    .getByRole("button", { name: "编辑", exact: true })
    .click();
  await page.screenshot({
    path: resolve(out, "model-editor.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "取消", exact: true }).last().click();
  await page.getByRole("button", { name: "返回模型服务" }).click();
  await page.setViewportSize({ width: 560, height: 900 });
  await page.screenshot({ path: resolve(out, "narrow.png"), fullPage: true });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: duplicate excludes key, narrow viewport and no uncaught browser errors",
  );
  await page.setViewportSize({ width: 1440, height: 1100 });
  const concurrent = await context.newPage();
  await concurrent.goto(root + '/options.html#models');
  const reopen = async (target) => {
    await target.reload();
    await target.locator('.pp-provider-card').filter({ hasText: 'Shared renamed' }).click();
  };
  await reopen(page); await reopen(concurrent);
  for (const result of await checkModelSettingsConcurrency(page, concurrent, { reopen })) console.log('PASS:', result);
  await concurrent.close();
  assert.deepEqual(errors, []);
} catch (error) {
  const p = context.pages().at(-1);
  console.error("PAGE", await p?.locator("body").innerText());
  console.error(
    "REQUEST PATHS",
    requests.map((r) => r.path),
  );
  console.error("BROWSER ERRORS", errors);
  await p?.screenshot({ path: resolve(out, "failure.png") });
  throw error;
} finally {
  await context.close();
  server.close();
}
