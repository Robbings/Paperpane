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
  kind: 'highlight' | 'comment';
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
  /** Other menu actions on a selection: translate, explain, ask, copy. */
  onSelectionAction: (selectionId: string, action: string) => void;
  onAnnotationColor: (annotationId: string, color: HighlightColor) => void;
  onAnnotationComment: (annotationId: string, comment: string) => void;
  onAnnotationDelete: (annotationId: string) => void;
  /** Undoes a delete (offered right after deleting). */
  onAnnotationRestore?: (annotationId: string) => void;
  /** Where an annotation's text is on screen now, or null when its page is not rendered. Read while drawing a note's connector. */
  annotationRects: (annotationId: string) => readonly ViewRect[] | null;
}
