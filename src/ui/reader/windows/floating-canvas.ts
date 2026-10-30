import { useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react';

// DOMRect and applied CSS margins can round differently (e.g. during a layout
// transition). Never feed that subpixel residual back into the scroll origin.
const layoutPixel = (value: number) => Math.round(value * 64) / 64;

/** Leave movement room beyond one card, including when it is collapsed to a pill. */
export const floatingInsetLimit = (container: Pick<HTMLElement, 'clientWidth'>) => Math.max(0, container.clientWidth - 96);
export const floatingMargin = (container: Pick<HTMLElement, 'clientWidth'>, cardWidth = 360) =>
  Math.min(floatingInsetLimit(container), Math.max(520, Math.floor(container.clientWidth * 2 / 3), (Number.isFinite(cardWidth) ? Math.max(0, cardWidth) : 360) + 96));
export const floatingLeft = (container: Pick<HTMLElement, 'clientWidth'>, left: number, cardWidth = 360, paperLeft = 0) =>
  Math.max(paperLeft + 12 - floatingMargin(container, cardWidth), Number.isFinite(left) ? left : paperLeft + 12);

/** PDF bounds only: floating windows and their spacers must never enlarge their own limits. */
export function floatingPaperBounds(container: HTMLElement, inset = spaces.get(container)?.getSnapshot() ?? 0) {
  const box = container.getBoundingClientRect();
  const pages = [...container.querySelectorAll<HTMLElement>('.page, [data-page-index]')]
    .map(page => page.getBoundingClientRect()).filter(page => page.width > 0 && page.height > 0);
  return {
    left: pages.length ? layoutPixel(Math.min(...pages.map(page => page.left - box.left - container.clientLeft + container.scrollLeft - inset))) : 0,
    right: pages.length ? layoutPixel(Math.max(...pages.map(page => page.right - box.left - container.clientLeft + container.scrollLeft - inset))) : container.clientWidth,
    bottom: layoutPixel(Math.max(container.clientHeight, ...pages.map(page => page.bottom - box.top - container.clientTop + container.scrollTop))),
  };
}

/** A positive scroll origin for cards placed left of the PDF. Offsets stay relative to the source. */
export class FloatingCanvas {
  private inset = 0;
  private extents = new Map<symbol, {left:number;right:number}>();
  private rightSpacer?: HTMLElement;
  private rightExtent = 0;
  private listeners = new Set<() => void>();
  private surface?: HTMLElement;
  private original?: { width: string; margin: string; widthPriority: string; marginPriority: string };
  private container: HTMLElement;
  constructor(container: HTMLElement) { this.container = container; }
  getSnapshot = () => this.inset;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  set(id: symbol, left: number | null, right: number | null = left) {
    if (left === null || !Number.isFinite(left)) this.extents.delete(id);
    else this.extents.set(id, {left, right: right !== null && Number.isFinite(right) ? right : left});
    this.apply();
  }
  remove(id: symbol) { this.extents.delete(id); this.apply(); }
  private apply() {
    const min = Math.min(12, ...[...this.extents.values()].map(card => card.left));
    const paper = floatingPaperBounds(this.container, this.inset);
    const limit = Math.max(0, Math.floor(floatingInsetLimit(this.container) - Math.max(0, paper.left)));
    const next = Math.min(limit, Math.ceil(Math.max(0, 12 - layoutPixel(min))));
    const maxRight = Math.max(0, ...[...this.extents.values()].map(card => card.right));
    const rightExtent = layoutPixel(maxRight) > paper.right ? Math.ceil(layoutPixel(maxRight + next + 16)) : 0;
    if (next === this.inset && rightExtent === this.rightExtent) return;
    const surface = this.surface ?? this.container.querySelector<HTMLElement>('.pdfViewer');
    if (!surface) return;
    this.surface = surface;
    const delta = next - this.inset, scroll = this.container.scrollLeft;
    if (delta) {
      if (!this.original) this.original = {
        width: surface.style.getPropertyValue('width'), margin: surface.style.getPropertyValue('margin-left'),
        widthPriority: surface.style.getPropertyPriority('width'), marginPriority: surface.style.getPropertyPriority('margin-left'),
      };
      this.inset = next;
      if (next) {
        // Keep the original content width: an auto-width block would shrink by the new margin.
        surface.style.setProperty('width', '100%');
        surface.style.setProperty('margin-left', `${next}px`);
      } else {
        const original = this.original;
        original.width ? surface.style.setProperty('width', original.width, original.widthPriority) : surface.style.removeProperty('width');
        original.margin ? surface.style.setProperty('margin-left', original.margin, original.marginPriority) : surface.style.removeProperty('margin-left');
        this.original = undefined;
      }
    }
    this.rightExtent = rightExtent;
    if (rightExtent) {
      if (!this.rightSpacer) {
        this.rightSpacer = this.container.ownerDocument.createElement('div');
        this.rightSpacer.setAttribute('aria-hidden', 'true');
        this.rightSpacer.setAttribute('data-pp-overlay', '');
        this.rightSpacer.className = 'pp-floating-scroll-extent';
        this.rightSpacer.style.cssText = 'position:absolute;left:0;top:0;height:1px;pointer-events:none;';
        this.container.appendChild(this.rightSpacer);
      }
      this.rightSpacer.style.width = `${rightExtent}px`;
    } else {
      this.rightSpacer?.remove(); this.rightSpacer = undefined;
    }
    this.container.scrollLeft = Math.max(0, scroll + delta);
    this.listeners.forEach(listener => listener());
    // PDF.js and the shared overlays remeasure after this genuine layout/scroll-origin change.
    this.container.dispatchEvent(new Event('scroll'));
  }
}

const spaces = new WeakMap<HTMLElement, FloatingCanvas>();
const zero = () => 0, noop = () => {}, emptySubscribe = () => noop;
export function useFloatingCanvas(container: HTMLElement | null, left: number | null, right: number | null = left) {
  const id = useRef(Symbol('floating-card'));
  const space = useMemo(() => {
    if (!container) return undefined;
    let value = spaces.get(container);
    if (!value) { value = new FloatingCanvas(container); spaces.set(container, value); }
    return value;
  }, [container]);
  const readInset = space?.getSnapshot ?? zero;
  const inset = useSyncExternalStore(space?.subscribe ?? emptySubscribe, readInset, zero);
  useLayoutEffect(() => { space?.set(id.current, left, right); });
  useLayoutEffect(() => () => { space?.remove(id.current); }, [space]);
  return { inset, readInset };
}
