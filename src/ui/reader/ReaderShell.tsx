import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  GlassSurface,
  SelectionMenu,
  type HighlightColor,
  type LocalSaveState,
  type SelectionMenuAction,
  type SyncState,
} from '@/ui/components';
import { FunctionRail, researchPanels } from './FunctionRail';
import { ReaderLibraryNav, type ReaderLibraryData } from './library/ReaderLibraryNav';
import { SaveToLibraryPopover, type LibraryEntryDraft } from './library/SaveToLibraryPopover';
import { OverlayScrollbar } from './OverlayScrollbar';
import {
  GAP,
  PAPER_COMFORT_WIDTH,
  PAPER_MIN_WIDTH,
  RAIL_GAP,
  RAIL_LENGTH,
  RAIL_ROW_LENGTH,
  RAIL_THICKNESS,
  RESEARCH_HEIGHT,
  RESEARCH_WIDTH,
  clampHeight,
  clampWidth,
  layoutEdges,
  paperWidth,
  toolbarDensity,
} from './geometry';
import { AnnotationsPanel } from './panels/AnnotationsPanel';
import { NotesPanel } from './panels/NotesPanel';
import { PlaceholderPanel } from './panels/PlaceholderPanel';
import { ReaderSidebar } from './ReaderSidebar';
import { ReaderToolbar } from './ReaderToolbar';
import { Splitter } from './Splitter';
import type {
  AnnotationView,
  DockPlacement,
  DocumentHeaderView,
  OutlineItemView,
  ResearchPanelId,
  TextSelectionSnapshot,
} from './types';
import { useViewport } from './useViewport';
import type { TagView } from '@/ui/library/types';
import './reader.css';

export interface ReaderLayout {
  placement: DockPlacement;
  width: number;
  height: number;
  /** Show the paper title in the toolbar. */
  showTitle: boolean;
}

interface ReaderShellProps {
  header: DocumentHeaderView;
  outline: readonly OutlineItemView[];
  /** 0-based. */
  pageIndex: number;
  zoomPercent: number;
  annotations: readonly AnnotationView[];
  /** `simulated` marks sample data that is never stored. */
  annotationStatus: { local: LocalSaveState; sync: SyncState; simulated?: boolean };
  notes: { value: string; onChange: (value: string) => void; local: LocalSaveState; sync: SyncState; simulated?: boolean };
  /** The paper itself; the shell provides the scroll container around it. */
  document: ReactNode;
  initialLayout?: Partial<ReaderLayout>;
  /** Called when placement, size or toolbar title changes, for the logic layer to persist. */
  onLayoutChange?: (layout: ReaderLayout) => void;
  onNavigate: (pageIndex: number) => void;
  onZoom: (direction: 'in' | 'out') => void;
  onHighlight: (color: HighlightColor, selection: TextSelectionSnapshot) => void;
  onSelectionAction: (action: string, selection: TextSelectionSnapshot) => void;
  onLocateAnnotation: (id: string) => void;
  onTool: (tool: string) => void;
  /** Library features inside the reader: bookmark popover and the sidebar tab. */
  library?: ReaderLibraryProps;
}

export interface ReaderLibraryProps extends ReaderLibraryData {
  /** Whether the open paper is in the library. */
  saved: boolean;
  /** Prefilled entry (saved values, or metadata extracted from the paper). */
  entry: LibraryEntryDraft;
  tags: readonly TagView[];
  onSave: (draft: LibraryEntryDraft) => void;
  onRemove: () => void;
  /** Creates a folder from the save popover and returns its id. */
  onCreateFolder: (parentId: string | null, name: string) => string;
  onOpenPaper: (id: string, newTab: boolean) => void;
  onImport: (files: File[]) => void;
  onOpenLibrary: () => void;
}

const selectionActions: readonly SelectionMenuAction[] = [
  { id: 'comment', label: '评论', icon: 'comment' },
  { id: 'translate', label: '翻译', icon: 'translate' },
  { id: 'explain', label: '解释', icon: 'explain' },
  { id: 'ask', label: '提问', icon: 'ask' },
  { id: 'copy', label: '复制', icon: 'copy' },
];

const placeholderText: Partial<Record<ResearchPanelId, string>> = {
  overview: '论文概览卡片会在 AI 阶段加入。',
  discuss: '整篇论文讨论会在 AI 阶段加入。',
  explain: '选区解释的记录会显示在这里。',
  cite: '引用卡片和参考文献列表会在引用阶段加入。',
};

const px = (value: number) => `${value}px`;

export function ReaderShell(props: ReaderShellProps) {
  const { header, outline, pageIndex, zoomPercent, annotations, annotationStatus, notes, document: paper } = props;
  const viewport = useViewport();

  const [placement, setPlacement] = useState<DockPlacement>(props.initialLayout?.placement ?? 'right');
  const [width, setWidth] = useState(props.initialLayout?.width ?? RESEARCH_WIDTH.default);
  const [height, setHeight] = useState(props.initialLayout?.height ?? RESEARCH_HEIGHT.default);
  const [showTitle, setShowTitle] = useState(props.initialLayout?.showTitle ?? true);
  const [panel, setPanel] = useState<ResearchPanelId>('annotations');
  const [panelOpen, setPanelOpen] = useState(true);
  // Panels stay mounted once opened, so drafts and running tasks survive switching.
  const [visited, setVisited] = useState<ReadonlySet<ResearchPanelId>>(() => new Set(['annotations']));
  const [sidebarPref, setSidebarPref] = useState<boolean | null>(null);
  const [autoHighlight, setAutoHighlight] = useState(false);
  const [resizing, setResizing] = useState(false);
  // Dock change phases: 'out' while content fades and the card moves,
  // 'settling' while content fades back in near the end of the move.
  const [switching, setSwitching] = useState<'out' | 'settling' | null>(null);

  const effectiveWidth = clampWidth(width, viewport.width);
  const effectiveHeight = clampHeight(height, viewport.height);

  // Keep the paper readable: fold the sidebar away first, then dock the
  // research area at the bottom. The saved placement itself is unchanged.
  // These decisions assume the panel is open, so collapsing or expanding it
  // never moves it to the other side.
  const space = (docked: boolean, at: DockPlacement) =>
    paperWidth({ viewportWidth: viewport.width, sidebarDocked: docked, placement: at, panelOpen: true, width: effectiveWidth });
  const sidebarFits = space(true, placement) >= PAPER_MIN_WIDTH;
  const sidebarOpen = sidebarPref ?? space(true, placement) >= PAPER_COMFORT_WIDTH;
  const sidebarDocked = sidebarOpen && sidebarFits;
  const canDockRight = space(sidebarDocked, 'right') >= PAPER_MIN_WIDTH;
  const compact = !canDockRight;
  const effectivePlacement: DockPlacement = compact ? 'bottom' : placement;
  const edges = layoutEdges({
    placement: effectivePlacement,
    sidebarDocked,
    panelOpen,
    width: effectiveWidth,
    height: effectiveHeight,
  });

  // The card is placed by explicit coordinates in both docks, so moving
  // between them is one continuous tween of position, size and corners.
  const card =
    effectivePlacement === 'right'
      ? panelOpen
        ? { x: viewport.width - GAP - effectiveWidth - RAIL_THICKNESS, y: GAP, w: effectiveWidth + RAIL_THICKNESS, h: viewport.height - 2 * GAP }
        : { x: viewport.width - GAP - RAIL_THICKNESS, y: GAP, w: RAIL_THICKNESS, h: RAIL_LENGTH }
      : panelOpen
        ? {
            x: edges.left,
            y: viewport.height - GAP - effectiveHeight - RAIL_THICKNESS,
            w: viewport.width - edges.left - GAP,
            h: effectiveHeight + RAIL_THICKNESS,
          }
        : {
            x: edges.left + (viewport.width - edges.left - GAP - RAIL_ROW_LENGTH) / 2,
            y: viewport.height - GAP - RAIL_THICKNESS,
            w: RAIL_ROW_LENGTH,
            h: RAIL_THICKNESS,
          };

  // While the card changes dock its content and rail fade out, the card
  // morphs to the new place, then they fade back in (see reader.css).
  const lastPlacement = useRef(effectivePlacement);
  useLayoutEffect(() => {
    if (lastPlacement.current === effectivePlacement) return;
    lastPlacement.current = effectivePlacement;
    setSwitching('out');
    // The move takes --pp-dur-layout (280ms); start fading back in at ~60%.
    const settle = window.setTimeout(() => setSwitching('settling'), 170);
    const done = window.setTimeout(() => setSwitching(null), 340);
    return () => {
      window.clearTimeout(settle);
      window.clearTimeout(done);
    };
  }, [effectivePlacement]);

  // A user-initiated switch fades the content out before the layout flips.
  const togglePlacement = () => {
    setSwitching('out');
    window.setTimeout(() => setPlacement((current) => (current === 'right' ? 'bottom' : 'right')), 80);
    // Fallback in case the effective placement does not change after all.
    window.setTimeout(() => setSwitching((phase) => (phase === 'out' ? null : phase)), 600);
  };

  // Window resizes follow the pointer directly instead of tweening behind it.
  const [saveOpen, setSaveOpen] = useState(false);
  const saveRef = useRef<HTMLButtonElement>(null);
  const { library } = props;

  const [windowResizing, setWindowResizing] = useState(false);
  const firstViewport = useRef(true);
  useEffect(() => {
    if (firstViewport.current) {
      firstViewport.current = false;
      return;
    }
    setWindowResizing(true);
    const timer = window.setTimeout(() => setWindowResizing(false), 150);
    return () => window.clearTimeout(timer);
  }, [viewport.width, viewport.height]);

  // A floating sidebar closes on Esc or a click elsewhere, like a popover.
  const overlayOpen = sidebarOpen && !sidebarDocked;
  useEffect(() => {
    if (!overlayOpen) return;
    const close = () => setSidebarPref(false);
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element;
      if (!target.closest('.pp-sidebar, .pp-toolbar')) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [overlayOpen]);

  const { onLayoutChange } = props;
  useEffect(() => {
    onLayoutChange?.({ placement, width, height, showTitle });
  }, [onLayoutChange, placement, width, height, showTitle]);

  const density = toolbarDensity(viewport.width - edges.left - edges.right, showTitle);

  const selectPanel = (id: ResearchPanelId) => {
    if (panelOpen && id === panel) {
      setPanelOpen(false);
      return;
    }
    setPanel(id);
    setPanelOpen(true);
    setVisited((current) => (current.has(id) ? current : new Set(current).add(id)));
  };

  // ---- Text selection menu -------------------------------------------------
  const scrollRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<TextSelectionSnapshot | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);

  const closeMenu = useCallback(() => {
    setSelection(null);
    setMenuPosition(null);
  }, []);

  // Take a snapshot when the selection settles, so menu actions never read a
  // selection that has already gone.
  const captureSelection = () => {
    const current = window.getSelection();
    const container = scrollRef.current;
    if (!current || current.isCollapsed || current.rangeCount === 0 || !container) return;
    const range = current.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) return;
    const text = current.toString().trim();
    if (!text) return;
    const box = range.getBoundingClientRect();
    setSelection({ text, rect: { top: box.top, left: box.left, bottom: box.bottom, right: box.right } });
  };

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!selection || !menu) return;
    const { width: w, height: h } = menu.getBoundingClientRect();
    const toolbarBottom = (document.querySelector('.pp-toolbar')?.getBoundingClientRect().bottom ?? GAP) + 8;
    const above = selection.rect.top - h - 8;
    const top = above >= toolbarBottom ? above : selection.rect.bottom + 8;
    const center = (selection.rect.left + selection.rect.right) / 2;
    const left = Math.min(Math.max(center - w / 2, 8), window.innerWidth - w - 8);
    setMenuPosition({ top, left });
  }, [selection]);

  useEffect(() => {
    if (!selection) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) closeMenu();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu();
    };
    const container = scrollRef.current;
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', closeMenu);
    container?.addEventListener('scroll', closeMenu, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', closeMenu);
      container?.removeEventListener('scroll', closeMenu);
    };
  }, [selection, closeMenu]);

  // ---- Layout variables ----------------------------------------------------
  const style = {
    '--pp-edge-left': px(edges.left),
    '--pp-edge-right': px(edges.right),
    '--pp-edge-bottom': px(edges.bottom),
    '--pp-research-w': px(effectiveWidth),
    '--pp-research-h': px(effectiveHeight),
    '--pp-gap': px(GAP),
    '--pp-rail': px(RAIL_THICKNESS),
    '--pp-rail-gap': px(RAIL_GAP),
    '--pp-rail-length': px(RAIL_LENGTH),
    '--pp-rail-row-length': px(RAIL_ROW_LENGTH),
    '--pp-card-x': px(card.x),
    '--pp-card-y': px(card.y),
    '--pp-card-w': px(card.w),
    '--pp-card-h': px(card.h),
  } as CSSProperties;

  // Distance from the window edge to the card's inner (rail-side) content edge.
  const rail = GAP + RAIL_THICKNESS;
  const panelTitle = researchPanels.find((item) => item.id === panel)?.label ?? '';

  return (
    <div
      className="pp-reader"
      data-placement={effectivePlacement}
      data-switching={switching ?? undefined}
      data-resizing={resizing || windowResizing ? 'true' : undefined}
      style={style}
    >
      <div
        ref={scrollRef}
        className="pp-reader__paper"
        onMouseUp={captureSelection}
        onKeyUp={(event) => {
          if (event.shiftKey) captureSelection();
        }}
      >
        {paper}
      </div>
      <OverlayScrollbar target={scrollRef} dragLabel={`第 ${pageIndex + 1} / ${header.pageCount} 页`} />

      <ReaderSidebar
        open={sidebarOpen}
        outline={outline}
        pageCount={header.pageCount}
        pageIndex={pageIndex}
        // Floating or docked is decided by room, not by open state, so it
        // slides out from where it was.
        overlay={!sidebarFits}
        onNavigate={(index) => {
          props.onNavigate(index);
          if (overlayOpen) setSidebarPref(false);
        }}
        library={
          library && (
            <ReaderLibraryNav
              currentPaperId={library.currentPaperId}
              folders={library.folders}
              papers={library.papers}
              recent={library.recent}
              onOpenPaper={library.onOpenPaper}
              onImport={library.onImport}
              onOpenLibrary={library.onOpenLibrary}
            />
          )
        }
      />

      <ReaderToolbar
        header={header}
        pageIndex={pageIndex}
        zoomPercent={zoomPercent}
        density={density}
        showTitle={showTitle}
        onToggleTitle={() => setShowTitle((value) => !value)}
        sidebarOpen={sidebarOpen}
        placement={effectivePlacement}
        canDockRight={!compact}
        autoHighlight={autoHighlight}
        onToggleSidebar={() => setSidebarPref(!sidebarOpen)}
        saved={library?.saved}
        saveRef={saveRef}
        saveOpen={saveOpen}
        onSave={library ? () => setSaveOpen((open) => !open) : undefined}
        onPageSubmit={props.onNavigate}
        onZoom={props.onZoom}
        onTogglePlacement={togglePlacement}
        onToggleAutoHighlight={() => setAutoHighlight((value) => !value)}
        onTool={props.onTool}
      />

      {panelOpen && (
        <Splitter
          placement={effectivePlacement}
          value={effectivePlacement === 'right' ? effectiveWidth : effectiveHeight}
          min={effectivePlacement === 'right' ? RESEARCH_WIDTH.min : RESEARCH_HEIGHT.min}
          max={effectivePlacement === 'right' ? clampWidth(Infinity, viewport.width) : clampHeight(Infinity, viewport.height)}
          sizeFromPointer={(x, y) => (effectivePlacement === 'right' ? window.innerWidth - rail - x : window.innerHeight - rail - y)}
          onDragChange={setResizing}
          onResize={(size) =>
            effectivePlacement === 'right' ? setWidth(clampWidth(size, viewport.width)) : setHeight(clampHeight(size, viewport.height))
          }
        />
      )}

      {/* One card: the panel body plus the function rail along its outer edge.
          Collapsed, the card shrinks to just the rail. */}
      <GlassSurface
        as="section"
        tone="panel"
        radius="panel"
        className="pp-research"
        data-open={panelOpen ? 'true' : 'false'}
        aria-label="研究区"
      >
        <div id="pp-research-body" className="pp-research__body" aria-label={panelTitle} role="region" inert={!panelOpen}>
          {researchPanels.map(({ id, label, icon }) => {
            if (!visited.has(id)) return null;
            return (
              <div key={id} className="pp-research__view" hidden={id !== panel}>
                {id === 'annotations' ? (
                  <AnnotationsPanel
                    items={annotations}
                    local={annotationStatus.local}
                    sync={annotationStatus.sync}
                    simulated={annotationStatus.simulated}
                    onLocate={props.onLocateAnnotation}
                    onCopyAll={() => props.onTool('copy-annotations')}
                    onExport={() => props.onTool('export-annotations')}
                  />
                ) : id === 'notes' ? (
                  <NotesPanel value={notes.value} onChange={notes.onChange} local={notes.local} sync={notes.sync} simulated={notes.simulated} />
                ) : (
                  <PlaceholderPanel title={label} icon={icon} description={placeholderText[id] ?? ''} />
                )}
              </div>
            );
          })}
        </div>
        <FunctionRail placement={effectivePlacement} active={panel} panelOpen={panelOpen} onSelect={selectPanel} />
      </GlassSurface>

      {library && (
        <SaveToLibraryPopover
          anchorRef={saveRef}
          open={saveOpen}
          onClose={() => setSaveOpen(false)}
          saved={library.saved}
          initial={library.entry}
          folders={library.folders}
          tags={library.tags}
          onSave={library.onSave}
          onRemove={library.onRemove}
          onCreateFolder={library.onCreateFolder}
        />
      )}

      {selection && (
        <div
          ref={menuRef}
          className="pp-reader__selmenu"
          style={menuPosition ? { top: menuPosition.top, left: menuPosition.left } : { visibility: 'hidden' }}
          // Keep the text selection while the pointer is on the menu.
          onMouseDown={(event) => event.preventDefault()}
        >
          <SelectionMenu
            label="选区操作"
            actions={selectionActions}
            onColor={(color) => {
              props.onHighlight(color, selection);
              closeMenu();
            }}
            onAction={(action) => {
              props.onSelectionAction(action, selection);
              closeMenu();
            }}
            onDismiss={closeMenu}
          />
        </div>
      )}
    </div>
  );
}
