# 界面组件使用说明

适用于 `src/ui/components/` 与 `src/ui/reader/`（本文件随代码一起维护）

这份文档写给接合界面与逻辑的人：每个组件做什么、怎么调用、需要你提供哪些状态。视觉细节以代码和测试页为准。

## 测试页

构建后打开扩展的 `reader.html?view=gallery`，左侧是组件目录，每个组件都有可以直接操作的示例，可切换浅色 / 深色。`?theme=light|dark` 可在任意页面强制主题，供审阅使用；正式的主题偏好由逻辑层保存，并在页面加载时调用 `applyTheme()`（`src/ui/theme.ts`）。

## 约定

- 统一从 `@/ui/components` 导入。
- **组件只负责显示和交互，不读写数据**。数据、状态、错误都通过 props 传入，用户操作通过回调传出。
- 状态用 `SaveStatus` 等组件里定义的统一词表；界面不自己推断"已保存""生成中"之类的状态。
- 文案是中文；需要可配置的文案都以 props 传入。
- 按钮类组件透传 `ref`、事件、`disabled` 和 `aria-*`，可以和 assistant-ui 的 asChild 组合。
- 颜色、间距、圆角、动效全部来自 `src/ui/styles/tokens.css` 的 `--pp-*` 变量，不要写死数值。

## 组件一览

| 组件 | 用途 | 关键 props |
|---|---|---|
| `Button` | 文字按钮 | `variant`: plain / primary / quiet / danger；`size`: sm / md；`shape`: rounded / pill；`icon` |
| `IconButton` | 只有图标的按钮，自带浮层提示 | `icon`、`label`（必填，也是读屏名称和提示文字）、`active`、`shortcut`、`tooltipPlacement`、`tooltip` |
| `Segmented` | 2–4 个互斥选项 | `options`、`value`、`onChange`、`label`、`stretch` |
| `Tooltip` | 浮层提示 | `label`、`shortcut`、`placement`、`labelsChild`（子元素已用同样文字做名称时设为 true） |
| `Popover` | 锚定在某个元素上的非模态浮层（引用预览、小表单） | `anchorRef`、`open`、`onClose`、`label`、`placement`、`width` |
| `Menu` | 下拉 / 右键菜单 | `entries`（普通项、勾选项、分隔线）、`anchor`（坐标）、`align`、`triggerRef`、`onSelect`、`onClose`；`multiple`：点勾选项后菜单不关，可以连续勾选 |
| `Dialog` | 模态对话框 | `open`、`onClose`、`title`、`description`、`footer`、`size`、`dismissible` |
| `toast` / `Toaster` | 页面顶部的轻提示 | `toast.show({ message, tone, action, duration })`；每个页面渲染一个 `<Toaster />` |
| `TextField` / `TextArea` | 输入框 / 自动长高的多行输入 | `label`、`value`、`onChange(value)`、`description`、`error`、`icon`、`clearable`；`TextArea` 另有 `maxRows`、`maxLength` |
| `Switch` | 立即生效的开关 | `checked`、`onChange`、`label`、`description` |
| `Checkbox` | 列表或表单里的勾选 | 同上，另有 `indeterminate` |
| `ProgressBar` | 进度条 | `value`（0–1；不知道真实进度时不传）、`label`、`detail` |
| `Spinner` / `Skeleton` | 小转圈 / 加载占位 | `size`；`lines` 或 `height` |
| `EmptyState` | 空状态或失败状态 | `icon`、`title`、`description`、`actions`、`tone`: neutral / danger |
| `Badge` / `Kbd` | 短标签 / 快捷键 | `tone`；文字 |
| `SaveStatus` | 本地保存与同步状态 | `local`、`sync`、`simulated`（示例数据，显示"演示内容，不会保存"） |
| `SelectionMenu` | 选区菜单 | `actions`、`currentColor`（已有高亮时）、`onColor`、`onAction`、`onDelete` |
| `GlassSurface` | 玻璃材质容器 | `as`、`tone`: float / bar / panel、`radius` |
| `Tree` | 可展开、可拖动的层级列表（文件夹） | `nodes`、`selectedId`、`expandedIds`、`onToggle`；改名用 `renamingId` / `onRename`；拖动用 `onMove`、`canMove`；接收外部拖入用 `acceptsExternal`、`onExternalDrop` |
| `TagInput` | 标签输入：已选标签 + 联想 | `selected`、`options`、`onAdd({ id?, label })`（没有 id 表示新建）、`onRemove(id)` |
| `StarToggle` | 星标开关 | `starred`、`onChange`（不传则只显示） |
| `Markdown` | 安全渲染模型输出的 Markdown 子集（段落、标题、列表、引用、代码、强调、http 链接），不产生 HTML | `text`、`renderCitation(label)`（渲染正文里的 `[^label]` 出处标记） |
| `ScrollArea` | 纵向滚动区，用细的浮动滚动条代替系统滚动条 | `viewportClassName`（滚动元素的类名，如限高）、`viewportRef`、`onScroll`；其余属性加在滚动元素上 |

## 需要逻辑层配合的几个组件

### toast：逻辑代码可以直接调用

```ts
import { toast } from '@/ui/components';

toast.show({ message: '同步暂停：WebDAV 服务器暂时无法连接', tone: 'warning' });
toast.show({
  message: '已删除 1 条批注',
  action: { label: '撤销', onAction: () => annotations.restore(id) },
});
toast.show({ message: '翻译失败：请求超时', tone: 'error', action: { label: '重试', onAction: retry } });
```

- `tone`: neutral / success / warning / error。错误默认不自动消失；其余停留 1.8 秒（带操作时 4 秒）后用 0.9 秒渐隐。鼠标移上去或聚焦时取消渐隐，离开后再停留片刻。`duration` 是开始渐隐前的毫秒数。
- 最多同时显示 3 条，新的会挤掉最旧的。
- 适合"做完了"或"出错了可以重试"。需要用户做决定的事用 `Dialog`，持续存在的状态（同步失败、未配置）放在对应界面里，不要只发一条提示。

### Dialog：由你控制 open

```tsx
<Dialog
  open={conflict !== null}
  onClose={keepBoth}
  dismissible={false}
  title="笔记在另一台设备上也被修改了"
  description="两个版本都已保留。"
  footer={<><Button onClick={keepBoth}>保留两版</Button><Button variant="primary" onClick={useLocal}>使用本机版本</Button></>}
/>
```

- 打开时焦点落在正文第一个输入框，没有输入框时落在页脚第一个按钮（约定把"取消"放在前、主操作放在最后）。关闭后焦点回到打开它的按钮。
- `dismissible={false}` 用于必须明确选择的情况：Esc 和点背景都不会关闭，也没有关闭按钮。
- 表单类对话框：把 `<form id>` 放在正文里，页脚提交按钮用 `type="submit" form="同一个 id"`，回车即可提交。

### ProgressBar：只显示真实进度

能测量时传 `value`（例如已提取页数 / 总页数），并用 `detail` 写出"第 12 / 30 页"；测不出来就不传 `value`，显示不确定进度。不要用计时器模拟进度。

### SaveStatus：两个独立状态

`local`: unmodified / editing / saving / saved / failed；`sync`: unconfigured / pending / syncing / synced / failed / conflict。两者分开传，未同步不能显示成已备份。示例数据统一传 `simulated`。

## 阅读器外壳 `ReaderShell`

位于 `src/ui/reader/ReaderShell.tsx`，当前由 `src/ui/pages/ReaderPage.tsx` 用示例数据驱动。视图模型在 `src/ui/reader/types.ts`，契约确定后由逻辑层映射过来。

| prop | 说明 |
|---|---|
| `header` | 标题、来源、页数 |
| `outline`、`pageIndex`、`zoomPercent` | 目录、当前页（从 0 开始）、缩放 |
| `document` | 论文区内容；接入 PDF 渲染时替换示例页 |
| `annotations`、`annotationStatus` | 批注列表与保存 / 同步状态 |
| `notes` | 笔记内容、`onChange`、保存 / 同步状态 |
| `initialLayout`、`onLayoutChange` | 停靠位置、宽高、是否显示标题；由逻辑层保存为偏好 |
| `onNavigate`、`onZoom` | 跳页、缩放 |
| `onHighlight(color, selection)`、`onSelectionAction(action, selection)` | 选区菜单的操作；`selection` 是选中时的快照，锚点由逻辑层生成 |
| `onLocateAnnotation(id)`、`onTool(tool)` | 定位批注、工具栏按钮 |
| `panels` | 可选。由页面提供的研究区面板内容，如 `{ discuss: <ChatPanel …/>, overview: <OverviewPanel …/> }`；没提供的面板显示占位 |
| `library` | 可选。传入后工具栏标题旁出现收藏按钮，侧栏多一个「文献」页：`currentPaperId`、`folders`、`papers`、`recent`、`saved`、`entry`、`tags`，以及 `onSave(draft)`、`onRemove`、`onCreateFolder(parentId, name)`（返回新文件夹 id）、`onOpenPaper(id, newTab)`、`onImport(files)`、`onOpenLibrary` |

论文区的滚动容器是 `.pp-reader__paper`；外壳在它上面监听选区并显示选区菜单、绘制浮动滚动条。

## 讨论面板 `ChatPanel`

位于 `src/ui/reader/chat/`，视图模型在 `chat/types.ts`，与 PR #7 的会话契约一一对应；示例接线是 `reader/sample/SampleChat.tsx`。解释面板以后复用同一组件（`title="解释"`，用 `source` 显示被解释的段落或截图）。

- 逻辑层把 `visibleMessages(session)` 映射成 `messages`；每条消息的 `version` 来自 `messageVersions`（第几个 / 共几个），`onVersion(id, ±1)` 由逻辑层用 `latestLeaf` + `selectBranch` 切换。
- 出处：`citations` 的 `pageLabel` 由逻辑层从锚点算出；回答正文里写 `[^label]` 会显示为可点的小标记，`onLocate(citation)` 交给 `AnchorService.locate`。
- 生成状态 `generation` 决定界面：排队、生成中（输入框的发送按钮变成停止）、已停止、被中断、失败、保存失败，各自带恢复按钮，`onRecover(id, action)`。
- 换到另一家供应商的模型：`onModel` 之后，逻辑层返回的确认信息传给 `modelChange`，界面弹出说明；用户点「换用」调用 `onConfirmModelChange`。
- 演示数据传 `demo`，标题旁会显示「演示，不会调用模型」。

## 概览面板 `OverviewPanel`

位于 `src/ui/reader/overview/`，示例接线是 `reader/sample/SampleOverview.tsx`。标题栏在玻璃上，内容在一张不透明的纸面上：开头一两句概括，然后是关键词、结构化摘要、要点。每部分可以折叠，折叠后只留一行摘要；操作在悬停时出现。

- 卡片定义 `OverviewCardDef`（名称、提示词、输出形式：文本 / 关键词 / 要点（每条短标题 + 一句说明）/ 结构化，`display: 'lead'` 的文本卡作为开头）是用户的全局设置，在设置页编辑（`OverviewEditor` 留给设置页用）。面板里只有「隐藏这一部分」和「管理概览内容…」入口。
- **自动生成**：配置了模型时，逻辑层在论文打开时开始生成，面板只显示进度；读者可以全部或单独重新生成、停止。卡片改过后，逻辑层把旧结果标为 `stale`。
- **出处**：结果文字里用 `[^label]` 标记出处，`sources` 给出每个标记的引文和核实结果。界面把整页的标记按出现顺序重新编号；点击调用 `onLocate(source)`，逻辑层定位后，阅读器滚动过去并用 `LocateFlash`（页面坐标）短暂标出原文。没核实的引文显示为灰色，不能跳转。标记平时很淡，指向所在句子时才变亮。
- **复制不带出处标记**：选中文字复制、拖动选中的文字、单节复制和「复制全部」都不包含标记（`cleanCopyHandlers`、`stripSourceMarkers`，讨论面板同样适用）。

## 文献库 `LibraryView`

位于 `src/ui/library/LibraryView.tsx`，当前由 `src/ui/library/sample/SampleLibrary.tsx` 用示例数据驱动（`library.html`）。视图模型在 `src/ui/library/types.ts`。

- 查询状态是一个 `LibraryQuery`（集合、搜索文字与范围、标签、排序），界面通过 `onQuery(patch)` 修改。集合里有「已标星」。
- 列表连续滚动，不分页：逻辑层先传回一批 `papers` 和总数 `total`，列表滚到接近底部时调用 `onLoadMore()`，再把下一批追加到 `papers`。查询变化时从头加载。
- 列表显示方式（简洁 / 详细、显示哪些列、列宽）和左右两栏是否显示是 `LibraryViewPreferences`，通过 `onPrefs(patch)` 由逻辑层保存为偏好。`sidebarOpen` / `detailOpen` 不设时按窗口宽度自动决定。
- 其余都是动作回调：标星、改字段、标签、移动、移出、文件夹增改删、导入（PDF / CSL JSON / BibTeX）、导出引用。`onCreateFolder` 需要同步返回新文件夹的 id，界面随即进入改名。
- 拖动论文时 `dataTransfer` 里是 `application/x-paperpane-papers`（id 数组的 JSON），见 `src/ui/library/dragTypes.ts`。

## 修改与扩展

- 需要新组件或新的 prop：在 PR 里提出；不要在页面里另写一套样式相近的组件。
- 新增依赖在项目根目录统一管理；组件本身目前不依赖任何第三方 UI 库。
