import { TranslationDemo } from './TranslationDemo';
import { OnboardingDemo } from './OnboardingDemo';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  EmptyState,
  GlassSurface,
  Icon,
  IconButton,
  Kbd,
  Menu,
  Popover,
  ProgressBar,
  SaveStatus,
  Segmented,
  SelectionMenu,
  Skeleton,
  Spinner,
  Switch,
  TextArea,
  TextField,
  Toaster,
  Tooltip,
  highlightColors,
  iconNames,
  toast,
  type HighlightColor,
  type LocalSaveState,
  type MenuEntry,
  type SelectionMenuAction,
  type SyncState,
} from '@/ui/components';
import { applyTheme, type ThemeMode } from '@/ui/theme';
import './ComponentGallery.css';

// Component test page: component-gallery.html. Every demo here runs on
// local sample state; nothing is stored.

const sections = [
  ['tokens', '颜色与材质'],
  ['buttons', '按钮'],
  ['tooltip', '浮层提示'],
  ['popover', '弹出层与菜单'],
  ['dialog', '对话框'],
  ['toast', '轻提示'],
  ['forms', '表单'],
  ['progress', '进度与加载'],
  ['empty', '空状态'],
  ['badges', '徽标与快捷键'],
  ['selection', '选区菜单'],
  ['status', '保存状态'],
  ['translation', '翻译引擎'],
  ['onboarding', '首次使用'],
  ['icons', '图标'],
] as const;

type SectionId = (typeof sections)[number][0];

const themeOptions = [
  { value: 'system', label: '跟随系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
] as const;

const colorTokens = [
  ['窗口', '--pp-window'],
  ['论文底', '--pp-ground'],
  ['正文', '--pp-text'],
  ['次要文字', '--pp-text-2'],
  ['强调', '--pp-accent'],
  ['强调浅底', '--pp-accent-soft'],
  ['选区', '--pp-selection'],
  ['分隔线', '--pp-hairline-strong'],
] as const;

const newSelectionActions: readonly SelectionMenuAction[] = [
  { id: 'comment', label: '旁注', icon: 'comment' },
  { id: 'translate', label: '翻译', icon: 'translate' },
  { id: 'explain', label: '解释', icon: 'explain' },
  { id: 'ask', label: '提问', icon: 'ask' },
  { id: 'copy', label: '复制', icon: 'copy' },
];

const highlightActions: readonly SelectionMenuAction[] = [
  { id: 'comment', label: '旁注', icon: 'comment' },
  { id: 'explain', label: '解释', icon: 'explain' },
  { id: 'copy', label: '复制', icon: 'copy' },
];

const statusSamples: readonly [LocalSaveState, SyncState][] = [
  ['saved', 'unconfigured'],
  ['saving', 'pending'],
  ['saved', 'syncing'],
  ['saved', 'synced'],
  ['saved', 'failed'],
  ['failed', 'pending'],
  ['unmodified', 'conflict'],
];

const menuEntries: MenuEntry[] = [
  { id: 'md', label: '复制为 Markdown', icon: 'copy' },
  { id: 'csv', label: '下载 CSV', icon: 'export' },
  { kind: 'separator', id: 'sep' },
  { id: 'quotes', label: '包含原文摘录', checked: true },
  { id: 'disabled', label: '导出为 PDF（未开放）', disabled: true },
];

const swatch = (variable: string) => ({ background: `var(${variable})` }) as CSSProperties;

function Section({ id, title, note, children }: { id: SectionId; title: string; note?: string; children: ReactNode }) {
  return (
    <GlassSurface as="section" tone="panel" radius="panel" className="gallery__card" id={`gallery-${id}`} aria-labelledby={`gallery-${id}-title`}>
      <header className="gallery__card-head">
        <h2 id={`gallery-${id}-title`} className="gallery__card-title">
          {title}
        </h2>
        {note && <p className="gallery__card-note">{note}</p>}
      </header>
      {children}
    </GlassSurface>
  );
}

function Demo({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="gallery__demo">
      <span className="gallery__demo-label">{label}</span>
      <div className="gallery__demo-body">{children}</div>
    </div>
  );
}

export function ComponentGallery() {
  const [theme, setTheme] = useState<ThemeMode>(() => { const theme = new URLSearchParams(location.search).get('theme'); return theme === 'light' || theme === 'dark' ? theme : 'system'; });
  useEffect(() => applyTheme(theme), [theme]);

  return (
    <div className="gallery">
      <GlassSurface as="nav" tone="panel" radius="panel" className="gallery__nav" aria-label="组件目录">
        <p className="gallery__brand">Paperpane 组件</p>
        <Segmented label="主题" options={themeOptions} value={theme} onChange={setTheme} size="sm" stretch />
        <ol className="gallery__nav-list">
          {sections.map(([id, title]) => (
            <li key={id}>
              <a href={`#gallery-${id}`}>{title}</a>
            </li>
          ))}
        </ol>
      </GlassSurface>

      <main className="gallery__main">
        <TokensSection />
        <ButtonsSection />
        <TooltipSection />
        <PopoverSection />
        <DialogSection />
        <ToastSection />
        <FormsSection />
        <ProgressSection />
        <EmptySection />
        <BadgesSection />
        <SelectionSection />
        <StatusSection />
        <Section id="translation" title="翻译引擎" note="全文与选区可以用不同的引擎；换引擎不清掉已翻译的页。">
          <TranslationDemo />
        </Section>
        <Section id="onboarding" title="首次使用" note="欢迎弹窗只出现一次；配置引导从 popup、欢迎弹窗或设置侧栏进入。">
          <OnboardingDemo />
        </Section>
        <IconsSection />
      </main>
      <Toaster top={16} />
    </div>
  );
}

function TokensSection() {
  return (
    <Section id="tokens" title="颜色与材质">
      <div className="gallery__colors">
        {colorTokens.map(([label, variable]) => (
          <div key={variable} className="gallery__color">
            <span className="gallery__chip" style={swatch(variable)} />
            <span>{label}</span>
            <code>{variable}</code>
          </div>
        ))}
        {highlightColors.map((color) => (
          <div key={color} className="gallery__color">
            <span className="gallery__chip" style={swatch(`--pp-hl-${color}-dot`)} />
            <span>高亮 · {color}</span>
            <code>{`--pp-hl-${color}`}</code>
          </div>
        ))}
      </div>
      <div className="gallery__material">
        <p className="gallery__paper">
          PDF does not guarantee a reading order: a file may draw the second column before the first, or place a caption
          between two halves of a paragraph.{' '}
          <mark style={{ background: 'var(--pp-hl-yellow-fill)' }}>Coordinates must survive zoom and rotation.</mark>
        </p>
        <GlassSurface tone="float" radius="float" className="gallery__glass-sample">
          <strong>玻璃浮层</strong>
          <span>压在论文上时可以看到模糊</span>
        </GlassSurface>
        <div className="gallery__solid-sample">
          <strong>不透明面板</strong>
          <span>长文本区域使用</span>
        </div>
      </div>
    </Section>
  );
}

function ButtonsSection() {
  const [tab, setTab] = useState<'thumbs' | 'outline'>('outline');
  const [filter, setFilter] = useState<'all' | 'highlight' | 'comment'>('all');
  const [busy, setBusy] = useState(false);
  return (
    <Section id="buttons" title="按钮" note="悬停图标按钮可以看到新的浮层提示；键盘 Tab 聚焦时提示立即出现。">
      <Demo label="文字按钮">
        <Button variant="primary">添加 PDF</Button>
        <Button>取消</Button>
        <Button variant="quiet" icon="export">
          导出
        </Button>
        <Button variant="danger" icon="trash">
          删除
        </Button>
        <Button disabled>不可用</Button>
        <Button
          variant="primary"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            window.setTimeout(() => setBusy(false), 1500);
          }}
        >
          {busy ? (
            <span className="gallery__inline">
              <Spinner size={12} /> 处理中
            </span>
          ) : (
            '点我看处理中'
          )}
        </Button>
      </Demo>
      <Demo label="小号 / 胶囊">
        <Button size="sm" shape="pill" icon="plus">
          新建
        </Button>
        <Button size="sm" variant="primary" shape="pill">
          重试
        </Button>
      </Demo>
      <Demo label="图标按钮">
        <IconButton icon="search" label="查找" shortcut="⌘F" />
        <IconButton icon="marker" label="自动高亮" active />
        <IconButton icon="region" label="框选图像" />
        <IconButton icon="dockBottom" label="研究区移到下方" shape="pill" />
        <IconButton icon="settings" label="设置（不可用）" disabled />
      </Demo>
      <Demo label="分段控件">
        <Segmented
          label="左侧栏"
          options={[
            { value: 'thumbs', label: '缩略图' },
            { value: 'outline', label: '目录' },
          ]}
          value={tab}
          onChange={setTab}
        />
        <Segmented
          label="批注筛选"
          size="sm"
          options={[
            { value: 'all', label: '全部' },
            { value: 'highlight', label: '高亮' },
            { value: 'comment', label: '旁注' },
          ]}
          value={filter}
          onChange={setFilter}
        />
      </Demo>
    </Section>
  );
}

function TooltipSection() {
  return (
    <Section id="tooltip" title="浮层提示" note="靠近窗口边缘时会自动翻到另一侧。">
      <Demo label="四个方向">
        {(['top', 'bottom', 'left', 'right'] as const).map((placement) => (
          <Tooltip key={placement} label={`提示在${{ top: '上方', bottom: '下方', left: '左侧', right: '右侧' }[placement]}`} placement={placement}>
            <Button size="sm">{placement}</Button>
          </Tooltip>
        ))}
      </Demo>
      <Demo label="带快捷键">
        <IconButton icon="search" label="在论文中查找" shortcut="⌘F" />
        <IconButton icon="copy" label="复制" shortcut="⌘C" />
      </Demo>
      <Demo label="文字上的说明">
        <Tooltip label="引用次数来自学术数据库，可能有几天延迟。">
          <span className="gallery__dotted" tabIndex={0}>
            被引 128 次
          </span>
        </Tooltip>
      </Demo>
    </Section>
  );
}

function PopoverSection() {
  const popoverAnchor = useRef<HTMLButtonElement>(null);
  const menuAnchor = useRef<HTMLButtonElement>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  return (
    <Section id="popover" title="弹出层与菜单" note="Esc 或点击外部关闭；弹出层关闭时焦点回到按钮。">
      <Demo label="弹出层">
        <Button ref={popoverAnchor} onClick={() => setPopoverOpen((open) => !open)} aria-expanded={popoverOpen}>
          [12] 引用预览
        </Button>
        <Popover anchorRef={popoverAnchor} open={popoverOpen} onClose={() => setPopoverOpen(false)} label="引用预览" width={340}>
          <div className="gallery__cite">
            <span className="gallery__cite-meta">示例 · 2024 · Conference Proceedings</span>
            <strong>Layout-Aware Reading Order for Scientific Documents</strong>
            <span className="gallery__cite-meta">A. Author, B. Author</span>
            <div className="gallery__inline">
              <Badge tone="ok">已匹配</Badge>
              <Badge>被引 128</Badge>
            </div>
            <div className="gallery__inline">
              <Button size="sm" variant="primary">
                打开 PDF
              </Button>
              <Button size="sm">加入文献库</Button>
            </div>
          </div>
        </Popover>
      </Demo>
      <Demo label="菜单">
        <Button
          ref={menuAnchor}
          icon="export"
          onClick={() => {
            const box = menuAnchor.current?.getBoundingClientRect();
            if (box) setMenu(menu ? null : { x: box.left, y: box.bottom + 6 });
          }}
        >
          导出批注
        </Button>
        {menu && (
          <Menu
            label="导出批注"
            entries={menuEntries}
            anchor={menu}
            triggerRef={menuAnchor}
            onSelect={(id) => toast.show({ message: `菜单项：${id}` })}
            onClose={() => setMenu(null)}
          />
        )}
      </Demo>
    </Section>
  );
}

function DialogSection() {
  const [open, setOpen] = useState<null | 'delete' | 'password' | 'provider' | 'conflict'>(null);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const close = () => setOpen(null);

  return (
    <Section id="dialog" title="对话框" note="打开时背后页面不可操作，焦点留在对话框内；关闭后回到触发按钮。">
      <Demo label="常见用法">
        <Button variant="danger" icon="trash" onClick={() => setOpen('delete')}>
          删除批注
        </Button>
        <Button
          icon="lock"
          onClick={() => {
            setPassword('');
            setPasswordError(undefined);
            setOpen('password');
          }}
        >
          加密 PDF
        </Button>
        <Button icon="discuss" onClick={() => setOpen('provider')}>
          切换供应商
        </Button>
        <Button onClick={() => setOpen('conflict')}>保存冲突（不可直接关闭）</Button>
      </Demo>

      <Dialog
        open={open === 'delete'}
        onClose={close}
        title="删除这条批注？"
        description="高亮和它的旁注会一起删除。删除后几秒内可以撤销。"
        footer={
          <>
            <Button onClick={close}>取消</Button>
            <Button
              variant="primary"
              onClick={() => {
                close();
                toast.show({ message: '已删除 1 条批注', action: { label: '撤销', onAction: () => toast.show({ message: '已恢复', tone: 'success' }) } });
              }}
            >
              删除
            </Button>
          </>
        }
      />

      <Dialog
        open={open === 'password'}
        onClose={close}
        title="这个 PDF 需要密码"
        description="密码只用于本次打开，不会保存。示例密码：paper"
        footer={
          <>
            <Button onClick={close}>取消</Button>
            <Button
              variant="primary"
              type="submit"
              form="gallery-password"
              disabled={!password}
            >
              打开
            </Button>
          </>
        }
      >
        <form
          id="gallery-password"
          onSubmit={(event) => {
            event.preventDefault();
            if (password === 'paper') {
              close();
              toast.show({ message: '已解锁', tone: 'success' });
            } else {
              setPasswordError('密码不正确，请重试。');
            }
          }}
        >
          <TextField
            label="密码"
            type="password"
            icon="lock"
            value={password}
            onChange={(value) => {
              setPassword(value);
              setPasswordError(undefined);
            }}
            error={passwordError}
            autoFocus
          />
        </form>
      </Dialog>

      <Dialog
        open={open === 'provider'}
        onClose={close}
        size="md"
        title="切换到另一个模型供应商？"
        description="继续这段讨论时，之前的对话会一并发送给新的供应商，以便它理解上下文。"
        footer={
          <>
            <Button onClick={close}>保持当前模型</Button>
            <Button variant="primary" onClick={close}>
              切换并发送历史
            </Button>
          </>
        }
      >
        <dl className="gallery__facts">
          <dt>将发送给</dt>
          <dd>示例接口 · api.example.com</dd>
          <dt>发送内容</dt>
          <dd>12 条消息、2 张框选截图、论文第 1–8 页的引用片段</dd>
        </dl>
      </Dialog>

      <Dialog
        open={open === 'conflict'}
        onClose={close}
        dismissible={false}
        size="md"
        title="笔记在另一台设备上也被修改了"
        description="两个版本都已保留。请选择一个继续，或稍后在笔记里手动合并。"
        footer={
          <>
            <Button onClick={close}>保留两版，稍后合并</Button>
            <Button variant="primary" onClick={close}>
              使用本机版本
            </Button>
          </>
        }
      />
    </Section>
  );
}

function ToastSection() {
  return (
    <Section id="toast" title="轻提示" note="出现在页面顶部，鼠标停留时暂停计时；错误提示要手动关闭。逻辑代码也可以直接调用 toast.show()。">
      <Demo label="类型">
        <Button onClick={() => toast.show({ message: '已复制到剪贴板' })}>普通</Button>
        <Button onClick={() => toast.show({ message: '笔记已保存到本机', tone: 'success' })}>成功</Button>
        <Button onClick={() => toast.show({ message: '同步暂停：WebDAV 服务器暂时无法连接', tone: 'warning' })}>警告</Button>
        <Button
          onClick={() =>
            toast.show({ message: '翻译失败：请求超时', tone: 'error', action: { label: '重试', onAction: () => toast.show({ message: '已重新提交' }) } })
          }
        >
          错误（带重试）
        </Button>
        <Button
          onClick={() =>
            toast.show({ message: '已删除 3 条批注', action: { label: '撤销', onAction: () => toast.show({ message: '已恢复 3 条批注', tone: 'success' }) } })
          }
        >
          撤销
        </Button>
      </Demo>
    </Section>
  );
}

function FormsSection() {
  const [disabled, setDisabled] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('https://dav.example.com/paperpane');
  const [comment, setComment] = useState('');
  const [prompt, setPrompt] = useState('用三句话说明这篇论文解决了什么问题、用了什么方法、得到了什么结论。');
  const [sync, setSync] = useState(true);
  const [autoTranslate, setAutoTranslate] = useState(false);
  const [rows, setRows] = useState([true, false, true]);
  const all = rows.every(Boolean);
  const some = rows.some(Boolean);

  return (
    <Section id="forms" title="表单">
      <Switch checked={disabled} onChange={setDisabled} label="演示：禁用下面的输入" />
      <div className="gallery__form-grid">
        <TextField label="接口名称" value={name} onChange={setName} placeholder="例如：我的 OpenAI 兼容接口" disabled={disabled} />
        <TextField
          label="WebDAV 地址"
          value={url}
          onChange={setUrl}
          icon="upload"
          clearable
          description="只用于同步你的论文与笔记。"
          error={url && !url.startsWith('https://') ? '请使用 https:// 开头的地址。' : undefined}
          disabled={disabled}
        />
        <TextArea label="旁注" value={comment} onChange={setComment} placeholder="写下你的想法……" rows={2} maxRows={6} disabled={disabled} />
        <TextArea label="提示词" value={prompt} onChange={setPrompt} maxLength={300} rows={3} description="会自动长高，超过上限后滚动。" disabled={disabled} />
      </div>
      <div className="gallery__toggles">
        <Switch checked={sync} onChange={setSync} label="自动同步" description="修改后自动上传到 WebDAV。" disabled={disabled} />
        <Switch checked={autoTranslate} onChange={setAutoTranslate} label="滚动时自动翻译" description="会持续调用翻译接口。" disabled={disabled} />
      </div>
      <div className="gallery__toggles">
        <Checkbox
          checked={all}
          indeterminate={some && !all}
          onChange={(checked) => setRows(rows.map(() => checked))}
          label="全选"
          disabled={disabled}
        />
        {['Attention Is All You Need', 'Deep Residual Learning', 'Retrieval-Augmented Generation'].map((title, index) => (
          <Checkbox
            key={title}
            checked={rows[index] ?? false}
            onChange={(checked) => setRows(rows.map((value, i) => (i === index ? checked : value)))}
            label={title}
            description="示例论文"
            disabled={disabled}
          />
        ))}
      </div>
    </Section>
  );
}

function ProgressSection() {
  const [value, setValue] = useState(0.35);
  return (
    <Section id="progress" title="进度与加载" note="只有逻辑层能算出真实进度时才显示数字，否则用不确定进度。">
      <Demo label="确定进度">
        <div className="gallery__wide">
          <ProgressBar value={value} label="提取文字" detail={`第 ${Math.round(value * 30)} / 30 页`} />
        </div>
        <Button size="sm" onClick={() => setValue((v) => Math.max(0, v - 0.1))}>
          −10%
        </Button>
        <Button size="sm" onClick={() => setValue((v) => Math.min(1, v + 0.1))}>
          +10%
        </Button>
      </Demo>
      <Demo label="不确定进度">
        <div className="gallery__wide">
          <ProgressBar label="读取文件" detail="正在读取文件…" />
        </div>
      </Demo>
      <Demo label="转圈">
        <Spinner />
        <Spinner size={20} label="加载中" />
      </Demo>
      <Demo label="加载占位">
        <div className="gallery__skeletons">
          <Skeleton height={72} width={56} />
          <div className="gallery__wide">
            <Skeleton lines={3} />
          </div>
        </div>
      </Demo>
    </Section>
  );
}

function EmptySection() {
  return (
    <Section id="empty" title="空状态">
      <div className="gallery__empties">
        <EmptyState
          icon="marker"
          title="还没有批注"
          description="选中论文里的文字，就可以高亮或写旁注。"
        />
        <EmptyState
          icon="alert"
          tone="danger"
          title="这个文件无法打开"
          description="文件可能已损坏，或不是 PDF。"
          actions={
            <>
              <Button size="sm">重新选择文件</Button>
              <Button size="sm" variant="quiet">
                查看详情
              </Button>
            </>
          }
        />
      </div>
    </Section>
  );
}

function BadgesSection() {
  return (
    <Section id="badges" title="徽标与快捷键">
      <Demo label="徽标">
        <Badge>草稿</Badge>
        <Badge tone="accent">视觉</Badge>
        <Badge tone="ok">已同步</Badge>
        <Badge tone="warn">演示</Badge>
        <Badge tone="danger">失败</Badge>
      </Demo>
      <Demo label="快捷键">
        <Kbd>⌘F</Kbd>
        <Kbd>Esc</Kbd>
        <Kbd>Shift</Kbd>
      </Demo>
    </Section>
  );
}

function SelectionSection() {
  const [current, setCurrent] = useState<HighlightColor>('yellow');
  const [lastAction, setLastAction] = useState('尚未点击');
  return (
    <Section id="selection" title="选区菜单" note="可以用方向键在按钮之间移动。">
      <div className="gallery__stage">
        <SelectionMenu
          label="选区操作"
          actions={newSelectionActions}
          onAction={(id) => setLastAction(`新选区 · ${id}`)}
          onColor={(color) => setLastAction(`新选区 · 高亮为 ${color}`)}
        />
        <p className="gallery__paper">
          <mark style={{ background: 'var(--pp-selection)' }}>Coordinates must therefore survive extraction, zoom and rotation,</mark> and a
          block should keep a stable identifier when the same file is opened again.
        </p>
      </div>
      <div className="gallery__stage">
        <SelectionMenu
          label="高亮操作"
          actions={highlightActions}
          currentColor={current}
          onColor={(color) => {
            setCurrent(color);
            setLastAction(`已有高亮 · 改为 ${color}`);
          }}
          onAction={(id) => setLastAction(`已有高亮 · ${id}`)}
          onDelete={() => setLastAction('已有高亮 · 删除')}
        />
        <p className="gallery__paper">
          <mark style={{ background: `var(--pp-hl-${current}-fill)` }}>Rule-based methods are transparent but fragile on unusual templates</mark>;
          learned models are robust but require labelled pages.
        </p>
      </div>
      <p className="gallery__card-note">最近一次操作：{lastAction}</p>
    </Section>
  );
}

function StatusSection() {
  return (
    <Section id="status" title="保存状态">
      <ul className="gallery__list">
        {statusSamples.map(([local, sync]) => (
          <li key={`${local}-${sync}`}>
            <SaveStatus local={local} sync={sync} />
          </li>
        ))}
        <li>
          <SaveStatus local="unmodified" sync="unconfigured" simulated />
        </li>
      </ul>
    </Section>
  );
}

function IconsSection() {
  return (
    <Section id="icons" title={`图标（${iconNames.length}）`}>
      <div className="gallery__icons">
        {iconNames.map((name) => (
          <div key={name} className="gallery__icon">
            <Icon name={name} size={20} />
            <code>{name}</code>
          </div>
        ))}
      </div>
    </Section>
  );
}
