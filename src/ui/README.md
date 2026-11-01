# 界面组件使用说明

适用于 `src/ui/components/` 与 `src/ui/reader/`（本文件随代码一起维护）

这份文档写给接合界面与逻辑的人：每个组件做什么、怎么调用、需要你提供哪些状态。视觉细节以代码和测试页为准。

## 测试页

构建后打开扩展的 `component-gallery.html`，左侧是组件目录，每个组件都有可以直接操作的示例，可切换浅色 / 深色。`?theme=light|dark` 可在任意页面强制主题，供审阅使用；正式的主题偏好由逻辑层保存，并在页面加载时调用 `applyTheme()`（`src/ui/theme.ts`）。

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
| `Select` | 下拉选择：按钮显示当前项，点开是菜单 | `options`（`value`、`label`、`shortLabel` 按钮上的短名、`group` 不同组之间画分隔线、`disabled`）、`value`、`onChange`、`label`、`placeholder`、`size`、`block` |
| `Stepper` | 一步一步调整的数值（− 值 +），方向键也能调 | `value`、`min`、`max`、`step`、`onChange`、`label`、`format` |
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

位于 `src/ui/reader/ReaderShell.tsx`，由 `src/runtime/reader-page.tsx` 的真实阅读器接合 PDF.js、数据和服务。视图模型在 `src/ui/reader/types.ts`。功能开发与验收都从真实 PDF 开始，步骤见根目录 README 的“阅读器开发入口”。

虚拟论文已移入 `src/ui/reader/sample/ArchivedReaderPage.tsx`，仅通过组件预览页的存档参数回看。不要继续在这里实现正式功能或把样例中的效果当作真实接合结果。讨论/概览等服务未接通时，允许通过真实阅读器的 `panels` 插槽提供明确标识的示例数据；保持正式阅读器、PDF 选区和锚点不变。

| prop | 说明 |
|---|---|
| `header` | 标题、来源、页数 |
| `outline`、`pageIndex`、`zoomPercent` | 目录、当前页（从 0 开始）、缩放 |
| `document` | 论文区内容；正式运行时挂载 PDF.js surface |
| `annotations`、`annotationStatus` | 批注列表与保存 / 同步状态 |
| `notes` | 笔记内容、`onChange`、保存 / 同步状态 |
| `initialLayout`、`onLayoutChange` | 停靠位置、宽高、是否显示标题；由逻辑层保存为偏好 |
| `onNavigate`、`onZoom(direction)`、`onZoomTo(percent)` | 跳页、按档位缩放、输入的百分比（界面已限制在 25–400） |
| `onHighlight(color, selection)`、`onSelectionAction(action, selection)` | 选区菜单的操作；`selection` 是选中时的快照，锚点由逻辑层生成 |
| `onLocateAnnotation(id)`、`onTool(tool)` | 定位批注、工具栏按钮 |
| `panels` | 可选。由页面提供的研究区面板内容，如 `{ discuss: <ChatPanel …/>, overview: <OverviewPanel …/> }`；没提供的面板显示占位。「引用」面板未完成，暂不出现在功能栏（`research-panels.ts`）。研究区拖到最宽后继续拖会铺满窗口，往回拖或双击边缘还原；「更多」菜单里也有「研究区铺满窗口」。批注列表里过长的引文和旁注会截短，可「展开全部」 |
| `library` | 可选。传入后工具栏标题旁出现收藏按钮，侧栏多一个「文献」页：`currentPaperId`、`folders`、`papers`、`recent`、`saved`、`entry`、`tags`，以及 `onSave(draft)`、`onRemove`、`onCreateFolder(parentId, name)`（返回新文件夹 id）、`onOpenPaper(id, newTab)`、`onImport(files)`、`onOpenLibrary` |

论文区的滚动容器是 `.pp-reader__paper`；外壳在它上面监听选区并显示选区菜单、绘制浮动滚动条。

## 阅读与批注的接口 `ReaderInteraction`

`ReaderShell` 的 `interaction` 由运行时提供（类型在 `src/ui/reader/types.ts`）。界面负责浮动菜单、评论便签和批注列表的外观与交互；选区捕获、点中已有高亮的判断、坐标和保存都在运行时。存档中的 `reader/sample/useSampleReader.tsx` 仅是同接口的历史示例；正式功能使用 `src/document/reader/pdfjs-reader.ts` 和 `src/runtime/reader-page.tsx`。

- `onScrollContainer(el)`：论文滚动容器挂载后交给运行时，viewer 挂在里面，选区也在这里监听。不要修改它的样式和内边距。
- `menuTarget`：浮动菜单对谁显示。`{ kind: 'selection', id, text, rects }` 是新选区；`{ kind: 'annotation', annotationId, rects }` 是点中的已有高亮。`rects` 是窗口坐标，每行一个。关闭（Esc、点别处、滚动）时外壳调用 `onDismissMenu`。
- `tool` / `onToolChange`：`'auto-highlight'` 时，选完文字由运行时立即用上一次的颜色创建高亮，并把 `menuTarget` 设为这条新高亮。
- 新选区：选颜色调用 `onCreateHighlight(id, color)`；"评论"调用不带颜色的 `onCreateHighlight(id)`（用上一次的颜色），外壳随即打开这条高亮的评论便签；翻译、解释、提问、复制调用 `onSelectionAction`。
- 已有高亮：菜单和新选区相同（翻译、解释、提问走 `onAnnotationAction`，复制由界面完成），另有当前颜色和删除；改色 `onAnnotationColor`，评论 `onAnnotationComment`（便签和批注列表都会调用），删除 `onAnnotationDelete`，删除后的「撤销」调用 `onAnnotationRestore`。
- `annotationRects(id)`：这条批注现在在屏幕上的位置（窗口坐标），便签定位和画虚线连接时读取；页面未渲染时返回 null。
- `subscribeGeometry(listener)`：批注位置可能变化时通知（页面渲染完成、缩放、旋转、重排），便签据此重新定位；建议直接接 `AnchorService.subscribeProjection`。
- `onAnnotationComment`：便签每次输入都会立即调用，不做延迟；由运行时持有草稿、合并写入，并在关闭或切换文档时写完。
- 旁注便签（界面用语「旁注」，代码里仍叫 comment）放在滚动容器里、钉在原文旁边，随论文滚动和缩放；可以拖动、调大小、收起成标题小条、关闭后再打开（保持原位置）。标题就是旁注的第一行。便签所在的层带 `data-pp-overlay`，运行时捕获选区和点击时应忽略来自这里的事件。
- 论文上的浮窗（旁注便签、选区解释、选区翻译）属于论文：相对原文的偏移和自身大小按放置时的缩放保存，显示时整体乘以「当前缩放 / 放置时缩放」，所以缩放、停靠译文栏、改窗口大小都不会改变它相对论文的位置和大小。三种尺寸的分工：PDF 缩放决定浮窗整体的比例；界面缩放（`uiScale`）决定浮窗的设计尺寸；插件内容字号只改变浮窗里文字的大小。拖动范围是论文宽度的一定比例（`floatingMargin`），同样随缩放变化。`PassageWindow` 不传 `zoomPercent` 时按页面实际宽度推算缩放。连接虚线只在指针悬停或键盘聚焦时显示。
- `noteLayouts` / `onNoteLayouts(layouts)`：便签的布局由运行时持有并随论文保存，下次打开时原样交回。每项是 `NoteLayout { id, dx, dy, width, height, collapsed, open, z }`：`id` 是批注 id；`(dx, dy)` 是便签相对原文第一行左上角的偏移（CSS 像素）；`open: false` 表示已关闭但保留位置；`z` 是叠放顺序。外壳每次拖动、缩放、收起、关闭、打开都会交回整组新值（拖动过程中会连续调用，写入请自行合并）。批注被彻底删除时，由运行时一并去掉对应布局；撤销删除时保留。
- `rotation` / `onRotate(rotation)`：页面旋转，`0 | 90 | 180 | 270`，作用于所有页面（对应 PDF.js 的 `pagesRotation`）。工具栏按钮每次顺时针转 90°，旋转后按钮保持标记，右键或「更多」菜单里可以恢复。旋转后请通知 `subscribeGeometry`。
- 查找：`search` 是当前状态 `{ query, matchCase, wholeWord, status: 'idle' | 'searching' | 'done', total, current }`（`current` 从 1 开始，没有结果为 0）。查找栏随输入调用 `onSearch(query, { matchCase, wholeWord })`，Enter / Shift+Enter 和上下按钮调用 `onSearchStep(1 | -1)`，关闭时调用 `onSearchClose()`（清除页面上的标记，保留上次的查询词）。⌘F / Ctrl+F 或 F3 打开查找栏（有选中文字时用它作查询词），⌘G / ⌘⇧G、F3 / ⇧F3 跳到下一个 / 上一个。工具栏一级是「框选提问」，查找放在「更多」里并标出快捷键。运行时负责搜索文本层、标记全部结果并把当前结果滚到视野里；对应 PDF.js 的 `find` / `findagain` 事件和 `updatefindmatchescount`、`updatefindcontrolstate`。页面上的标记颜色已在界面定义：`.textLayer .highlight` 和 `.highlight.selected`（`--pp-find-match`、`--pp-find-current`）。
- PDF 页面的外观（纸张、阴影、页间距、深色模式减光）由界面在 `.pp-pdf-surface .page` 上定义。高亮色点（`--pp-hl-*-dot`）与页面高亮（`--pp-hl-*-fill`，与 PDF.js 使用的颜色一致）同色相。

## 讨论面板 `ChatPanel`

位于 `src/ui/reader/chat/`，视图模型在 `chat/types.ts`，与 PR #7 的会话契约一一对应；示例接线是 `reader/sample/SampleChat.tsx`。解释面板以后复用同一组件（`title="解释"`，用 `source` 显示被解释的段落或截图）。

- 逻辑层把 `visibleMessages(session)` 映射成 `messages`；每条消息的 `version` 来自 `messageVersions`（第几个 / 共几个），`onVersion(id, ±1)` 由逻辑层用 `latestLeaf` + `selectBranch` 切换。
- 出处：回答正文里写 `[^label]`，显示为和概览相同的淡色小数字（`SourceMarker`，按出现顺序编号），悬停看原文，点击 `onLocate(citation)` 跳回原文。不再单独列出页码按钮。
- 生成状态 `generation` 决定界面：排队、生成中（输入框的发送按钮变成停止）、已停止、被中断、失败、保存失败，各自带恢复按钮，`onRecover(id, action)`。
- 对话切换、重命名、删除都在标题旁的下拉里（`ChatSessions`）。快捷问题和推荐追问点一下只填进输入框，由读者决定是否发送。
- 换到另一家供应商的模型：`onModel` 之后，逻辑层返回的确认信息传给 `modelChange`；界面不再弹窗，直接调用 `onConfirmModelChange`（换模型是聊天里的日常操作）。
- 输入框是浮在对话末尾的玻璃条，可拖动上沿调整高度（双击恢复自动）。模型右侧是思考强度（`ModelView.reasoningLevels` 非空时显示，`onReasoning` 设置当前对话的 `reasoning`）；模型能看图且传了 `onCaptureRegion` 时，左侧有框选论文区域的按钮。

## 概览面板 `OverviewPanel`

位于 `src/ui/reader/overview/`，示例接线是 `reader/sample/SampleOverview.tsx`。研究区各面板整体是不透明的阅读底色（`--pp-reading-surface`），标题栏做得矮而安静；只有右侧功能栏是玻璃，两者以一条细线相接。内容放在共用的 `PanelBody` 里，依次是：开头一两句概括，然后是关键词、结构化摘要、要点（段首加粗的短标题 + 说明）。每部分可以折叠，折叠后只留一行摘要；操作在悬停时出现。

- 卡片定义 `OverviewCardDef`（名称、提示词、输出形式：文本 / 列表 / 结构化；列表用 `listStyle` 显示为条目（每条可带加粗短标题）或标签（一排短词）；`display: 'lead'` 的文本卡作为开头）是用户的全局设置。目前从面板「…」菜单的「管理概览内容…」打开设置对话框 `OverviewSettings`：左侧卡片列表（拖动排序、开关显示、添加），右侧依次编辑名称、提示词、输出形式（说明在鼠标悬停标签文字时出现，`HintLabel`）；结构化卡片用字段列表编辑（名称 + 给模型的说明），自动生成 JSON Schema，也可直接编辑 Schema。新卡片起初不显示错误，离开空字段或点「保存」时才提示并跳到需要补充的卡片。修改在对话框里暂存，点「保存」后通过 `onSaveCards(cards)` 一次交给逻辑层；新卡片的 id 以 `new:` 开头。以后放进设置页时可以直接复用。
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
- **导入**：`imports?: LibraryImports` 传入后，导入菜单多一项「从网址导入 PDF…」（对话框里填链接，`onImportUrl(url, folderId)` 返回错误文字或 null），导入按钮左侧出现任务按钮：进行中显示转圈和数量，结束后显示完成或失败；点开是任务浮层，按最新在前列出 `jobs`，可取消、重试、输入 PDF 密码。有新任务加入时浮层自动打开。示例接线是 `library/sample/useSampleImports.ts`（文件名含 locked 需要密码 1234，含 fail 会失败）。

## 设置 `SettingsView` 与快速设置

位于 `src/ui/settings/`，视图模型在 `settings/types.ts`，按设置接口草案 v0.1 对应；示例接线是 `settings/sample/useSampleSettings.ts`（偏好和配置存在 localStorage，设置页与阅读器之间同步，仅作演示）。

- **两类设置**：
  - 偏好 `Preferences`（主题、界面语言、回答语言、正文字号、深色减光、公式复制格式）：每项改了立即生效，调用 `onPreference(key, value)`，由逻辑层单字段保存并同步到其他标签页；保存失败时 `PreferencesState.local = 'failed'`，界面提示并可重试。
  - 配置 `SettingsView`（模型服务、模型、默认模型、功能路由、提示词、运行参数、同步）：设置页编辑一份草稿，所有节共用，切换节不会丢；保存条整体调用 `onSave(draft, baseRevision)`（模型二级页把同一组件放在顶部玻璃操作栏，其余页面继续使用底部保存条），按 `SaveSettingsResult` 显示成功、需要修改（`problems` 的 `path` 对应到字段）、冲突（保留草稿，用户选择载入最新或覆盖）、失败。
- **密钥**：快照只有 `hasKey` / `hasPassword`；草稿里用 `SecretEdit`（keep / clear / replace）。`toDraft(view)` 把快照转成草稿，所有密钥初始为 keep。
- **外观的应用**：`applyAppearance()`（`src/ui/theme.ts`）设置主题、`--pp-read-scale` 和页面减光。正文字号只作用于批注、笔记、概览和回答正文（`--pp-text-read*`），不缩放工具栏，也不改变 PDF 缩放。
- **节**：`SettingsSection` = general / models / features / sync / advanced / privacy；设置页地址的 `#models` 等直达对应一节。目前完成了通用和高级，其余几节下一步做。
- **状态行** `StatusLine`：保存、同步、模型三种状态，设置页、阅读器快速设置和扩展弹窗共用，数据来自 `StatusSummary`。
- **返回与导出**：`ReaderShell` 的 `onBack` 在工具栏最左边显示「返回文献库」；`exports`（`{ id, label, disabled? }[]`）让工具栏的导出按钮（窄窗口时在「更多」里）弹出导出菜单，选择后调用 `onExport(id)`。不传 `exports` 时导出按钮仍调用 `onTool('export')`。
- **阅读器快速设置**：`ReaderShell` 的 `settings` prop（`ReaderSettingsProps`），工具栏设置按钮弹出：主题、正文字号、深色减光、回答语言、默认模型，加状态行和「全部设置…」。默认模型调用 `onDefaultModel(id)`，对应逻辑层的 `setDefaultModel(modelId, baseRevision)` 单项原子命令；不传 `settings` 时按钮仍调用 `onTool('settings')`。

## 扩展弹窗 `PopupView`

位于 `src/ui/popup/`，视图模型在 `popup/types.ts`；示例接线是 `popup/sample/SamplePopup.tsx`，`popup.html?state=pdf|local|checking|not-pdf|restricted|file-access|in-reader` 切换当前标签页的几种情况。

- 浅灰磨砂底配白色圆角卡片，与阅读器同一套风格；弹窗是独立小窗口，背后没有可模糊的内容，磨砂感用顶部的柔光渐变表现。宽 340px，高度随内容。
- **当前页面**：`activeTab: ActiveTabView | null`（null 表示正在识别）。可打开时显示首页缩略、标题、`displayUrl`（不含查询参数）和「在纸窗中打开」→ `onOpenInReader(tabId)`；不能打开时按 `block` 说明原因：`not-pdf`、`restricted`、`file-access`（附「打开扩展详情」→ `onAllowFileAccess`）、`in-reader`。`inLibrary` 为真时标「已在文献库」。
- **自动打开 PDF**：一个开关，`autoOpenPdf` / `onAutoOpenPdf`。
- **继续阅读**：`recent` 最多 3 篇，`onOpenRecent(id)`。
- **状态行**：与设置页共用 `StatusLine`（单行），点击跳到设置的对应一节。
- **底部**：文献库 `onOpenLibrary`、打开文件 `onOpenFile`（弹窗里直接选文件会让弹窗关闭，所以交给阅读器页弹出文件选择）、设置 `onOpenSettings(section?)`。

## 译文栏（演示阶段）

位于 `src/ui/reader/translation/`。`ReaderShell` 的 `translation={ open, onToggle, pane }` 提供后，工具栏出现「译文」按钮。两种方式，由译文栏标题上的按钮切换（`translation/dock.ts` 的上下文传给面板）：

- 顶部按状态只放一个全文操作：还有未翻译的页时是「翻译全文」，暂停或失败时是「继续翻译」，全部译完后换成「重新翻译全文」图标；译文栏窄时只显示图标。公式、图表处显示「查看原文」。
- 停靠（默认）：在论文与研究区之间、从上到下通顶，默认宽 360px，左边缘可拖动调宽、双击恢复；论文、工具栏、查找栏随之左移（`--pp-edge-right` 已包含译文栏）。放不下时左侧边栏先收起。
- 悬浮：一张浮在论文上的卡片，按住标题栏拖动，四边和四角都能调大小；工具栏和论文恢复原位。

- `TranslationPane`：按页流式排列译文（每页一行淡页码），标题、正文、公式标签（公式不翻译，点按回原文）、图注；「译文 / 对照」切换，对照时每句上方是灰色原句；「跟随阅读」开关；未翻译的页显示「翻译这一页」，翻译中逐字出现。
- 联动：`activeId` + `onHover` 让同一句在两边同时标出（论文里用 CSS highlight `pp-trans`，颜色 `--pp-trans-link`）；`onLocate` 跳回原文；`reveal` 让译文栏滚到某句（点论文、跟随阅读）。
- 示例接线：`reader/sample/useSampleTranslation.tsx`，示例译文在 `sample/sampleTranslation.ts`。视图模型 `translation/types.ts` 只是演示用，正式契约待确认。

## 修改与扩展

- 需要新组件或新的 prop：在 PR 里提出；不要在页面里另写一套样式相近的组件。
- 新增依赖在项目根目录统一管理；组件本身目前不依赖任何第三方 UI 库。

- `onAnnotationCommentDelete`：仅删除评论须等待保存成功，再返回绑定该次删除修订号的撤销函数；失败返回 null，不显示成功提示。撤销不得通过普通输入回调覆盖后来的编辑。
