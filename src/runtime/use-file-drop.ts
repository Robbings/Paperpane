import { useEffect, useRef, useState } from 'react';

export const isPdfFile = (file: File) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

/** The first http(s) address in a link dragged in from another page, if any. */
export function droppedUrl(data: DataTransfer): string | undefined {
  const raw = data.getData('text/uri-list') || data.getData('text/plain');
  for (const line of raw.split(/\r?\n/)) {
    const value = line.trim();
    if (!value || value.startsWith('#')) continue;
    try { const url = new URL(value); if (url.protocol === 'http:' || url.protocol === 'https:') return url.href; } catch { /* Not an address. */ }
    return;
  }
}

/**
 * Whole-window drop target for PDF files and links dragged in from outside the page.
 * Drags that start inside the page (selected text, list rows) are left alone.
 */
export function useWindowFileDrop(onDrop: (drop: { files: File[]; url?: string }) => void, enabled = true) {
  const [active, setActive] = useState(false);
  const latest = useRef(onDrop);
  latest.current = onDrop;
  useEffect(() => {
    if (!enabled) return;
    let depth = 0, internal = false;
    const external = (event: DragEvent) => {
      const types = Array.from(event.dataTransfer?.types ?? []);
      return !internal && (types.includes('Files') || types.includes('text/uri-list'));
    };
    const start = () => { internal = true; };
    const end = () => { internal = false; depth = 0; setActive(false); };
    const enter = (event: DragEvent) => {
      if (!external(event)) return;
      // Cancelling dragenter too keeps the drop on this page instead of navigating to the file.
      event.preventDefault();
      depth++; setActive(true);
    };
    const over = (event: DragEvent) => {
      if (!external(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };
    const leave = (event: DragEvent) => {
      if (!external(event)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setActive(false);
    };
    const drop = (event: DragEvent) => {
      if (!external(event) || !event.dataTransfer) return;
      event.preventDefault();
      depth = 0; setActive(false);
      const files = Array.from(event.dataTransfer.files).filter(isPdfFile);
      const url = files.length ? undefined : droppedUrl(event.dataTransfer);
      if (files.length || url) latest.current({ files, url });
    };
    window.addEventListener('dragstart', start, true);
    window.addEventListener('dragend', end, true);
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragstart', start, true);
      window.removeEventListener('dragend', end, true);
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, [enabled]);
  return active;
}
