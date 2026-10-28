# Reader surface contract

Import jobs describe acquisition and inspection. `ReaderState` describes one mounted reading session; a readable import does not imply its pages have rendered.

## Ownership and mounting

The runtime owns the document reference, original-file read, PDF worker/viewer, text selections, geometry and cleanup. UI owns ReaderShell, ReaderToolbar, SelectionMenu, CommentNotes and the annotation list. The shell supplies its actual scroll container through `ReaderInteraction.onScrollContainer`; the runtime supplies one child PDF surface. No ancestor-selector bridge, duplicate scroll viewport or complete upstream viewer chrome is inserted.

The UI view models remain separate from portable shared DTOs. `reader-page` maps them; React refs and PDF.js instances stay outside contracts. Both reader entry URLs now use the controlled integration. Sample reader components remain design examples and are not the production entry.

## Selection, menus and geometry

`ReaderMenuTarget` distinguishes a new selection from an existing annotation. A new capture has an immutable ID, exact document/file identity, quote and per-page anchors. Mouse/keyboard ranges are clipped to leaf text nodes within each PDF.js text layer. Convert through page viewport transforms into unrotated crop-box-relative PDF points, origin bottom-left. Never persist CSS rectangles.

A new selection, dismissal, document switch or disposal invalidates the capture. Menu focus alone does not invalidate it. Actions resolve/copy the capture before dismissing, so a pending save cannot accidentally use a later selection. A cross-page capture creates one annotation; visible per-page projections can be used while other pages are not rendered.

`AnchorService.project('page')` returns page-content CSS pixels. `project('viewport')` returns window CSS pixels for fixed overlays. Scrolling invalidates viewport geometry; zoom, rotation and rendering invalidate both spaces. Unrendered pages return pending rather than stale rectangles. Version mismatch returns unavailable. Note placement and click detection use current projections, including after restoration.

## Interaction and state

- `select`: highlighting through the menu is a one-time operation and never enables the pen.
- `auto-highlight`: a completed selection is saved in the last chosen highlight color, then becomes an existing-annotation menu target. It uses the same controlled menu and database path as manual highlighting. Only the top toolbar changes this mode.
- Clicking an existing highlight opens its full menu. Color, comment, delete and restore operate on its stable business ID, never a PDF.js editor ID.
- Page indexes are zero-based. Zoom 1 means 100% at 96 CSS pixels/inch. First open fits the page width; a saved reading position restores numeric zoom and rotation. Native one-based page conversion stays inside the adapter.
- Commands before readiness return BUSY; invalid page/zoom/rotation values return INVALID_INPUT. Password request IDs expire when replaced/cancelled; passwords only reach the active in-memory callback. Cancel destroys the loading task.
- Load progress, text-layer availability, page labels and search state have explicit fields. Unknown text availability is not a claim that a scan is selectable. Page labels/complete navigation remain pending in this slice; unavailable navigation is visibly labelled rather than showing sample thumbnails.
- Snapshots remain stable between notifications. Disposal cancels loading, releases listeners/observers and destroys the worker. Switching documents flushes accepted business writes first.

## Persistence and rendering

See [annotation-storage.md](annotation-storage.md). The business database is authoritative for annotations, comments, tombstones and note layouts. Native PDF.js editor state is reconstructed display state. Native pen switching, menus and keyboard editing are not forwarded. The accepted continuous highlight geometry and light native colors/opacity are retained for both creation and restoration.

This slice reuses the library's file identity/storage and reading-position writer. It does not implement WebDAV, full reading navigation or annotated-PDF export. Existing search/rotation controls are connected to PDF.js; broad reading/extension validation is a later step. Ordinary type/build checks and temporary behavioral probes do not introduce a test framework or CI.
