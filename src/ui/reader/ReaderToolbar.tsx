import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react';
import { GlassSurface, Icon, IconButton, Menu, type MenuEntry } from '@/ui/components';
import type { DocumentHeaderView, DockPlacement } from './types';

/**
 * full: everything · compact: region/rotate/export move into "更多" ·
 * tight: the title and zoom go too. Chosen by the shell from the room above the paper.
 */
export type ToolbarDensity = 'full' | 'compact' | 'tight';

export type ToolbarTool = 'search' | 'region' | 'rotate' | 'export' | 'settings';

interface ReaderToolbarProps {
  header: DocumentHeaderView;
  /** 0-based. */
  pageIndex: number;
  zoomPercent: number;
  density: ToolbarDensity;
  showTitle: boolean;
  sidebarOpen: boolean;
  placement: DockPlacement;
  /** False when the window is too narrow to dock on the right. */
  canDockRight: boolean;
  autoHighlight: boolean;
  onToggleSidebar: () => void;
  onToggleTitle: () => void;
  onPageSubmit: (pageIndex: number) => void;
  onZoom: (direction: 'in' | 'out') => void;
  onTogglePlacement: () => void;
  onToggleAutoHighlight: () => void;
  onTool: (tool: ToolbarTool) => void;
}

type OpenMenu = { kind: 'context' | 'more'; x: number; y: number; align: 'start' | 'end' } | null;

export function ReaderToolbar({
  header,
  pageIndex,
  zoomPercent,
  density,
  showTitle,
  sidebarOpen,
  placement,
  canDockRight,
  autoHighlight,
  onToggleSidebar,
  onToggleTitle,
  onPageSubmit,
  onZoom,
  onTogglePlacement,
  onToggleAutoHighlight,
  onTool,
}: ReaderToolbarProps) {
  const [pageDraft, setPageDraft] = useState(String(pageIndex + 1));
  useEffect(() => setPageDraft(String(pageIndex + 1)), [pageIndex]);

  const [menu, setMenu] = useState<OpenMenu>(null);
  const moreRef = useRef<HTMLButtonElement>(null);

  const submitPage = (event: FormEvent) => {
    event.preventDefault();
    const page = Number.parseInt(pageDraft, 10);
    if (Number.isFinite(page) && page >= 1 && page <= header.pageCount) {
      onPageSubmit(page - 1);
    } else {
      setPageDraft(String(pageIndex + 1));
    }
  };

  const titleVisible = showTitle && density !== 'tight';
  const fullTitle = `${header.title}\n${header.sourceLabel} · ${header.pageCount} 页`;
  const dockLabel = placement === 'right' ? '研究区移到下方' : '研究区移到右侧';

  const openContextMenu = (event: MouseEvent) => {
    event.preventDefault();
    setMenu({ kind: 'context', x: event.clientX, y: event.clientY, align: 'start' });
  };

  const toggleMoreMenu = () => {
    if (menu?.kind === 'more') {
      setMenu(null);
      return;
    }
    const box = moreRef.current?.getBoundingClientRect();
    if (box) setMenu({ kind: 'more', x: box.right, y: box.bottom + 6, align: 'end' });
  };

  const titleEntry: MenuEntry = { id: 'title', label: '显示论文标题', checked: showTitle };
  const moreEntries: MenuEntry[] = [
    ...(density === 'tight'
      ? ([
          { id: 'zoom-in', label: `放大（当前 ${zoomPercent}%）`, icon: 'plus' },
          { id: 'zoom-out', label: '缩小', icon: 'minus' },
          { kind: 'separator', id: 'sep-zoom' },
        ] as MenuEntry[])
      : []),
    { id: 'region', label: '框选图像', icon: 'region' },
    { id: 'rotate', label: '旋转页面', icon: 'rotate' },
    { id: 'export', label: '导出', icon: 'export' },
    { kind: 'separator', id: 'sep-title' },
    titleEntry,
  ];

  const onMenuSelect = (id: string) => {
    if (id === 'title') onToggleTitle();
    else if (id === 'zoom-in') onZoom('in');
    else if (id === 'zoom-out') onZoom('out');
    else if (id === 'region' || id === 'rotate' || id === 'export') onTool(id);
  };

  return (
    <GlassSurface
      as="header"
      tone="bar"
      radius="pill"
      className="pp-toolbar"
      data-density={density}
      data-title={titleVisible ? 'shown' : 'hidden'}
      title={titleVisible ? undefined : fullTitle}
      onContextMenu={openContextMenu}
    >
      {/* Layout toggles show their state in the icon, not in accent colour. */}
      <IconButton
        icon={sidebarOpen ? 'sidebarShown' : 'sidebar'}
        label={sidebarOpen ? '隐藏侧栏' : '显示侧栏'}
        shape="pill"
        aria-pressed={sidebarOpen}
        onClick={onToggleSidebar}
      />
      {titleVisible ? (
        <span className="pp-toolbar__title" title={fullTitle}>
          {header.title}
        </span>
      ) : (
        <span className="pp-visually-hidden">{header.title}</span>
      )}

      <div className="pp-toolbar__group">
        <form className="pp-toolbar__pill pp-toolbar__page" onSubmit={submitPage}>
          <label className="pp-visually-hidden" htmlFor="pp-page-input">
            页码
          </label>
          <input
            id="pp-page-input"
            className="pp-toolbar__page-input"
            inputMode="numeric"
            value={pageDraft}
            onChange={(event) => setPageDraft(event.target.value.replace(/\D/g, ''))}
            onBlur={() => setPageDraft(String(pageIndex + 1))}
          />
          <span className="pp-toolbar__page-total">/ {header.pageCount}</span>
        </form>
        {density !== 'tight' && (
          <div className="pp-toolbar__pill pp-toolbar__zoom">
            <button type="button" aria-label="缩小" title="缩小" onClick={() => onZoom('out')}>
              <Icon name="minus" size={15} strokeWidth={1.7} />
            </button>
            <span aria-live="polite">{zoomPercent}%</span>
            <button type="button" aria-label="放大" title="放大" onClick={() => onZoom('in')}>
              <Icon name="plus" size={15} strokeWidth={1.7} />
            </button>
          </div>
        )}
      </div>

      <div className="pp-toolbar__group pp-toolbar__tools">
        <IconButton icon="search" label="查找" shape="pill" onClick={() => onTool('search')} />
        <IconButton icon="marker" label="自动高亮" shape="pill" active={autoHighlight} aria-pressed={autoHighlight} onClick={onToggleAutoHighlight} />
        {density === 'full' ? (
          <>
            <IconButton icon="region" label="框选图像" shape="pill" onClick={() => onTool('region')} />
            <IconButton icon="rotate" label="旋转页面" shape="pill" onClick={() => onTool('rotate')} />
          </>
        ) : (
          <IconButton
            ref={moreRef}
            icon="more"
            label="更多"
            shape="pill"
            aria-haspopup="menu"
            aria-expanded={menu?.kind === 'more'}
            active={menu?.kind === 'more'}
            onClick={toggleMoreMenu}
          />
        )}
        <span className="pp-toolbar__sep" aria-hidden="true" />
        <IconButton
          icon={placement === 'right' ? 'dockBottom' : 'dockRight'}
          label={canDockRight ? dockLabel : '窗口较窄，研究区固定在下方'}
          shape="pill"
          disabled={!canDockRight}
          onClick={onTogglePlacement}
        />
        <IconButton icon="settings" label="设置" shape="pill" onClick={() => onTool('settings')} />
        {density === 'full' && <IconButton icon="export" label="导出" shape="pill" onClick={() => onTool('export')} />}
      </div>

      {menu && (
        <Menu
          label={menu.kind === 'more' ? '更多工具' : '工具栏'}
          entries={menu.kind === 'more' ? moreEntries : [titleEntry]}
          anchor={{ x: menu.x, y: menu.y }}
          align={menu.align}
          triggerRef={menu.kind === 'more' ? moreRef : undefined}
          onSelect={onMenuSelect}
          onClose={() => setMenu(null)}
        />
      )}
    </GlassSurface>
  );
}
