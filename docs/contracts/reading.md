# Documents, anchors, annotations and notes

## Documents and import

`DocumentService.importDocument` accepts a local `File` or an HTTP(S) URL plus browse/import intent. `File` is an ephemeral command input in the extension page, never part of a serialized record or runtime message. A future cross-context adapter must transfer bytes/assets explicitly. The accepted result is a job ID; rendering readiness comes from its snapshot.

Phases: reading → validating → password-required (when needed) → extracting → readable / partial / no-text. Failure or cancellation ends the run. `partial` may have usable pages plus an error. `no-text` still supports visual reading; it must not silently invoke paid OCR. Progress is per phase, in bytes or pages, not a fabricated overall percentage. If `total` is absent, show indeterminate activity. When known, pass completed/total to ProgressBar. Page indexes are zero-based; visible page numbers add one. Password submission uses the current request ID, never persists/logs the password, and wrong passwords keep the prompt open. Cancellation invalidates in-flight completion. Retry accepts failed/cancelled jobs only.

Document ID and file version are separate. A different PDF version cannot silently reuse coordinates. The file asset has its own ID/hash/availability. Mere browsing synchronizes records and recent reading without uploading the PDF. Explicit import or any retained work promotes scope to record-and-file; actual promotion/upload is a future live-service transaction. Remote URLs never replace file backups. `recordReading` validates page/offset/zoom and updates recent order. Offset is 0–1 within the page, zoom is a positive scale factor.

Demo: `controls.nextImport({ password: 'paper', outcome: 'partial', pageCount: 3 })`; `controls.failNext(...)` fails the next phase checkpoint. This creates simulated metadata, not a parsed or stored PDF. A configured scenario error is repeatable on retry; create another scenario to demonstrate a repaired file. `dispose()` stops outstanding demo jobs when their owner is destroyed.

## Anchors and projection

`DocumentAnchor` stores document ID, file version and one or more page anchors. Rectangles are PDF points relative to the **unrotated crop-box bottom-left**, not CSS pixels. Each page may include exact quote plus prefix/suffix context. The document engine creates the selection snapshot; the current reader's text plus screen rectangle alone is insufficient to create a durable anchor. Actual capture and PDF projection are delivered with the reading engine.

`AnchorService.locate` navigates and reports exact/approximate/unavailable. `project(anchor, space)` never navigates. Callers explicitly choose a coordinate space:

- `page`: CSS pixel rectangles relative to the **rendered page content's top-left**, after zoom and rotation, excluding padding/border. Put the highlight layer inside that page with the same origin and dimensions. These rectangles scroll naturally with the page; pure scrolling does not require reprojection.
- `viewport`: CSS pixel rectangles relative to the window viewport's top-left, for `position: fixed` selection menus and annotation bubbles. These must be reprojected when scrolling or when the page moves.

Every result names its space. A ready result carries its projection revision and page-indexed rectangles; a page not yet rendered returns pending page indexes, not a broken anchor. Subscribe with `subscribeProjection(space, listener)`: page-space subscriptions invalidate on zoom, rotation, page geometry changes or page mount/unmount; viewport subscriptions additionally invalidate on scroll and page movement. Consumers discard stale rectangles on invalidation and project again. Pure scrolling may still mount/unmount a virtualized page, which does invalidate its page projection. Text across multiple lines/pages produces multiple rectangles, each attached to its own page. Neither CSS coordinate form is persisted; the PDF anchor remains authoritative.

The demo provides separate fixtures/subscriptions for each space via `setProjection({ space, ... })` and `setAccuracy`; it deliberately does not invent a PDF renderer.

## Annotations

One document version per service. Types cover highlights, selection comments and page-position comments. All carry quote/comment/color/source, revision/timestamps and independent local/sync status. UI filters `deletedAt` from the normal list; retained tombstones permit undo. Changes require the expected revision, including restore with the deletion revision. Stale operations return conflict rather than overwrite. Moving an anchor is only valid for page comments. Emptying a highlight's comment retains the highlight; removing the record deletes both. Locate through the shared anchor service.

Markdown/CSV exports exclude deleted entries and return text artifacts. CSV quotes multiline cells and neutralizes leading spreadsheet formulas. Copy/download completion belongs to the page integration layer. Demo mutation failure returns an error without changing committed records; per-operation busy/error UI uses that result.

## Notes

One note per document ID, independent of file version. Canonical content is `{ format: 'paperpane-richtext', schemaVersion: 1, doc }`, a JSON document using the shared TipTap StarterKit + Mathematics schema. Persistence is not Markdown or HTML. Supported schema includes paragraphs, headings, lists, quotes, code, links, basic inline marks, and inline/block math. Additional nodes require a schema/version review. Formula source is LaTeX, not rendered HTML.

`edit` validates and retains draft synchronously, increments editVersion and sets editing. UI debounces `commit(expectedRevision)` and flushes on appropriate navigation; live reliable page-close persistence is future work. Saving captures a draft version. Edits made during a save stay dirty even when the earlier save succeeds; UI schedules another commit. Only one commit runs per note. Failure retains draft for retry. Snapshots, not UI guesses, decide SaveStatus.

A conflict contains base revision and both local/remote versions. The main editor is locked during conflict; a separate merge editor passes a merged document to `resolve`. A stale conflict ID is rejected. Choosing local/remote or a merged document retains both inputs in history. `controls.receiveRemote(content)` simulates concurrency. Demo history is in memory, not backup.

Markdown export uses the same schema and exports the current draft, including `$…$` and `$$…$$` math. It is an interchange format, not a lossless backup: JSON remains authoritative. The export reports this limitation. Import UI and full fidelity handling for arbitrary external Markdown are outside this proposal. Do not enable editor nodes that the approved schema cannot preserve.

## Answers for panel design

1. Save versioned JSON; derive Markdown exports/plain-text indexes. No two editable sources of truth.
2. Annotation deletion supports undo through tombstones and revision checks; toast lifetime is independent of retention.
3. Conversation drafts will be local durable business drafts in the live service; demo drafts last only for the instance.
4. Future schema cards retain original JSON + Schema + validation result. Field display is derived, including nested arrays/objects; never discard raw output.
5. Reading contracts first, conversation/explanation immediately next; library, then overview/citations before their implementation.

## Library integration follow-up

Design the library contract from the existing `PaperView`, `FolderView`, `TagView`, `LibraryQuery` and `LibraryViewPreferences` view requirements. Keep portable business DTOs independent of UI types and map them at integration. Include a command to retain an already browsed document in the library, with title/authors/folder/tags, reusing its local asset and promoting its sync scope without downloading/importing it again. This is a follow-up contract, not an implemented operation in this proposal.
