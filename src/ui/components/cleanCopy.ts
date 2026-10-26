import type { ClipboardEvent, DragEvent } from 'react';

/** Removes source markers ([^label]) and the space they leave before punctuation. */
export const stripSourceMarkers = (text: string) => text.replace(/\[\^[^\]]+\]/g, '').replace(/[ \t]+([，。；：、,.;:])/g, '$1');

/**
 * The selected text inside `root`, without elements marked `data-copy-skip`
 * (source markers and similar). Null when the selection is elsewhere.
 */
function selectedText(root: HTMLElement): string | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.anchorNode || !root.contains(selection.anchorNode)) return null;
  // Hide the skipped elements just while the browser serializes the selection.
  root.classList.add('pp-copy-clean');
  const text = selection.toString();
  root.classList.remove('pp-copy-clean');
  return text;
}

/**
 * Handlers for a container of generated text: copying or dragging a selection
 * leaves out source markers, so pasted text reads cleanly.
 */
export const cleanCopyHandlers = {
  onCopy(event: ClipboardEvent<HTMLElement>) {
    const text = selectedText(event.currentTarget);
    if (text === null) return;
    event.preventDefault();
    event.clipboardData.setData('text/plain', text);
  },
  onDragStart(event: DragEvent<HTMLElement>) {
    // Only text selections; draggable elements keep their own data.
    if (event.target instanceof HTMLElement && event.target.draggable) return;
    const text = selectedText(event.currentTarget);
    if (text === null) return;
    event.dataTransfer.clearData();
    event.dataTransfer.setData('text/plain', text);
  },
};
