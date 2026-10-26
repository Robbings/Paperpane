# Reader surface contract (proposed)

Extends the existing document/anchor contracts; does not replace them. Import jobs describe acquisition and inspection. ReaderState describes one mounted reading session. A readable import does not imply its pages have rendered.

## Ownership

The runtime owns PDF bytes, worker, PDFViewer, selection capture, geometry and cleanup. UI owns ReaderShell, ReaderToolbar, SelectionMenu, OverlayScrollbar and visual interaction. Mounting receives the shell's one absolute-positioned scroll container and a child viewer element. No second scrolling viewport and no complete upstream viewer UI are inserted. React refs and PDF.js objects stay outside shared DTOs.

The proposed controlled shell takes ReaderSelection, dismissal/action callbacks, and a scroll-container ref/callback. This is an integration agreement for review, not a new React component owned by the logic layer. Until that interface lands, a separately labelled proof page may use the existing shell with a local compatibility bridge; it cannot be treated as the final integration.

## Selection and geometry

Selection captures have immutable IDs and exact document/file identities. Mouse/keyboard selection is captured from PDF.js's text layer, converted through page viewport transforms. Store unrotated crop-box-relative PDF points with bottom-left origin, as DocumentAnchor already specifies; never persist CSS rectangles. Cross-page selection has one PageAnchor per selected page. A different selection, document switch or disposed session invalidates old IDs. Menu focus alone does not invalidate the captured selection. Dismissal explicitly clears it; any UI action captures/resolves the ID before dismissing.

AnchorService.project('page') gives page content CSS pixels; project('viewport') gives window CSS pixels for a fixed menu. Scrolling invalidates viewport projection; zoom/rotation/reflow invalidates both. Unrendered pages return pending, not stale rectangles. Source-file mismatch returns unavailable. Locate loads/navigates to the target first; the UI draws its existing LocateFlash from fresh projection.

## Commands and state

Public page indexes are zero-based; page labels may differ. Zoom=1 means 100% at 96 CSS pixels/inch. Native PDF.js uses one-based page numbers internally; only the adapter converts them. Commands before ready return BUSY. Invalid pages/zoom/rotation return INVALID_INPUT. Passwords are passed only to the current request callback, never persisted or logged. New requests invalidate earlier request IDs.

Snapshot objects remain stable until a change; subscriptions do not fire immediately. Opening a new document invalidates all outstanding work from the previous session. Runtime disposal releases observers/listeners, cancels loading/rendering and terminates its worker.

## Highlights and staged delivery

Creation remains AnnotationService.create({selection, color, ...}); ReaderService is not a second annotation database. The proof only exercises a session highlight using the native PDF.js editor. It visibly states that edits are not saved; it does not claim AnnotationService persistence or synchronization.

Preserve the accepted continuous bands and PDF.js native light colors/opacity. UI color dots are separate from PDF appearance. Contract color purple remains purple; a proposed pale purple must be visually reviewed rather than mapped to PDF.js red. Default yellow/green are the acceptance baseline. Native floating menus are disabled; commands originate from the existing Paperpane menu.

The library runtime now persists and restores reading position and recent reading. Full search, annotation CRUD persistence/undo/export and AI actions are subsequent slices. This contract does not claim those features are implemented. Ordinary build/typecheck and manual checks accompany the proof; no test framework or CI is introduced.
