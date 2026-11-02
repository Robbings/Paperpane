import { AnnotationEditorType } from 'pdfjs-dist';
import type { AnnotationEditorUIManager } from 'pdfjs-dist/types/src/display/editor/tools';
import type { AnnotationEditor } from 'pdfjs-dist/types/src/display/editor/editor';
import type { Annotation } from '@/contracts/annotations';
import type { PDFViewer } from 'pdfjs-dist/web/pdf_viewer.mjs';

export const pdfHighlightColors = { yellow: '#FFFF98', green: '#53FFBC', blue: '#80EBFF', pink: '#FFCBE6', purple: '#DCCBFF' } as const;
/** Reconstruct the native, patched PDF.js outline from durable PDF-point quads.
 * Native editor instances are disposable display objects, never business identities.
 */
export class SavedHighlights {
  private editors = new Map<string, { signature: string; editor: AnnotationEditor }>();
  private items: readonly Annotation[] = [];
  private running = false;
  private again = false;
  private closed = false;
  constructor(private manager: AnnotationEditorUIManager, private viewer: PDFViewer, private onError: (message: string) => void) {}
  set(items: readonly Annotation[]) { this.items = items; void this.render(); }
  async render() {
    if (this.closed) return;
    if (this.running) { this.again = true; return; }
    this.running = true;
    try {
      do {
        this.again = false;
        const wanted = new Map<string, { row: Annotation; page: Annotation['anchor']['pages'][number]; signature: string }>();
        for (const row of this.items) if (!row.deletedAt && row.kind === 'highlight') for (const page of row.anchor.pages) {
          wanted.set(`${row.id}:${page.pageIndex}`, { row, page, signature: JSON.stringify([row.color, page.rects]) });
        }
        for (const [key, old] of this.editors) if (old.signature !== wanted.get(key)?.signature) { old.editor.remove(); this.editors.delete(key); }
        for (const [key, { row, page, signature }] of wanted) {
          if (this.closed) return;
          if (this.editors.has(key)) continue;
          const layer = this.manager.getLayer(page.pageIndex);
          const view = this.viewer.getPageView(page.pageIndex);
          if (!layer || !view?.pdfPage || !layer.div?.isConnected) continue;
          const [x, y] = view.pdfPage.view;
          const quads = page.rects.flatMap(r => [r.x+x, r.y+r.height+y, r.x+r.width+x, r.y+r.height+y, r.x+x, r.y+y, r.x+r.width+x, r.y+y]);
          const xs = page.rects.flatMap(r => [r.x+x, r.x+r.width+x]);
          const ys = page.rects.flatMap(r => [r.y+y, r.y+r.height+y]);
          const color = pdfHighlightColors[row.color].slice(1).match(/../g)!.map(s => parseInt(s, 16));
          const editor = await layer.deserialize({ annotationType: AnnotationEditorType.HIGHLIGHT, pageIndex: page.pageIndex, rect: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], rotation: 0, quadPoints: quads, color, opacity: 1 });
          if (!editor) throw new Error('PDF.js 未能还原高亮');
          if (this.closed) { editor.remove(); return; }
          // Inert before layer.add: PDF.js must not steal focus from a comment input.
          editor.render().inert = true;
          layer.add(editor); editor.disableEditing(); this.manager.unselectAll();
          this.editors.set(key, { signature, editor });
        }
      } while (this.again);
    } catch (error) { if (!this.closed) this.onError(error instanceof Error ? error.message : '高亮绘制失败'); }
    finally { this.running = false; }
  }
  dispose() { this.closed = true; this.editors.clear(); }
}
