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

## 工程结构

- `src/entrypoints/`：扩展页面入口。
- `src/runtime/`：页面挂载与运行时支持。
- `src/ui/`：界面与组件。

演示页面中的示例内容不代表真实 PDF、数据保存或模型功能已接通。
