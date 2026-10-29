import { useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react';

/** Keep a substantial part of the paper visible even at a floating card's outer limit. */
export const floatingMargin = (container: Pick<HTMLElement, 'clientWidth'>) => Math.max(0, Math.min(320, Math.floor(container.clientWidth / 3)));
export const floatingLeft = (container: Pick<HTMLElement, 'clientWidth'>, left: number) => Math.max(12 - floatingMargin(container), Number.isFinite(left) ? left : 12);

/** A positive scroll origin for cards placed left of the PDF. Offsets stay relative to the source. */
export class FloatingCanvas {
  private inset = 0;
  private extents = new Map<symbol, number>();
  private listeners = new Set<() => void>();
  private surface?: HTMLElement;
  private original?: { width: string; margin: string; widthPriority: string; marginPriority: string };
  constructor(private container: HTMLElement) {}
  getSnapshot = () => this.inset;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  set(id: symbol, left: number | null) {
    if (left === null || !Number.isFinite(left)) this.extents.delete(id);
    else this.extents.set(id, left);
    this.apply();
  }
  remove(id: symbol) { this.extents.delete(id); this.apply(); }
  private apply() {
    const min = Math.min(12, ...this.extents.values());
    const next = Math.min(floatingMargin(this.container), Math.ceil(Math.max(0, 12 - min)));
    if (next === this.inset) return;
    const surface = this.surface ?? this.container.querySelector<HTMLElement>('.pdfViewer');
    if (!surface) return;
    this.surface = surface;
    if (!this.original) this.original = {
      width: surface.style.getPropertyValue('width'), margin: surface.style.getPropertyValue('margin-left'),
      widthPriority: surface.style.getPropertyPriority('width'), marginPriority: surface.style.getPropertyPriority('margin-left'),
    };
    const delta = next - this.inset, scroll = this.container.scrollLeft;
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
    this.container.scrollLeft = Math.max(0, scroll + delta);
    this.listeners.forEach(listener => listener());
    // PDF.js and the shared overlays remeasure after this genuine layout/scroll-origin change.
    this.container.dispatchEvent(new Event('scroll'));
  }
}

const spaces = new WeakMap<HTMLElement, FloatingCanvas>();
const zero = () => 0, noop = () => {}, emptySubscribe = () => noop;
export function useFloatingCanvas(container: HTMLElement | null, left: number | null) {
  const id = useRef(Symbol('floating-card'));
  const space = useMemo(() => {
    if (!container) return undefined;
    let value = spaces.get(container);
    if (!value) { value = new FloatingCanvas(container); spaces.set(container, value); }
    return value;
  }, [container]);
  const readInset = space?.getSnapshot ?? zero;
  const inset = useSyncExternalStore(space?.subscribe ?? emptySubscribe, readInset, zero);
  useLayoutEffect(() => { space?.set(id.current, left); });
  useLayoutEffect(() => () => { space?.remove(id.current); }, [space]);
  return { inset, readInset };
}
