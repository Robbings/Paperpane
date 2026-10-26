declare module 'pdfjs-dist/build/paperpane-highlight-geometry.mjs' {
  import type { PdfRect } from '@/contracts/document';
  export function mergeHighlightRects(rects: readonly PdfRect[]): PdfRect[];
}
