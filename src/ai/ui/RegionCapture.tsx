import { useEffect, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { SelectionMenu, toast } from "@/ui/components";
import type { PdfjsReader } from "@/document/reader/pdfjs-reader";
import "./region.css";
interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(n, b));
/** Single-page crop selection. UI coordinates are converted by the PDF adapter. */
export function RegionCapture({
  reader,
  onAction,
  onClose,
  allowExplain = true,
}: {
  reader: PdfjsReader;
  allowExplain?: boolean;
  onAction: (
    value: Awaited<ReturnType<PdfjsReader["captureImage"]>>,
    action: string,
  ) => void;
  onClose: () => void;
}) {
  const container = reader.translationScrollElement(),
    [page, setPage] = useState<HTMLElement>(),
    [rect, setRect] = useState<Rect>(),
    [drag, setDrag] = useState<{
      x: number;
      y: number;
      corner?: string;
      rect?: Rect;
    }>(),
    [busy, setBusy] = useState(false),
    [, redraw] = useState(0);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    const update = () => {
      setRect(undefined);
      setPage(undefined);
      setDrag(undefined);
      redraw((n) => n + 1);
    };
    window.addEventListener("keydown", key, true);
    window.addEventListener("resize", update);
    container.addEventListener("scroll", update);
    return () => {
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("resize", update);
      container.removeEventListener("scroll", update);
    };
  }, [container, onClose]);
  const start = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || busy || (e.target as Element).closest("button"))
      return;
    const handle = (e.target as HTMLElement).dataset.corner;
    const target = handle
      ? page
      : [...container.querySelectorAll<HTMLElement>(".page")].find((p) => {
          const b = p.getBoundingClientRect();
          return (
            e.clientX >= b.left &&
            e.clientX <= b.right &&
            e.clientY >= b.top &&
            e.clientY <= b.bottom
          );
        });
    if (!target) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setPage(target);
    setDrag({ x: e.clientX, y: e.clientY, corner: handle, rect });
    if (!handle)
      setRect({ left: e.clientX, top: e.clientY, width: 0, height: 0 });
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag || !page) return;
    const b = page.getBoundingClientRect(),
      x = clamp(e.clientX, b.left, b.right),
      y = clamp(e.clientY, b.top, b.bottom);
    if (drag.corner && drag.rect) {
      const r = drag.rect,
        otherX = drag.corner.includes("w") ? r.left + r.width : r.left,
        otherY = drag.corner.includes("n") ? r.top + r.height : r.top;
      setRect({
        left: Math.min(x, otherX),
        top: Math.min(y, otherY),
        width: Math.abs(x - otherX),
        height: Math.abs(y - otherY),
      });
    } else
      setRect({
        left: Math.min(x, drag.x),
        top: Math.min(y, drag.y),
        width: Math.abs(x - drag.x),
        height: Math.abs(y - drag.y),
      });
  };
  const action = async (action: string) => {
    if (action === "cancel") {
      onClose();
      return;
    }
    if (!page || !rect || busy) return;
    setBusy(true);
    try {
      const value = await reader.captureImage(
        Number(page.dataset.pageNumber) - 1,
        rect,
      );
      if (action === "copy") {
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": value.blob }),
        ]);
        onClose();
      } else {
        onAction(value, action);
        onClose();
      }
    } catch (e) {
      setBusy(false);
      toast.show({
        tone: "error",
        duration: 4000,
        message: e instanceof Error ? e.message : "截图失败",
      });
    }
  };
  const bounds = container.getBoundingClientRect();
  return createPortal(
    <div
      className="pp-ai-capture"
      data-pp-overlay=""
      aria-label="单页图片框选"
      style={{
        left: bounds.left,
        top: bounds.top,
        width: container.clientWidth,
        height: container.clientHeight,
      }}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={() => setDrag(undefined)}
    >
      {rect ? (
        <div
          className="pp-ai-capture__rect"
          style={{
            left: rect.left - bounds.left,
            top: rect.top - bounds.top,
            width: rect.width,
            height: rect.height,
          }}
        >
          {["nw", "ne", "sw", "se"].map((c) => (
            <span key={c} data-corner={c} />
          ))}
        </div>
      ) : (
        <div className="pp-ai-capture__shade" />
      )}
      {rect && !drag && rect.width > 4 && rect.height > 4 && (
        <SelectionMenu
          label="截图操作"
          actions={[
            { id: "ask", label: "提问", icon: "ask" },
            ...(allowExplain
              ? [{ id: "explain", label: "解释", icon: "explain" as const }]
              : []),
            { id: "copy", label: "复制图片", icon: "copy" },
            { id: "cancel", label: "取消", icon: "close" },
          ]}
          layout={
            allowExplain
              ? ["ask", "explain", "copy", "cancel"]
              : ["ask", "copy", "cancel"]
          }
          onAction={(a) => void action(a)}
          look="text"
          style={{
            position: "absolute",
            left: clamp(
              rect.left - bounds.left,
              8,
              Math.max(8, bounds.width - 290),
            ),
            top: clamp(
              rect.top + rect.height - bounds.top + 8,
              8,
              Math.max(8, bounds.height - 52),
            ),
            pointerEvents: busy ? "none" : undefined,
          }}
        />
      )}
    </div>,
    document.body,
  );
}
