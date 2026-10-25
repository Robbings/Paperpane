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
| `Menu` | 下拉 / 右键菜单 | `entries`（普通项、勾选项、分隔线）、`anchor`（坐标）、`align`、`triggerRef`、`onSelect`、`onClose` |
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
| `Pagination` | 分页与每页条数 | `page`（从 1 开始）、`pageSize`: 10 / 20 / 50 / 100、`total`、`onPage`、`onPageSize` |

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

- `tone`: neutral / success / warning / error。错误默认不自动消失，其余 3.5 秒（带操作时 6 秒），鼠标停留时暂停。
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
| `library` | 可选。传入后工具栏标题旁出现收藏按钮，侧栏多一个「文献」页：`currentPaperId`、`folders`、`papers`、`recent`、`saved`、`entry`、`tags`，以及 `onSave(draft)`、`onRemove`、`onOpenPaper(id, newTab)`、`onImport(files)`、`onOpenLibrary` |

论文区的滚动容器是 `.pp-reader__paper`；外壳在它上面监听选区并显示选区菜单、绘制浮动滚动条。

## 文献库 `LibraryView`

位于 `src/ui/library/LibraryView.tsx`，当前由 `src/ui/library/sample/SampleLibrary.tsx` 用示例数据驱动（`library.html`）。视图模型在 `src/ui/library/types.ts`。

- 查询状态是一个 `LibraryQuery`（集合、搜索文字与范围、只看星标、标签、排序、分页），界面通过 `onQuery(patch)` 修改，逻辑层查询后传回当前页 `papers` 和 `total`。
- 列表显示方式（简洁 / 详细、显示哪些列、列宽）是 `LibraryViewPreferences`，通过 `onPrefs(patch)` 由逻辑层保存为偏好。
- 其余都是动作回调：标星、改字段、标签、移动、移出、文件夹增改删、导入（PDF / CSL JSON / BibTeX）、导出引用。`onCreateFolder` 需要同步返回新文件夹的 id，界面随即进入改名。
- 拖动论文时 `dataTransfer` 里是 `application/x-paperpane-papers`（id 数组的 JSON），见 `src/ui/library/dragTypes.ts`。

## 修改与扩展

- 需要新组件或新的 prop：在 PR 里提出；不要在页面里另写一套样式相近的组件。
- 新增依赖在项目根目录统一管理；组件本身目前不依赖任何第三方 UI 库。
