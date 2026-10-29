# Paperpane

Paperpane（纸窗）是 Chrome / Edge 论文阅读扩展，使用 WXT、React 和 TypeScript。

## 开发与构建

Node.js 版本见 `.node-version`，pnpm 版本见 `package.json`。

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm dev
pnpm build
pnpm build:edge
```

开发模式不会自动启动浏览器。在 Chrome 扩展管理页加载 `.output/chrome-mv3-dev`；Edge 使用 `pnpm dev:edge` 和 `.output/edge-mv3-dev`。

生产产物分别位于 `.output/chrome-mv3` 与 `.output/edge-mv3`。使用 `pnpm zip` 或 `pnpm zip:edge` 生成扩展 ZIP。生产扩展不需要本地开发服务器。

## 浏览器 PDF 入口

加载或重新加载扩展后，刷新 arXiv 论文详情页，在右侧 PDF 链接下点击「在 Paperpane 中打开」。扩展会在新标签页下载并显示该论文，同时加入本机文献库；可以从阅读器左上角返回文献库。刷新阅读器会读取已保存的 PDF，重复导入同一文件不会创建重复条目。

网页中的 PDF 链接和嵌入 PDF 会出现打开按钮；支持的 Chrome 原生 PDF 页面左下角也有悬浮按钮。扩展图标弹窗会识别当前页面，提供打开 PDF、最近阅读、文献库及设置入口。

弹窗使用真实标签页和文献库数据：已入库标记、最近三篇论文的编辑后标题、阅读位置和时间会随数据变化更新。模型状态读取已保存的默认/翻译模型与关联接口；「已配置」表示配置完整，不表示刚刚测试过网络连接。同步引擎尚未实现，状态栏会明确显示尚未接入或配置不完整，不会宣称已同步。

Google Scholar 搜索结果会逐条显示打开按钮：优先右侧标注的 PDF，可退回已知开放平台的标题链接；HTML-only 和引用条目不会添加误导入口。已增加 ACL Anthology、OpenReview、CVF、NeurIPS、PMLR、Hugging Face Papers、bioRxiv/medRxiv、HAL、Semantic Scholar、PubMed Central、Zenodo、Frontiers、PLOS 适配。

弹窗及「设置 → 通用 → 浏览器入口」提供「自动打开 PDF」和「显示网页打开按钮」两个独立开关。自动打开默认关闭，按钮默认显示。自动打开依据顶层响应的 PDF 类型判断，支持没有 `.pdf` 后缀和重定向的地址；下载附件和嵌入页面不会自动接管。

阅读器工具栏的「返回原 PDF」按钮返回本次打开的网址；即使启用了自动打开，返回原件和刷新也会保留原生查看方式。切换到其他页面后恢复自动打开。失败时可重试或导入本地文件。

通用识别需要 HTTP/HTTPS 网页访问及 `webRequest`、`scripting`、`storage` 权限；更新后按浏览器提示重新启用扩展并刷新原网页。原生 PDF 页面若被浏览器限制注入，仍可使用扩展图标弹窗。`file:`、`blob:` 和需要登录的下载请先保存到本机再导入。

`pnpm test` 运行入口单元测试。

## 工程结构

- `src/entrypoints/`：扩展页面入口。
- `src/runtime/`：页面挂载与运行时支持。
- `src/ui/`：界面与组件。

演示页面中的示例内容不代表真实 PDF、数据保存或模型功能已接通。
