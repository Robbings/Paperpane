import type { HighlightColor } from '@/ui/components';

// View models for the reader UI. They describe what the screen needs, not how
// data is stored; the logic layer maps contract types onto them.

export type DockPlacement = 'right' | 'bottom';

export type ResearchPanelId = 'overview' | 'discuss' | 'explain' | 'annotations' | 'notes' | 'cite';

export interface DocumentHeaderView {
  title: string;
  /** e.g. "本地文件" or the source host. */
  sourceLabel: string;
  pageCount: number;
}

export interface OutlineItemView {
  id: string;
  label: string;
  level: number;
  /** 0-based. */
  pageIndex: number;
}

export interface AnnotationView {
  id: string;
  /** 'comment' is pinned to a place on the page; 'highlight' is on text, highlighted or not. */
  kind: 'highlight' | 'comment';
  /** False for a comment on text without a highlight. Omitted means highlighted. */
  highlighted?: boolean;
  color: HighlightColor;
  /** 0-based. */
  pageIndex: number;
  quote?: string;
  /** The reader's comment on it. */
  note?: string;
}

/** A rectangle in window CSS pixels. */
export interface ViewRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * What the floating menu acts on. The runtime decides this: it captures text
 * selections and hit-tests clicks on existing highlights; the shell only
 * shows the menu next to `rects` (window pixels, one per line).
 */
export type ReaderMenuTarget =
  | { kind: 'selection'; id: string; text: string; rects: readonly ViewRect[] }
  | { kind: 'annotation'; annotationId: string; rects: readonly ViewRect[] };

/** "auto-highlight": a finished selection becomes a highlight in the last colour at once. */
export type ReaderTool = 'select' | 'auto-highlight';

export type Rotation = 0 | 90 | 180 | 270;

/** Find in the paper: what is being looked for and where the runtime is in the results. */
export interface ReaderSearchState {
  query: string;
  matchCase: boolean;
  wholeWord: boolean;
  status: 'idle' | 'searching' | 'done';
  total: number;
  /** 1-based index of the selected match; 0 when there is none. */
  current: number;
}

/**
 * A comment note's layout, kept per annotation so it can be restored when the
 * paper is opened again. The note is pinned to its passage: (dx, dy) is its
 * offset in CSS pixels from the passage's top-left corner on the paper.
 */
export interface NoteLayout {
  /** Zoom percentage at which offsets and dimensions were recorded; legacy layouts use 100. */
  zoom?: number;
  id: string;
  dx: number;
  dy: number;
  width: number;
  height: number;
  collapsed: boolean;
  /** False when closed; the layout stays for when it reopens. */
  open: boolean;
  /** Stacking order among open notes. */
  z: number;
}

/**
 * How the runtime drives reading and annotating. The shell owns the visuals
 * (menu, comment notes, annotation list); selection capture, hit-testing,
 * geometry and storage belong to the runtime.
 */
export interface ReaderInteraction {
  /** The paper's scroll container, handed over once mounted (null on unmount). */
  onScrollContainer: (element: HTMLDivElement | null) => void;
  menuTarget: ReaderMenuTarget | null;
  /** Esc, a click elsewhere or scrolling closes the menu. */
  onDismissMenu: () => void;
  tool: ReaderTool;
  onToolChange: (tool: ReaderTool) => void;
  /** Highlights a captured selection; no colour means the last one used. Resolves to the new annotation id, or null if it failed. */
  onCreateHighlight: (selectionId: string, color?: HighlightColor) => Promise<string | null>;
  /** A comment on the selection without a highlight. Without it, a comment starts as a highlight. */
  onCreateComment?: (selectionId: string) => Promise<string | null>;
  /**
   * Sets a text annotation's highlight, or removes it (null, or its current colour). Resolves to
   * what happened: removing keeps the comment; with no comment the annotation is deleted.
   */
  onAnnotationHighlight?: (annotationId: string, color: HighlightColor | null) => Promise<'highlighted' | 'removed' | 'deleted' | null>;
  /** Other menu actions on a selection: translate, explain, ask, copy. */
  onSelectionAction: (selectionId: string, action: string) => void;
  /** Translate, explain or ask about an existing highlight's text. */
  onAnnotationAction: (annotationId: string, action: string) => void;
  onAnnotationColor: (annotationId: string, color: HighlightColor) => void;
  /**
   * The comment as typed, on every edit (the note does not wait or batch).
   * The runtime keeps it, debounces durable writes, and flushes on close or
   * document switch; a deleted annotation simply ignores later calls.
   */
  onAnnotationComment: (annotationId: string, comment: string) => void;
  /** Resolves after saving; returned undo is tied to that deletion revision. Null means deletion failed. */
  onAnnotationCommentDelete?: (annotationId: string) => Promise<(() => void | Promise<void>) | null>;
  onAnnotationDelete: (annotationId: string, onlyIfEmpty?: boolean) => void | Promise<boolean>;
  /** Undoes a delete (offered right after deleting). */
  onAnnotationRestore?: (annotationId: string) => void | Promise<void>;
  /** Where an annotation's text is on screen now, or null when its page is not rendered. Read while drawing a note's connector. */
  annotationRects: (annotationId: string) => readonly ViewRect[] | null;
  /**
   * Notifies when annotation positions may have changed without the window
   * changing: a page finished rendering, zoom, rotation, relayout. Notes measure
   * again. Returns the unsubscribe function (backed by AnchorService.subscribeProjection).
   */
  subscribeGeometry: (listener: () => void) => () => void;

  /** Page rotation, applied by the runtime to every page. */
  rotation: Rotation;
  onRotate: (rotation: Rotation) => void;

  /** Find: the runtime searches the text layer, marks all matches and scrolls to the current one. */
  search: ReaderSearchState;
  onSearch: (query: string, options: { matchCase: boolean; wholeWord: boolean }) => void;
  onSearchStep: (direction: 1 | -1) => void;
  /** The find bar closed: clear the marks. */
  onSearchClose: () => void;

  /** Comment notes' layouts, saved by the runtime with the paper and handed back when it reopens. */
  noteLayouts: readonly NoteLayout[];
  onNoteLayouts: (layouts: NoteLayout[]) => void;
}
