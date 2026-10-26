import { useEffect, useRef, useState, type FormEvent, type MouseEvent, type RefObject } from 'react';
import { GlassSurface, Icon, IconButton, Menu, Tooltip, type MenuEntry } from '@/ui/components';
import type { DocumentHeaderView, DockPlacement, Rotation } from './types';

/**
 * full: everything · compact: region/rotate/export move into "更多" ·
 * tight: the title and zoom go too. Chosen by the shell from the room above the paper.
 */
export type ToolbarDensity = 'full' | 'compact' | 'tight';

export type ToolbarTool = 'region' | 'export' | 'settings';

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
  /** In the library? Shown by the bookmark next to the title; omit to hide it. */
  saved?: boolean;
  saveRef?: RefObject<HTMLButtonElement | null>;
  saveOpen?: boolean;
  onSave?: () => void;
  onToggleTitle: () => void;
  onPageSubmit: (pageIndex: number) => void;
  onZoom: (direction: 'in' | 'out') => void;
  /** A typed percentage, already limited to 25–400. */
  onZoomTo: (percent: number) => void;
  onTogglePlacement: () => void;
  onToggleAutoHighlight: () => void;
  findOpen: boolean;
  /** Opens or closes the find bar. */
  onFind: () => void;
  rotation: Rotation;
  /** Turns the pages a quarter clockwise. */
  onRotate: () => void;
  onResetRotation: () => void;
  onTool: (tool: ToolbarTool) => void;
}

type OpenMenu = { kind: 'context' | 'more' | 'rotate'; x: number; y: number; align: 'start' | 'end' } | null;

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
  saved,
  saveRef,
  saveOpen,
  onSave,
  onToggleTitle,
  onPageSubmit,
  onZoom,
  onZoomTo,
  onTogglePlacement,
  onToggleAutoHighlight,
  findOpen,
  onFind,
  rotation,
  onRotate,
  onResetRotation,
  onTool,
}: ReaderToolbarProps) {
  const [pageDraft, setPageDraft] = useState(String(pageIndex + 1));
  useEffect(() => setPageDraft(String(pageIndex + 1)), [pageIndex]);

  const [zoomDraft, setZoomDraft] = useState<string | null>(null);
  const submitZoom = () => {
    const value = Number.parseFloat(zoomDraft ?? '');
    if (Number.isFinite(value)) onZoomTo(Math.round(Math.min(400, Math.max(25, value))));
    setZoomDraft(null);
  };

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
  const rotateLabel = rotation === 0 ? '顺时针旋转页面' : `顺时针旋转页面（现在 ${rotation}°）`;
  // Turned pages: the button stays marked, and right-click or the menu puts them back.
  const resetEntry: MenuEntry = { id: 'rotate-reset', label: '恢复页面方向', icon: 'rotate', disabled: rotation === 0 };
  const moreEntries: MenuEntry[] = [
    ...(density === 'tight'
      ? ([
          { id: 'zoom-in', label: `放大（当前 ${zoomPercent}%）`, icon: 'plus' },
          { id: 'zoom-out', label: '缩小', icon: 'minus' },
          { kind: 'separator', id: 'sep-zoom' },
        ] as MenuEntry[])
      : []),
    { id: 'region', label: '框选图像', icon: 'region' },
    { id: 'rotate', label: rotateLabel, icon: 'rotate' },
    ...(rotation !== 0 ? [resetEntry] : []),
    { id: 'export', label: '导出', icon: 'export' },
    { kind: 'separator', id: 'sep-title' },
    titleEntry,
  ];

  const onMenuSelect = (id: string) => {
    if (id === 'title') onToggleTitle();
    else if (id === 'zoom-in') onZoom('in');
    else if (id === 'zoom-out') onZoom('out');
    else if (id === 'rotate') onRotate();
    else if (id === 'rotate-reset') onResetRotation();
    else if (id === 'region' || id === 'export') onTool(id);
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
        <Tooltip label={fullTitle} className="pp-toolbar__title-wrap">
          <span className="pp-toolbar__title">{header.title}</span>
        </Tooltip>
      ) : (
        <span className="pp-visually-hidden">{header.title}</span>
      )}

      {onSave && (
        <IconButton
          ref={saveRef}
          icon={saved ? 'bookmarkFilled' : 'bookmark'}
          label={saved ? '已在文献库，点按编辑' : '收藏到文献库'}
          shape="pill"
          aria-haspopup="dialog"
          aria-expanded={saveOpen}
          tooltip={!saveOpen}
          onClick={onSave}
        />
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
            <Tooltip label="缩小" shortcut="⌘−" labelsChild>
              <button type="button" aria-label="缩小" onClick={() => onZoom('out')}>
                <Icon name="minus" size={15} strokeWidth={1.7} />
              </button>
            </Tooltip>
            {/* Click the percentage to type one; Enter applies, Esc cancels. */}
            <input
              className="pp-toolbar__zoom-input"
              aria-label="缩放比例（%）"
              inputMode="numeric"
              value={zoomDraft ?? `${zoomPercent}%`}
              onFocus={(event) => {
                setZoomDraft(String(zoomPercent));
                const input = event.currentTarget;
                window.setTimeout(() => input.select(), 0);
              }}
              onChange={(event) => setZoomDraft(event.target.value.replace(/[^\d.]/g, ''))}
              onBlur={submitZoom}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
                if (event.key === 'Escape') {
                  setZoomDraft(null);
                  window.setTimeout(() => (document.activeElement as HTMLElement | null)?.blur(), 0);
                }
              }}
            />
            <Tooltip label="放大" shortcut="⌘+" labelsChild>
              <button type="button" aria-label="放大" onClick={() => onZoom('in')}>
                <Icon name="plus" size={15} strokeWidth={1.7} />
              </button>
            </Tooltip>
          </div>
        )}
      </div>

      <div className="pp-toolbar__group pp-toolbar__tools">
        <IconButton icon="search" label={findOpen ? '关闭查找' : '查找'} shortcut="⌘F" shape="pill" active={findOpen} aria-pressed={findOpen} onClick={onFind} />
        <IconButton icon="marker" label="自动高亮" shape="pill" active={autoHighlight} aria-pressed={autoHighlight} onClick={onToggleAutoHighlight} />
        {density === 'full' ? (
          <>
            <IconButton icon="region" label="框选图像" shape="pill" onClick={() => onTool('region')} />
            <IconButton
              icon="rotate"
              label={rotateLabel}
              shape="pill"
              active={rotation !== 0}
              onClick={onRotate}
              onContextMenu={(event) => {
                if (rotation === 0) return;
                event.preventDefault();
                event.stopPropagation();
                setMenu({ kind: 'rotate', x: event.clientX, y: event.clientY, align: 'start' });
              }}
            />
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
            tooltip={menu?.kind !== 'more'}
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
          label={menu.kind === 'more' ? '更多工具' : menu.kind === 'rotate' ? '页面方向' : '工具栏'}
          entries={menu.kind === 'more' ? moreEntries : menu.kind === 'rotate' ? [resetEntry] : [titleEntry]}
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
