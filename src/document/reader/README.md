# PDF.js reading surface — first integration proof

This is a separately routed proof (`reader-proof.html`), not a replacement for `reader.html`. It reuses the checked-in ReaderShell, ReaderToolbar, SelectionMenu, annotation panel and OverlayScrollbar without changes under `src/ui`. The final controlled shell interface is still awaiting alignment.

## What is real

- PDF.js 6.4.299 PDFViewer renders original local PDF files, its native text/annotation/draw layers handle selection and highlights. No iframe or generic viewer toolbar is inserted.
- The existing Paperpane selection menu drives the native editor through a narrow adapter. PDF.js's editor UI manager is obtained via its event bus; its mode events are handled locally. These are version-specific integration points isolated in `pdfjs-reader.ts`, not stable cross-version API promises.
- One absolute-positioned scroll container belongs to ReaderShell. The viewer lives in its document slot; native page rendering and the existing scrollbar share that container.
- The approved continuous geometry is applied as a reviewable pnpm patch to the pinned package. It joins native text fragments in PDF units before PDF.js's own outline union, removes the small fill padding, and leaves native opacity=1. Yellow/green/blue/pink use the original light palette. Purple (#DCCBFF) is a provisional real purple pending visual review; it is never mapped to red.
- Real selection snapshots include session IDs, document/file identities and unrotated crop-relative PDF coordinates. Anchor projection supports page and viewport spaces. File selection here creates session identity, not a durable library record.
- Page navigation, zoom and rotation are wired to the existing controls for geometry verification. Password callbacks stay in memory. The viewer's abort signal and owner cleanup release listeners, observers and the worker on unmount.

## Staging limits

The proof's highlights and list are session-only, visibly marked as not saved. The list tracks successful creations; full existing-highlight selection, edit/delete/undo reconciliation, persistence and export are not implemented here. These belong to the subsequent annotation slice. Do not use this page to retain important notes.

Creation currently supports multiple lines within one page; cross-page capture exists in the DTO but creating cross-page native annotations is explicitly rejected in this proof. Text-layer navigation/selection is native; no OCR or correction of abnormal PDF reading order is claimed.

ReaderShell still captures its own UI snapshot. A compatibility bridge verifies its text against the captured engine selection, resolves the ID before the menu closes, restores the native range and invokes PDF.js. The controlled selection / scroll-container ref interfaces will replace this bridge. The proof locates the shell container through its ancestor CSS class only at mount, isolated from the service contract.

The native annotation editor's floating controls are disabled/hidden for this proof; all creation buttons are the existing Paperpane SelectionMenu. The auto-highlight toggle, search, region, export, notes, AI and full outline UI are not connected yet and are not represented as complete. For creation, use drag-select → a color in the existing menu.

No sample PDFs, screenshots, user files, competitor materials or browser profiles are committed. No new test framework or CI is added. Runtime currently uses embedded fonts; bundled CMaps/standard-font/WASM resource coverage, uncommon PDF features, real extension CSP/worker validation and persistent reading position are part of the full reading stage.

## Local verification

`pnpm typecheck`, `pnpm build`, `pnpm build:edge`. A localhost static server can serve `.output/chrome-mv3` to inspect `/reader-proof.html` without installing another extension; this does not substitute for loading the extension in Chrome/Edge.

Manual first-slice check (2026-10-26): opened the original BERT PDF, selected multiple lines, clicked the existing yellow/green menu actions, and observed native continuous highlights plus session rows. Changed zoom, moved the research panel and rotated the page 90°; both colors stayed aligned. The first coordinate conversion attempt used an API removed in PDF.js 6.4; corrected it to two native viewport point transformations and repeated the real UI creation check successfully. No claim of full search, export, persisted annotation or extension-browser acceptance.
