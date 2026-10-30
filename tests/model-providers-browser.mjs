import assert from "node:assert/strict";
import http from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { pathToFileURL } from "node:url";
import { presets, providerBrands } from "../src/ai/model-providers.ts";
const { chromium } = await import(
  process.env.PAPERPANE_PLAYWRIGHT_MODULE
    ? pathToFileURL(process.env.PAPERPANE_PLAYWRIGHT_MODULE).href
    : "playwright"
);
const root = resolve(
  process.env.PAPERPANE_EXTENSION_DIR ?? ".output/chrome-mv3",
);
const out = resolve(process.env.PAPERPANE_CAPTURE_DIR ?? "backups/model-providers-validation");
await mkdir(out, { recursive: true });
const standalone = process.env.PAPERPANE_PREVIEW_HTML
  ? await readFile(process.env.PAPERPANE_PREVIEW_HTML)
  : null;
const server = http.createServer(async (req, res) => {
  const path = resolve(
    root,
    "." + new URL(req.url, "http://localhost").pathname,
  );
  if (!path.startsWith(root + "/")) {
    res.writeHead(403);
    res.end();
    return;
  }
  try {
    const data = standalone ?? (await readFile(path));
    res.setHeader(
      "Content-Type",
      standalone
        ? "text/html; charset=utf-8"
        : ({
            ".html": "text/html",
            ".js": "text/javascript",
            ".css": "text/css",
          }[extname(path)] ?? "application/octet-stream"),
    );
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  executablePath: process.env.PAPERPANE_CHROMIUM,
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1100 },
});
const page = await context.newPage();
page.setDefaultTimeout(10000);
const errors = [],
  external = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("request", (r) => {
  if (/^https?:/.test(r.url()) && !r.url().startsWith(base + "/"))
    external.push(r.url());
});
const add = () =>
  page.getByRole("button", { name: "添加供应商", exact: true }).click();
const back = () => page.getByRole("button", { name: "返回模型服务" }).click();
async function save() {
  await page
    .locator(".pp-set-savebar")
    .getByRole("button", { name: "保存", exact: true })
    .click();
  await page.getByText("已保存", { exact: true }).waitFor();
}
try {
  await page.goto(base + "/options.html#models");
  await add();
  assert.equal(await page.locator(".pp-provider-preset").count(), 15);
  assert.equal(
    await page.locator(".pp-provider-preset .pp-provider-logo__mark").count(),
    15,
  );
  await page.screenshot({
    path: resolve(out, "picker.png"),
    animations: "disabled",
  });
  await page.getByRole("button", { name: "聚合服务", exact: true }).click();
  assert.equal(await page.locator(".pp-provider-preset").count(), 3);
  await page.getByRole("button", { name: "全部", exact: true }).click();
  await page.getByLabel("查找模型厂商", { exact: true }).fill("月之暗面");
  assert.equal(await page.locator(".pp-provider-preset").count(), 1);
  assert.ok(
    await page
      .getByRole("button", { name: "添加 Kimi", exact: true })
      .isVisible(),
  );
  await page.getByLabel("查找模型厂商", { exact: true }).fill("not-a-provider");
  await page.getByText("没有找到相关厂商").waitFor();
  assert.ok(
    await page.getByRole("button", { name: /自定义兼容服务/ }).isVisible(),
  );
  await page.getByRole("button", { name: "查看全部厂商", exact: true }).click();
  await page
    .getByRole("button", { name: "添加 Qwen · 通义千问", exact: true })
    .click();
  assert.equal(await page.locator(".pp-provider-variants button").count(), 2);
  await page.getByRole("button", { name: "返回全部厂商" }).click();
  await page.keyboard.press("Escape");
  console.log(
    "PASS: 15 branded providers, categories, Chinese search, no-result custom fallback and Qwen regions",
  );
  for (const preset of presets.filter((p) => p.provider)) {
    const brand = providerBrands.find((b) => b.id === preset.brand);
    await add();
    await page
      .getByRole("button", { name: `添加 ${brand.name}`, exact: true })
      .click();
    if (preset.region)
      await page
        .locator(".pp-provider-variants button")
        .filter({ hasText: preset.region })
        .click();
    assert.equal(
      await page.getByLabel("API 基础地址", { exact: true }).inputValue(),
      preset.url,
    );
    assert.equal(
      await page.getByLabel("API 密钥", { exact: true }).inputValue(),
      "",
    );
    await page
      .getByRole("button", { name: "添加模型", exact: true })
      .first()
      .click();
    assert.ok(await page.locator(".pp-model-candidate").count(), preset.id);
    await page
      .locator(".pp-model-candidate")
      .first()
      .getByRole("checkbox")
      .check();
    await page
      .getByRole("button", { name: "添加 1 个模型", exact: true })
      .click();
    assert.equal(await page.locator(".pp-model-row").count(), 1);
    await back();
    console.log("PASS: template, matching catalog and model add " + preset.id);
  }
  await save();
  await page.reload();
  await page.locator(".pp-provider-card").first().waitFor();
  assert.equal(await page.locator(".pp-provider-card").count(), 16);
  assert.equal(
    await page.locator(".pp-provider-card .pp-provider-logo__mark").count(),
    16,
  );
  await page.screenshot({
    path: resolve(out, "providers.png"),
    animations: "disabled",
  });
  await page.getByLabel("搜索供应商", { exact: true }).fill("deepseek");
  assert.equal(await page.locator(".pp-provider-card").count(), 1);
  await page.getByRole("button", { name: "清除搜索供应商" }).click();
  await page
    .locator(".pp-provider-card")
    .filter({ has: page.getByText("DeepSeek", { exact: true }) })
    .click();
  assert.equal(await page.locator(".pp-model-row").count(), 1);
  const toolbar = page.locator(".pp-model-detail-toolbar");
  assert.equal(await page.locator(".pp-set-savebar").count(), 1);
  assert.equal(await toolbar.getByRole("button", { name: "保存", exact: true }).isDisabled(), true);
  for (const name of ["返回模型服务", "移除此供应商", "复制配置", "保存"]) assert.equal(await toolbar.getByRole("button", {name, exact: true}).count(), 1);
  assert.notEqual(await toolbar.evaluate(el => getComputedStyle(el).backdropFilter), "none");
  await page.mouse.move(0, 0);
  await page.screenshot({path: resolve(out, "detail.png"), animations: "disabled"});
  await toolbar.getByRole("button", {name: "复制配置", exact: true}).hover();
  await page.locator(".pp-tooltip").filter({hasText: "复制配置"}).waitFor();
  await page.locator(".pp-set-row__text .pp-hint-label").first().hover();
  await page.locator(".pp-tooltip").filter({hasText: "用于区分"}).waitFor();
  await page.mouse.move(0, 0);
  await page.setViewportSize({width:1440,height:480});
  await page.locator(".pp-settings__viewport").evaluate(el => el.scrollTop = el.scrollHeight);
  const toolbarBox = await toolbar.boundingBox();
  assert.ok(toolbarBox.y >= 0 && toolbarBox.y < 70, "toolbar stays visible while scrolling");
  await page.setViewportSize({width:1440,height:1100});
  await page.locator(".pp-settings__viewport").evaluate(el => el.scrollTop = 0);
  await page.getByLabel("API 基础地址", {exact:true}).fill("invalid-url");
  await toolbar.getByRole("button", {name:"保存",exact:true}).click();
  await toolbar.locator('.pp-set-savebar[data-state="danger"]').waitFor();
  assert.ok((await toolbar.locator('.pp-set-savebar__text').innerText()).length > 0);
  await page.screenshot({path:resolve(out,"detail-invalid.png"),animations:"disabled"});
  await toolbar.getByRole("button", {name:"放弃",exact:true}).click();
  assert.equal(await page.getByLabel("API 基础地址", {exact:true}).inputValue(), "https://api.deepseek.com/v1");
  await page.getByLabel("服务名称", {exact: true}).fill("DeepSeek · 布局验证");
  await back();
  await page.locator(".pp-provider-card").filter({has: page.getByText("DeepSeek · 布局验证", {exact:true})}).click();
  assert.equal(await page.getByLabel("服务名称", {exact:true}).inputValue(), "DeepSeek · 布局验证");
  assert.equal(await toolbar.getByRole("button", {name:"保存",exact:true}).isEnabled(), true);
  await page.locator(".pp-settings__nav").getByRole("button",{name:"高级",exact:true}).click();
  const timeout = Number(await page.getByLabel("超时",{exact:true}).inputValue()) + 1;
  await page.getByLabel("超时",{exact:true}).fill(String(timeout));
  assert.equal(await page.locator('.pp-set-savebar[data-layout="floating"]').count(), 1);
  await page.locator(".pp-settings__nav").getByRole("button",{name:"模型",exact:true}).click();
  await page.locator(".pp-provider-card").filter({has: page.getByText("DeepSeek · 布局验证", {exact:true})}).click();
  await save();
  await page.locator(".pp-settings__nav").getByRole("button",{name:"高级",exact:true}).click();
  await page.reload();
  await page.waitForFunction(expected => [...document.querySelectorAll(".pp-set-row")].find(el => el.querySelector("label")?.textContent.trim() === "超时")?.querySelector("input")?.value === expected, String(timeout));
  await page.locator(".pp-settings__nav").getByRole("button",{name:"模型",exact:true}).click();
  await page.locator(".pp-provider-card").filter({has: page.getByText("DeepSeek · 布局验证", {exact:true})}).click();
  await page.evaluate(() => document.documentElement.dataset.theme = "dark");
  await page.screenshot({path:resolve(out,"detail-dark.png"),animations:"disabled"});
  await page.evaluate(() => document.documentElement.dataset.theme = "light");
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:resolve(out,"detail-mobile.png"),animations:"disabled"});
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),false);
  for (const name of ["返回模型服务", "移除此供应商", "保存"]) assert.ok(await toolbar.getByRole("button",{name,exact:true}).isVisible());
  await page.setViewportSize({width:1440,height:1100});
  await toolbar.getByRole("button",{name:"移除此供应商",exact:true}).click();
  await page.getByRole("dialog").getByRole("button",{name:"取消",exact:true}).click();
  assert.equal(await page.getByLabel("服务名称", {exact:true}).inputValue(),"DeepSeek · 布局验证");
  await toolbar.getByRole("button",{name:"移除此供应商",exact:true}).click();
  await page.getByRole("button",{name:"确认移除",exact:true}).click();
  assert.equal(await page.locator(".pp-provider-card").count(),15);
  await page.locator(".pp-set-savebar").getByRole("button",{name:"放弃",exact:true}).click();
  assert.equal(await page.locator(".pp-provider-card").count(),16);
  assert.equal(await page.locator("h1").count(),1);
  console.log("PASS: unified sticky glass actions, tooltips, back preserves draft, global save, deletion/discard and detail layouts");
  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  await add();
  await page.screenshot({
    path: resolve(out, "picker-dark.png"),
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  await page.evaluate(() => (document.documentElement.dataset.theme = "light"));
  await page.setViewportSize({ width: 390, height: 844 });
  await add();
  await page.screenshot({
    path: resolve(out, "picker-mobile.png"),
    animations: "disabled",
  });
  assert.equal(
    await page
      .locator(".pp-provider-picker .pp-dialog")
      .evaluate((e) => e.scrollWidth > e.clientWidth),
    false,
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.keyboard.press("Escape");
  await page.screenshot({
    path: resolve(out, "providers-mobile.png"),
    animations: "disabled",
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  console.log(
    "PASS: save/reload, branded list, existing search, dark/mobile layouts and no external requests",
  );
} catch (e) {
  console.error("BROWSER ERRORS", errors);
  console.error((await page.locator("body").innerText()).slice(-5000));
  await page.screenshot({ path: resolve(out, "failure.png") });
  throw e;
} finally {
  await browser.close();
  server.close();
}
