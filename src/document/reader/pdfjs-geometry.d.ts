declare module 'pdfjs-dist/build/paperpane-highlight-geometry.mjs' {
  import type { PdfRect } from '@/contracts/document';
  export function mergeHighlightRects(rects: readonly PdfRect[]): PdfRect[];
}

declare module 'pdfjs-dist/build/paperpane-theme.mjs' {
  export function setPaperpaneViewerTheme(viewer: HTMLElement, theme: {background:string;foreground:string} | null): void;
}
