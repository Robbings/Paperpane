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

## 阅读器开发入口

**阅读器功能统一在真实 PDF 上开发。** `reader.html` 始终挂载 `src/runtime/reader-page.tsx` 的 `LiveReaderPage`，复用 `ReaderShell` 和现有 UI；PDF.js、选区、投影、批注、翻译及偏好通过正式运行时接合。

| 页面 | 用途 |
|---|---|
| `library.html` | 导入本机 PDF，从真实文献记录打开阅读器 |
| `reader.html` | 正式阅读器；读取本机已导入的论文，无数据时展示选择论文入口 |
| `reader.html?documentId=<本机文档ID>` | 打开对应真实 PDF；旧 `item` 参数兼容并归一为 `documentId` |
| `reader.html?open=import` | 正式阅读器中打开选择/导入论文对话框 |
| `component-gallery.html` | 按钮、菜单、弹窗等独立组件预览，不作为阅读器功能验收 |
| `component-gallery.html?view=selbar` | 选区栏的样式比较 |
| `component-gallery.html?view=reader-archive` | 历史虚拟论文存档，仅供回看旧界面；不继续接入功能或作为验收入口 |

兼容旧书签：`reader-proof.html` 跳转正式阅读器并保留文档参数；`reader.html?view=sample` 也进入真实阅读器。旧 `?view=gallery` / `?view=selbar` 跳转组件预览页。正式阅读器不再实例化虚拟论文。

### 在自己的工作区开发

1. 先检查分支和工作区状态，基于最新主干接合；不要覆盖别人的工作区或未提交成果。
2. 在本工作区执行 `pnpm install --frozen-lockfile`、`pnpm dev`（Edge 用 `pnpm dev:edge`），加载**本工作区**的开发输出目录；已经加载了其他目录时先核实扩展管理页的来源。
3. 打开该扩展的 `library.html`，导入一份本机论文，再从文献库打开阅读器。文档 ID 必须来自当前扩展的数据，不要复制别的浏览器/来源的 ID。
4. 修改公共 UI 组件后，通过真实阅读器的 props / 回调接上；模型尚未接好时可以替换该服务的输出，但保持真实 PDF、位置锚点和阅读器布局。示例结果必须标注、不伪装为当前论文的分析或已保存数据。
5. 核查真实文件下的选区、缩放、旋转、侧栏和小窗位置，以及本次涉及的保存/刷新恢复。单页、双页、逐页模式中的定位按改动范围复核。组件 gallery 和构建通过不能代替这些检查。
6. 交付说明记录工作区/分支、提交、浏览器以及加载的输出目录。生产构建需要重新构建并在扩展管理页重新加载，已有页面也要刷新；不要把旧产物当成当前代码。

开发和测试共用同一个阅读器入口；历史样例代码位于 `src/ui/reader/sample/ArchivedReaderPage.tsx`，不再是功能开发的起点。文档、私有 PDF、模型密钥和浏览器数据不随示例接线提交。

### localhost 预览与扩展验收

本机预览可在工作区执行：

```sh
pnpm build
python3 -m http.server 4206 --bind 127.0.0.1 --directory .output/chrome-mv3
```

然后打开 `http://127.0.0.1:4206/library.html` 导入真实 PDF，或打开 `reader.html` 使用该来源已有的论文。预览服务器只用于静态构建展示，不是产品业务后端。

`http://127.0.0.1:4206`、其他端口、Chrome/Edge 浏览器配置以及 `chrome-extension://<扩展ID>` 各有自己的本机存储。它们的论文、模型配置、密钥和文档 ID 不会因代码相同而自动共享；端口和浏览器保持固定可保留该来源的数据。需要在目标来源分别导入/配置，不搬运浏览器档案或密钥。

localhost 可核查界面和阅读逻辑；扩展权限、浏览器入口和实际扩展网络请求仍应在加载后的 Chrome/Edge 扩展中检查。

当前阅读器里的讨论、概览和解释若标注“示例内容”，仅是现有 UI 的预览：不会请求模型，也不会作为真实会话保存。它们与已实现的真实 PDF、批注和翻译逻辑共用阅读器，但不能据此宣称 AI 功能已经完成。
