import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import {
  GlassSurface,
  SelectionMenu,
  toast,
  type LocalSaveState,
  type SelectionMenuAction,
  type SyncState,
} from '@/ui/components';
import { CommentNotes, NOTE_SIZE } from './notes/CommentNotes';
import { FindBar } from './FindBar';
import { QuickSettings, type ReaderSettingsProps } from './QuickSettings';
import { TranslationDockContext } from './translation/dock';
import { DEFAULT_SELECTION_BAR } from '@/ui/settings/types';
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
import { ReaderToolbar, type ExportOption } from './ReaderToolbar';
import { Splitter } from './Splitter';
import type {
  AnnotationView,
  DockPlacement,
  DocumentHeaderView,
  NoteLayout,
  OutlineItemView,
  ResearchPanelId,
  ReaderInteraction,
  Rotation,
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
  navigationPending?: boolean;
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
  /** A typed zoom percentage (25–400). */
  onZoomTo: (percent: number) => void;
  /** Selection, highlights, comments: driven by the runtime (see ReaderInteraction). */
  interaction: ReaderInteraction;
  onLocateAnnotation: (id: string) => void;
  onTool: (tool: string) => void;
  /** Library features inside the reader: bookmark popover and the sidebar tab. */
  library?: ReaderLibraryProps;
  /** A back button at the start of the toolbar, for a paper opened from the library. */
  onBack?: () => void;
  onOriginalPdf?: () => void;
  /** What the toolbar's 导出 offers (e.g. the original PDF); without it the button calls onTool('export'). */
  exports?: readonly ExportOption[];
  onExport?: (id: string) => void;
  /** The translation beside the paper: the toolbar's 译文 button toggles it; the page supplies the pane. */
  translation?: { open: boolean; onToggle: () => void; pane: ReactNode };
  /** Quick settings behind the toolbar's settings button: appearance, answer language, default model. */
  settings?: ReaderSettingsProps;
  /** Content for research panels the page supplies itself (discussion, overview, …); the rest show a placeholder. */
  panels?: Partial<Record<ResearchPanelId, ReactNode>>;
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

/** The translation pane's narrowest width, and the room the paper keeps beside it. */
const TRANSLATION_MIN = 300;
const TRANSLATION_DEFAULT = 360;
const PAPER_BESIDE_TRANSLATION = 360;
const FLOAT_MIN = { w: 300, h: 240 };

/** Keeps the floating translation inside the window, with its header reachable. */
function clampFloat(r: { x: number; y: number; w: number; h: number }, viewport: { width: number; height: number }) {
  const w = Math.min(Math.max(r.w, FLOAT_MIN.w), viewport.width - 2 * GAP);
  const h = Math.min(Math.max(r.h, FLOAT_MIN.h), viewport.height - 2 * GAP);
  return {
    w,
    h,
    x: Math.round(Math.min(Math.max(r.x, GAP), viewport.width - GAP - w)),
    y: Math.round(Math.min(Math.max(r.y, GAP), viewport.height - GAP - h)),
  };
}

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
  // A docked translation takes room from the paper: the sidebar folds away first when it no longer fits.
  const translationOpen = Boolean(props.translation?.open);
  const [translationFloating, setTranslationFloating] = useState(false);
  const [translationPref, setTranslationPref] = useState<number | null>(null);
  const translationDocked = translationOpen && !translationFloating;
  const translationRoom = translationDocked ? (translationPref ?? TRANSLATION_DEFAULT) : 0;
  const sidebarOpen = sidebarPref ?? space(true, placement) - translationRoom >= PAPER_COMFORT_WIDTH;
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLButtonElement>(null);
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


  // ---- Translation beside the paper ------------------------------------------
  // Docked: a full-height column right of the paper; the paper, toolbar and find bar
  // move over to make room. Floating: a card over the paper the reader can move and size.
  const readingWidth = viewport.width - edges.left - edges.right;
  const translationWidth = Math.round(
    Math.min(Math.max(translationPref ?? TRANSLATION_DEFAULT, TRANSLATION_MIN), Math.max(TRANSLATION_MIN, readingWidth - PAPER_BESIDE_TRANSLATION)),
  );
  const [floatPref, setFloatPref] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const floatRect = clampFloat(
    floatPref ?? {
      w: 380,
      h: Math.min(620, Math.round(viewport.height * 0.62)),
      x: viewport.width - edges.right - 380 - 16,
      y: GAP + 44 + 16,
    },
    viewport,
  );
  const [translationDrag, setTranslationDrag] = useState(false);
  /** Follows one pointer gesture on the pane: docked width, or moving / sizing the floating card. */
  const startTranslationGesture = (kind: string) => (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    setTranslationDrag(true);
    const start = { x: event.clientX, y: event.clientY, rect: floatRect };
    const right = viewport.width - edges.right;
    const move = (e: PointerEvent) => {
      if (kind === 'dock') {
        setTranslationPref(right - e.clientX);
        return;
      }
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      const r = { ...start.rect };
      if (kind === 'move') {
        r.x += dx;
        r.y += dy;
      } else {
        if (kind.includes('e')) r.w += dx;
        if (kind.includes('s')) r.h += dy;
        if (kind.includes('w')) {
          r.w -= dx;
          r.x += dx;
        }
        if (kind.includes('n')) {
          r.h -= dy;
          r.y += dy;
        }
        // Growing past the limits must not drag the opposite edge along.
        if (r.w < FLOAT_MIN.w) {
          if (kind.includes('w')) r.x -= FLOAT_MIN.w - r.w;
          r.w = FLOAT_MIN.w;
        }
        if (r.h < FLOAT_MIN.h) {
          if (kind.includes('n')) r.y -= FLOAT_MIN.h - r.h;
          r.h = FLOAT_MIN.h;
        }
      }
      setFloatPref(clampFloat(r, viewport));
    };
    const end = () => {
      setTranslationDrag(false);
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  };
  const translationDock = {
    floating: translationFloating,
    onToggleFloating: () => setTranslationFloating((value) => !value),
    onHeaderPointerDown: startTranslationGesture('move'),
  };
  // The paper's own right edge: past the docked translation when it is open.
  const paperRight = edges.right + (translationDocked ? translationWidth : 0);
  const density = toolbarDensity(viewport.width - edges.left - paperRight, showTitle);

  const selectPanel = (id: ResearchPanelId) => {
    if (panelOpen && id === panel) {
      setPanelOpen(false);
      return;
    }
    setPanel(id);
    setPanelOpen(true);
    setVisited((current) => (current.has(id) ? current : new Set(current).add(id)));
  };

  // ---- Floating menu: for a new selection or an existing highlight -----------
  // The runtime decides what the menu is for and where it is; the shell shows it.
  const { interaction } = props;
  const target = interaction.menuTarget;
  const scrollRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const targetAnnotation = target?.kind === 'annotation' ? annotations.find((a) => a.id === target.annotationId) : undefined;
  // What the bar shows, in what order and how, from the reader's preferences.
  const bar = props.settings?.preferences.selectionBar ?? DEFAULT_SELECTION_BAR;
  const barLayout = bar.order.filter((item) => !bar.hidden.includes(item));

  // Hand the scroll container to the runtime: its viewer mounts and listens there.
  const onScrollContainer = interaction.onScrollContainer;
  const [paperElement, setPaperElement] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    setPaperElement(scrollRef.current);
    onScrollContainer(scrollRef.current);
    return () => onScrollContainer(null);
  }, [onScrollContainer]);

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!target || !menu || target.rects.length === 0) {
      setMenuPosition(null);
      return;
    }
    const { width: w, height: h } = menu.getBoundingClientRect();
    const top = Math.min(...target.rects.map((r) => r.top));
    const bottom = Math.max(...target.rects.map((r) => r.top + r.height));
    const left = Math.min(...target.rects.map((r) => r.left));
    const right = Math.max(...target.rects.map((r) => r.left + r.width));
    const toolbarBottom = (document.querySelector('.pp-toolbar')?.getBoundingClientRect().bottom ?? GAP) + 8;
    const above = top - h - 8;
    setMenuPosition({
      top: above >= toolbarBottom ? above : bottom + 8,
      left: Math.min(Math.max((left + right) / 2 - w / 2, 8), window.innerWidth - w - 8),
    });
  }, [target]);

  const dismiss = interaction.onDismissMenu;
  useEffect(() => {
    if (!target) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) dismiss();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss();
    };
    const container = scrollRef.current;
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', dismiss);
    container?.addEventListener('scroll', dismiss, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', dismiss);
      container?.removeEventListener('scroll', dismiss);
    };
  }, [target, dismiss]);

  // ---- Comment notes ---------------------------------------------------------
  // Pinned to their passages on the paper. Closed notes keep their layout for when they reopen.
  // The runtime keeps the layouts (and saves them with the paper); changes go back through onNoteLayouts.
  const noteLayouts = interaction.noteLayouts;
  const latestNotes = useRef(noteLayouts);
  latestNotes.current = noteLayouts;
  const setNoteLayouts = (update: (current: readonly NoteLayout[]) => NoteLayout[]) => {
    const next = update(latestNotes.current);
    latestNotes.current = next;
    interaction.onNoteLayouts(next);
  };
  const topZ = useRef(1);
  topZ.current = Math.max(topZ.current, ...noteLayouts.map((n) => n.z));

  /** Opens (or unfolds and brings forward) the note for an annotation; a new one opens just below its passage. */
  const openNote = (id: string) =>
    setNoteLayouts((current) => {
      const z = ++topZ.current;
      if (current.some((n) => n.id === id)) return current.map((n) => (n.id === id ? { ...n, open: true, collapsed: false, z } : n));
      const rects = interaction.annotationRects(id) ?? [];
      const first = rects[0];
      const bottom = rects.length ? Math.max(...rects.map((r) => r.top + r.height)) : 0;
      // Start under the passage, shifted left if it would run past the visible paper area.
      const visibleRight = (scrollRef.current?.getBoundingClientRect().right ?? window.innerWidth) - 12;
      const dx = first ? Math.min(0, visibleRight - NOTE_SIZE.width - first.left) : 0;
      return [...current, { id, dx, dy: first ? bottom - first.top + 10 : 0, width: NOTE_SIZE.width, height: NOTE_SIZE.height, zoom: zoomPercent, collapsed: false, open: true, z }];
    });

  const removeComment = async (id: string) => {
    const undo = interaction.onAnnotationCommentDelete
      ? await interaction.onAnnotationCommentDelete(id)
      : (interaction.onAnnotationComment(id, ''), undefined);
    if (undo === null) return;
    setNoteLayouts(current=>current.map(n=>n.id===id?{...n,open:false}:n));
    toast.show({message:'已删除评论，高亮保留',action:undo?{label:'撤销',onAction:undo}:undefined});
  };
  const deleteAnnotation = async (id: string) => {
    if (await interaction.onAnnotationDelete(id) === false) return;
    toast.show({
      message: '已删除批注',
      action: interaction.onAnnotationRestore ? { label: '撤销', onAction: () => interaction.onAnnotationRestore?.(id) } : undefined,
    });
  };

  const copyText = (text: string) =>
    void navigator.clipboard?.writeText(text).then(
      () => toast.show({ message: '已复制' }),
      () => toast.show({ message: '无法访问剪贴板', tone: 'warning' }),
    );

  // ---- Find --------------------------------------------------------------------
  // ⌘F / Ctrl+F opens the bar (with the selected words, if any); ⌘G steps while it is open.
  const [find, setFind] = useState<{ query?: string; key: number } | null>(null);
  const [toolbarWidth, setToolbarWidth] = useState<number | null>(null);
  const openFind = () => {
    const selected = window.getSelection()?.toString().trim() ?? '';
    const query = selected && selected.length <= 80 && !selected.includes('\n') ? selected : undefined;
    // Already open with nothing new to look for: just focus it.
    if (find && query === undefined) {
      document.querySelector<HTMLInputElement>('.pp-findbar__input')?.select();
      return;
    }
    setFind({ query, key: Date.now() });
    // Measured now so the bar opens in place rather than sliding there.
    setToolbarWidth(document.querySelector<HTMLElement>('.pp-toolbar')?.offsetWidth ?? null);
  };
  // The bar hangs under the toolbar's right end (see reader.css), which needs the toolbar's width.
  useLayoutEffect(() => {
    if (!find) return;
    const width = document.querySelector<HTMLElement>('.pp-toolbar')?.offsetWidth ?? null;
    if (width !== toolbarWidth) setToolbarWidth(width);
  });
  const closeFind = () => {
    setFind(null);
    interaction.onSearchClose();
  };
  const latestFind = useRef({ openFind, step: interaction.onSearchStep, open: Boolean(find) });
  latestFind.current = { openFind, step: interaction.onSearchStep, open: Boolean(find) };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === 'f') {
        event.preventDefault();
        latestFind.current.openFind();
      } else if (key === 'g' && latestFind.current.open) {
        event.preventDefault();
        latestFind.current.step(event.shiftKey ? -1 : 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const nextRotation = ((interaction.rotation + 90) % 360) as Rotation;

  // ---- Layout variables ----------------------------------------------------
  const style = {
    '--pp-edge-left': px(edges.left),
    '--pp-edge-right': px(paperRight),
    '--pp-trans-right': px(edges.right),
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
    '--pp-trans-w': px(translationWidth),
  } as CSSProperties;

  // Distance from the window edge to the card's inner (rail-side) content edge.
  const rail = GAP + RAIL_THICKNESS;
  const panelTitle = researchPanels.find((item) => item.id === panel)?.label ?? '';

  return (
    <div
      className="pp-reader"
      data-placement={effectivePlacement}
      data-switching={switching ?? undefined}
      data-resizing={resizing || windowResizing || translationDrag ? 'true' : undefined}
      data-translation={translationOpen ? (translationFloating ? 'floating' : 'docked') : undefined}
      style={style}
    >
      <div ref={scrollRef} className="pp-reader__paper">
        {paper}
      </div>
      <OverlayScrollbar target={scrollRef} dragLabel={`第 ${pageIndex + 1} / ${header.pageCount} 页`} />

      {translationOpen && (
        <TranslationDockContext.Provider value={translationDock}>
          <div
            className="pp-reader__translation"
            data-floating={translationFloating ? 'true' : undefined}
            style={translationFloating ? { left: floatRect.x, top: floatRect.y, width: floatRect.w, height: floatRect.h } : undefined}
          >
            {translationFloating ? (
              (['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as const).map((dir) => (
                <span key={dir} className="pp-tr-resize" data-dir={dir} aria-hidden="true" onPointerDown={startTranslationGesture(dir)} />
              ))
            ) : (
              <div
                className="pp-tr-handle"
                role="separator"
                aria-orientation="vertical"
                aria-label="拖动调整译文栏宽度，双击恢复"
                data-dragging={translationDrag ? 'true' : undefined}
                onPointerDown={startTranslationGesture('dock')}
                onDoubleClick={() => setTranslationPref(null)}
              />
            )}
            {props.translation!.pane}
          </div>
        </TranslationDockContext.Provider>
      )}

      <ReaderSidebar
        open={sidebarOpen}
        outline={outline}
        navigationPending={props.navigationPending}
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
        autoHighlight={interaction.tool === 'auto-highlight'}
        onToggleSidebar={() => setSidebarPref(!sidebarOpen)}
        saved={library?.saved}
        saveRef={saveRef}
        saveOpen={saveOpen}
        onSave={library ? () => setSaveOpen((open) => !open) : undefined}
        onPageSubmit={props.onNavigate}
        onZoom={props.onZoom}
        onZoomTo={props.onZoomTo}
        onTogglePlacement={togglePlacement}
        onToggleAutoHighlight={() => interaction.onToolChange(interaction.tool === 'auto-highlight' ? 'select' : 'auto-highlight')}
        findOpen={Boolean(find)}
        onFind={() => (find ? closeFind() : openFind())}
        rotation={interaction.rotation}
        onRotate={() => interaction.onRotate(nextRotation)}
        onResetRotation={() => interaction.onRotate(0)}
        settingsRef={settingsRef}
        settingsOpen={settingsOpen}
        onSettings={props.settings ? () => setSettingsOpen((open) => !open) : undefined}
        translationOpen={props.translation ? translationOpen : undefined}
        onToggleTranslation={props.translation?.onToggle}
        onBack={props.onBack}
        onOriginalPdf={props.onOriginalPdf}
        exports={props.exports}
        onExport={props.onExport}
        onTool={props.onTool}
      />

      {find && (
        <FindBar
          key={find.key}
          search={interaction.search}
          initialQuery={find.query}
          onSearch={interaction.onSearch}
          onStep={interaction.onSearchStep}
          onClose={closeFind}
          style={toolbarWidth !== null ? ({ '--pp-toolbar-w': px(toolbarWidth) } as CSSProperties) : undefined}
        />
      )}

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
                    onColor={interaction.onAnnotationColor}
                    onComment={interaction.onAnnotationComment}
                    onDelete={deleteAnnotation}
                    onRemoveComment={removeComment}
                    onCopyAll={() => props.onTool('copy-annotations')}
                    onExport={() => props.onTool('export-annotations')}
                  />
                ) : id === 'notes' ? (
                  <NotesPanel value={notes.value} onChange={notes.onChange} local={notes.local} sync={notes.sync} simulated={notes.simulated} />
                ) : (
                  (props.panels?.[id] ?? <PlaceholderPanel title={label} icon={icon} description={placeholderText[id] ?? ''} />)
                )}
              </div>
            );
          })}
        </div>
        <FunctionRail placement={effectivePlacement} active={panel} panelOpen={panelOpen} onSelect={selectPanel} />
      </GlassSurface>

      {props.settings && <QuickSettings {...props.settings} anchorRef={settingsRef} open={settingsOpen} onClose={() => setSettingsOpen(false)} />}

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

      {target && (
        <div
          ref={menuRef}
          className="pp-reader__selmenu"
          style={menuPosition ? { top: menuPosition.top, left: menuPosition.left } : { visibility: 'hidden' }}
          // Keep the text selection while the pointer is on the menu.
          onMouseDown={(event) => event.preventDefault()}
        >
          {target.kind === 'selection' ? (
            <SelectionMenu
              label="选区操作"
              look={bar.look}
              layout={barLayout}
              actions={selectionActions}
              onColor={(color) => {
                void interaction.onCreateHighlight(target.id, color);
                dismiss();
              }}
              onAction={(action) => {
                if (action === 'comment') {
                  // A comment starts as a highlight in the last colour, with its note open.
                  void interaction.onCreateHighlight(target.id).then((id) => id && openNote(id));
                } else {
                  interaction.onSelectionAction(target.id, action);
                }
                dismiss();
              }}
              onDismiss={dismiss}
            />
          ) : (
            <SelectionMenu
              label="高亮操作"
              look={bar.look}
              layout={barLayout}
              // The same actions as a fresh selection, with the comment opening its note.
              actions={selectionActions.map((action) => (action.id === 'comment' && targetAnnotation?.note ? { ...action, label: '查看评论' } : action))}
              currentColor={targetAnnotation?.color}
              onColor={(color) => interaction.onAnnotationColor(target.annotationId, color)}
              onAction={(action) => {
                if (action === 'comment') openNote(target.annotationId);
                else if (action === 'copy') {
                  if (targetAnnotation?.quote) copyText(targetAnnotation.quote);
                } else interaction.onAnnotationAction(target.annotationId, action);
                dismiss();
              }}
              onDelete={() => {
                deleteAnnotation(target.annotationId);
                dismiss();
              }}
              onDismiss={dismiss}
            />
          )}
        </div>
      )}

      <CommentNotes
        notes={noteLayouts}
        zoomPercent={zoomPercent}
        annotations={annotations}
        container={paperElement}
        layoutKey={`${zoomPercent}:${interaction.rotation}:${effectivePlacement}:${effectiveWidth}:${effectiveHeight}:${sidebarOpen}:${translationDocked ? translationWidth : 0}`}
        annotationRects={interaction.annotationRects}
        subscribeGeometry={interaction.subscribeGeometry}
        onChange={(note) => setNoteLayouts((current) => current.map((n) => (n.id === note.id ? note : n)))}
        onRaise={(id) => setNoteLayouts((current) => current.map((n) => (n.id === id && n.z !== topZ.current ? { ...n, z: ++topZ.current } : n)))}
        onClose={(id) => setNoteLayouts((current) => current.map((n) => (n.id === id ? { ...n, open: false } : n)))}
        onComment={interaction.onAnnotationComment}
        onRemoveComment={removeComment}
        onLocate={props.onLocateAnnotation}
      />
    </div>
  );
}
