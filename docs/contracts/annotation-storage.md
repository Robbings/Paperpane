# Annotation persistence

The canonical annotation is a business record in the same IndexedDB database as the document and original file. PDF.js editors, DOM nodes, selections and viewport rectangles are disposable projections. They must not become record IDs or be saved as application data.

## Schema and migration

Database `paperpane`, version 3, adds two stores without clearing or replacing existing stores. Version 1 contains document/file storage; version 2 adds library records. Upgrading either version preserves those records and adds the missing stores.

| Store | Key / index | Data |
| --- | --- | --- |
| `annotations` | `id`; `byDocument` on `[documentId, fileVersion]` stored as `documentKey` | `Annotation`, including anchor, quote, color, comment, source, revision and optional deletion timestamp |
| `annotationLayouts` | annotation `id`; same compound document index | Independent revision plus `AnnotationNoteLayout` and exact document reference |
| `changes` | existing automatic sequence | Entity, ID, document/file reference, revision, base revision, device ID, operation, timestamp |

An annotation ID is a UUID allocated before its create transaction. The file version is the imported original file's SHA-256 identity. A different PDF version never silently inherits an old anchor. One cross-page selection is **one annotation** with several page anchors, not independent annotations that can partly save or delete.

Anchors use unrotated crop-box-relative PDF points, origin bottom-left; each page index is zero-based. Save the original selected text alongside per-page quoted text. Window coordinates, scroll offset, zoom, device pixel ratio and menu position are not annotation geometry. Comments remain plain text in this phase.

Note layout is presentation data: CSS-pixel offsets relative to a freshly projected passage, width/height, collapsed/open state and stacking order. It has its own revision so dragging a note does not conflict with editing its comment. Deleting an annotation retains its layout for restoration.

## Writes, conflicts and recovery

- Creation validates document identity, file version, page bounds and finite positive rectangles. It saves the annotation and its change record in one strict transaction. The first annotation also promotes a browsed document from record-only to record-and-file synchronization scope in that transaction. Actual WebDAV transfer is a later service.
- Update, soft deletion and restore require the expected revision. Every successful write receives a new revision. A stale revision returns `CONFLICT`, without modifying stored data.
- UI comments update synchronously and writes are queued immediately. Acknowledging an older write cannot replace newer text, including A → B → A edits. Failed drafts stay visible with a failed save state; retry uses the original revision, so it cannot silently overwrite another window.
- Delete is reported as successful only after transaction completion. Undo uses the exact deletion revision returned by that operation, not a later revision obtained by refreshing. A later conflicting change is therefore protected.
- BroadcastChannel invalidates other open annotation sessions after commit. Pending or failed local drafts retain their baseline revision until explicitly resolved. A document switch waits for accepted writes and refuses to discard failed drafts. Closing with pending/failed work requests the browser's unsaved-changes protection.
- `clearCache()` opens only the cache store. Original PDF files, annotations, note layouts and synchronization changes are not cache. Clearing all browser site/extension data or uninstalling the extension is a separate destructive operation; WebDAV backup is not implemented by this phase.

## Library boundary

Use the library's existing `DocumentRef`, `PaperDatabase.readFile`, file store and reading-position writer. The reader accepts `reader.html?item=<library-item-id>` or `?documentId=<document-id>`. An item without a PDF reports that the original file must first be associated in the library. The PDF feature does not create another library, duplicate the file store, change folder/tag operations, or modify library-owned worktrees.

The library can later query live annotation counts from `byDocument`, excluding tombstones. Do not fabricate counts or modify library rows to cache a second source of truth in this slice.

## Rendering and scope

The adapter reconstructs per-page native PDF.js highlight editors from the saved PDF quads and color. Its approved geometry patch joins same-line fragments and unions overlapping bands; palette and opacity remain unchanged. Native editor objects are inert, and native editor mode stays NONE. All edits and undo originate from the existing controlled Paperpane UI.

Both `reader.html` and the compatibility `reader-proof.html` URL use this integration. The delivered slice covers real stored PDFs, controlled selection/auto-highlight menus, CRUD, comments, note layout and persistence. Complete navigation, embedded-PDF annotation import, OCR, WebDAV and annotated-PDF export remain separate work. Markdown/CSV export exports the canonical live records, excluding deleted rows and refusing unsaved drafts.

## 便签缩放与评论删除

便签布局可带 `zoom`（25–400 的百分比）：dx/dy/width/height 以该缩放下的 CSS 像素记录，显示时乘以当前缩放 / zoom。旧布局没有 zoom 时按 100 处理。拖拽范围限于页面及一屏左右的右侧留白，边缘拖拽会滚动论文区。布局字段沿用独立修订号，不修改原文锚点。

“仅删除评论”只更新 comment 为空并关闭便签，保留批注 ID、颜色与高亮锚点；“删除整条批注”才写入删除标记。两种操作分别提供撤销。
