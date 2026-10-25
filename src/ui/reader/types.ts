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
  note?: string;
}

export interface TextSelectionSnapshot {
  text: string;
  /** Viewport rectangle of the selection when it was taken. */
  rect: { top: number; left: number; bottom: number; right: number };
}
