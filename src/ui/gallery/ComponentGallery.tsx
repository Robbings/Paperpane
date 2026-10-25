import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import {
  Button,
  GlassSurface,
  Icon,
  IconButton,
  SaveStatus,
  Segmented,
  SelectionMenu,
  highlightColors,
  iconNames,
  type HighlightColor,
  type LocalSaveState,
  type SelectionMenuAction,
  type SyncState,
} from '@/ui/components';
import { applyTheme, type ThemeMode } from '@/ui/theme';
import './ComponentGallery.css';

// Temporary review page for the design tokens and base components. It is
// mounted on the reader placeholder and goes away with the reader shell PR.

const themeOptions = [
  { value: 'system', label: '跟随系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
] as const;

const newSelectionActions: readonly SelectionMenuAction[] = [
  { id: 'comment', label: '评论', icon: 'comment' },
  { id: 'translate', label: '翻译', icon: 'translate' },
  { id: 'explain', label: '解释', icon: 'explain' },
  { id: 'ask', label: '提问', icon: 'ask' },
  { id: 'copy', label: '复制', icon: 'copy' },
];

const highlightActions: readonly SelectionMenuAction[] = [
  { id: 'comment', label: '评论', icon: 'comment' },
  { id: 'explain', label: '解释', icon: 'explain' },
  { id: 'copy', label: '复制', icon: 'copy' },
];

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

const statusSamples: readonly [LocalSaveState, SyncState][] = [
  ['saved', 'unconfigured'],
  ['saving', 'pending'],
  ['saved', 'syncing'],
  ['saved', 'synced'],
  ['saved', 'failed'],
  ['failed', 'pending'],
  ['unmodified', 'conflict'],
];

const swatch = (variable: string) => ({ background: `var(${variable})` }) as CSSProperties;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <GlassSurface as="section" tone="panel" radius="panel" className="gallery__card">
      <h2 className="gallery__card-title">{title}</h2>
      {children}
    </GlassSurface>
  );
}

export function ComponentGallery() {
  const [theme, setTheme] = useState<ThemeMode>('system');
  const [tab, setTab] = useState<'thumbs' | 'outline'>('outline');
  const [filter, setFilter] = useState<'all' | 'highlight' | 'comment'>('all');
  const [current, setCurrent] = useState<HighlightColor>('yellow');
  const [lastAction, setLastAction] = useState('尚未点击');

  useEffect(() => applyTheme(theme), [theme]);

  return (
    <div className="gallery">
      <GlassSurface as="header" tone="bar" radius="pill" className="gallery__bar">
        <span className="gallery__brand">Paperpane · 组件样板</span>
        <Segmented label="主题" options={themeOptions} value={theme} onChange={setTheme} size="sm" />
      </GlassSurface>

      <div className="gallery__grid">
        <Section title="颜色">
          <div className="gallery__colors">
            {colorTokens.map(([label, variable]) => (
              <div key={variable} className="gallery__color">
                <span className="gallery__chip" style={swatch(variable)} />
                <span>{label}</span>
                <code>{variable}</code>
              </div>
            ))}
          </div>
          <div className="gallery__colors" aria-label="高亮五色">
            {highlightColors.map((color) => (
              <div key={color} className="gallery__color">
                <span className="gallery__chip" style={swatch(`--pp-hl-${color}-dot`)} />
                <code>{color}</code>
              </div>
            ))}
          </div>
        </Section>

        <Section title="材质">
          <div className="gallery__material">
            <p className="gallery__paper">
              PDF does not guarantee a reading order: a file may draw the second column before the first, or place a
              caption between two halves of a paragraph.{' '}
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

        <Section title="按钮">
          <div className="gallery__row">
            <Button variant="primary">添加 PDF</Button>
            <Button>取消</Button>
            <Button variant="quiet" icon="export">
              导出
            </Button>
            <Button variant="danger" icon="trash">
              删除
            </Button>
            <Button disabled>不可用</Button>
          </div>
          <div className="gallery__row">
            <Button size="sm" shape="pill" icon="plus">
              新建
            </Button>
            <Button size="sm" variant="primary" shape="pill">
              重试
            </Button>
          </div>
          <div className="gallery__row">
            <IconButton icon="search" label="查找" />
            <IconButton icon="marker" label="自动高亮" active />
            <IconButton icon="region" label="框选图像" />
            <IconButton icon="dockBottom" label="研究区移到下方" shape="pill" />
            <IconButton icon="settings" label="设置" disabled />
          </div>
          <div className="gallery__row">
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
                { value: 'comment', label: '评论' },
              ]}
              value={filter}
              onChange={setFilter}
            />
          </div>
        </Section>

        <Section title="选区菜单">
          <div className="gallery__stage">
            <SelectionMenu
              label="选区操作"
              actions={newSelectionActions}
              onAction={(id) => setLastAction(`新选区 · ${id}`)}
              onColor={(color) => setLastAction(`新选区 · 高亮为 ${color}`)}
            />
            <p className="gallery__paper">
              <mark style={{ background: 'var(--pp-selection)' }}>
                Coordinates must therefore survive extraction, zoom and rotation,
              </mark>{' '}
              and a block should keep a stable identifier when the same file is opened again.
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
              <mark style={{ background: `var(--pp-hl-${current}-fill)` }}>
                Rule-based methods are transparent but fragile on unusual templates
              </mark>
              ; learned models are robust but require labelled pages.
            </p>
          </div>
          <p className="gallery__note">最近一次操作：{lastAction}</p>
        </Section>

        <Section title="保存与同步状态">
          <ul className="gallery__list">
            {statusSamples.map(([local, sync]) => (
              <li key={`${local}-${sync}`}>
                <SaveStatus local={local} sync={sync} />
              </li>
            ))}
          </ul>
        </Section>

        <Section title={`图标（${iconNames.length}）`}>
          <div className="gallery__icons">
            {iconNames.map((name) => (
              <div key={name} className="gallery__icon">
                <Icon name={name} size={20} />
                <code>{name}</code>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}
