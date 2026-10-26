/** A rectangle in page coordinates: CSS pixels from the rendered page's top-left corner. */
export interface PageRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Briefly marks a passage after the reader jumps to it from a source marker.
 * Render it inside the page element (which is positioned), with the passage's
 * line boxes in page coordinates; it fades by itself, so remove it afterwards.
 */
export function LocateFlash({ rects }: { rects: readonly PageRect[] }) {
  return (
    <>
      {rects.map((rect, index) => (
        <span
          key={index}
          className="pp-locate-flash"
          aria-hidden="true"
          style={{ left: rect.left - 2, top: rect.top - 1, width: rect.width + 4, height: rect.height + 2 }}
        />
      ))}
    </>
  );
}
