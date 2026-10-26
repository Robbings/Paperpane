import type { DockPlacement } from './types';

// Floating layout metrics, in CSS pixels.
export const GAP = 10;
export const SIDEBAR_WIDTH = 240;
/** The function rail is the research card's edge: this thick across... */
export const RAIL_THICKNESS = 48;
/** ...and, when collapsed, this long (6 icon buttons, vertical) or this wide (6 labelled buttons, horizontal). */
export const RAIL_LENGTH = 6 * 36 + 5 * 4 + 12;
export const RAIL_ROW_LENGTH = 6 * 72 + 5 * 4 + 12;
/** Space between the paper area and the research card. */
export const RAIL_GAP = 8;

export const RESEARCH_WIDTH = { default: 380, min: 320, max: 640 } as const;
export const RESEARCH_HEIGHT = { default: 320, min: 220, max: 640 } as const;

/** The paper area must stay at least this wide; narrower windows fold the sidebar away first... */
export const PAPER_COMFORT_WIDTH = 520;
/** ...and then move the research area to the bottom. */
export const PAPER_MIN_WIDTH = 400;

export const clampWidth = (value: number, viewportWidth: number) =>
  Math.round(Math.min(Math.max(value, RESEARCH_WIDTH.min), Math.min(RESEARCH_WIDTH.max, viewportWidth * 0.5)));

export const clampHeight = (value: number, viewportHeight: number) =>
  Math.round(Math.min(Math.max(value, RESEARCH_HEIGHT.min), Math.min(RESEARCH_HEIGHT.max, viewportHeight * 0.6)));

/**
 * Toolbar density from the room above the paper. Widths are the toolbar's
 * natural size at each density, with and without the title.
 */
export function toolbarDensity(room: number, showTitle: boolean): 'full' | 'compact' | 'tight' {
  // Measured with the bookmark button; the title keeps at least ~96px.
  const full = showTitle ? 720 : 610;
  const compact = showTitle ? 640 : 540;
  return room >= full ? 'full' : room >= compact ? 'compact' : 'tight';
}

/** Width left for the paper with the given chrome. */
export function paperWidth(options: {
  viewportWidth: number;
  sidebarDocked: boolean;
  placement: DockPlacement;
  panelOpen: boolean;
  width: number;
}): number {
  const { viewportWidth, sidebarDocked, placement, panelOpen, width } = options;
  const left = sidebarDocked ? GAP + SIDEBAR_WIDTH + GAP : GAP;
  const right = placement === 'right' ? GAP + RAIL_THICKNESS + (panelOpen ? width : 0) + RAIL_GAP : GAP;
  return viewportWidth - left - right;
}

interface Edges {
  /** Distance from the window's left edge to where the paper area starts. */
  left: number;
  right: number;
  bottom: number;
}

export function layoutEdges(options: {
  placement: DockPlacement;
  sidebarDocked: boolean;
  panelOpen: boolean;
  width: number;
  height: number;
}): Edges {
  const { placement, sidebarDocked, panelOpen, width, height } = options;
  const card = GAP + RAIL_THICKNESS + RAIL_GAP;
  return {
    left: sidebarDocked ? GAP + SIDEBAR_WIDTH + GAP : GAP,
    right: placement === 'right' ? card + (panelOpen ? width : 0) : GAP,
    bottom: placement === 'bottom' ? card + (panelOpen ? height : 0) : GAP,
  };
}
