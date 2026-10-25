# PDF import and local storage

This implementation is based on the proposed reading contract. `createDocumentService()` is owned by an extension page, above its React panels. `service` implements DocumentService; the owner also exposes internal `readFile`, `refresh`, `clearCache`, `getImportReceipt` and `dispose` helpers. File retrieval/cache controls are implementation integration points, not additions to the approved shared contract. The temporary library entrypoint composes existing UI components; the designed document/library UI can replace it later.

## Import flow

1. Local File input or drag/drop; alternatively an HTTP(S) direct PDF URL.
2. URL imports request optional permission for that protocol/host directly from the user's click. There is no install-time all-sites host grant. Fetch runs in the extension page, omits cookies/credentials, suppresses referrers, and uses no HTTP cache. Access-denied, HTML/login responses and HTTP failures are explained. If a redirect requires another site's permission, the caller may need to download manually; the service does not silently broaden permissions. Site introduction-page extraction and authenticated downloading are not implemented.
3. A bounded stream reports actual transferred bytes. Unknown response lengths stay indeterminate; compressed Content-Length is not presented as decoded progress. The initial limit is 256 MiB per file and one active import per service owner, with a 120-second total network timeout. These bounds control memory consumption because parsing and hashing currently require full buffers. Multiple extension pages can each have a run; database writes are still serialized/deduplicated.
4. PDF header plus the bundled PDF.js parser validates the document/page tree and reports page count. HTML masquerading as a .pdf and broken PDF structures are rejected. This is not full page rendering or text extraction; readable means the stored PDF can be handed to the next reading stage, not that every page operator/text layer was verified. No claims of OCR/no-text classification are made yet.
5. Encrypted files request a password; incorrect attempts reissue the prompt. Passwords exist only in the parser callback/input and are not stored in IndexedDB or logs. The original encrypted bytes remain unchanged in storage.
6. SHA-256 identifies content across filenames and local/network sources. The parser receives its own buffer because PDF.js transfers data to its packaged worker.
7. The PDF Blob, document record and synchronization change event are written in one strict-durability IndexedDB transaction. Success is published only after transaction completion. Repeated imports reuse document identity and preserve reading state; explicit import promotes record-only browsing to record-and-file scope. Different bytes create a different document/version; automatic reconciliation of revised papers is later work.

Download/parsing can be cancelled. The short final database commit cannot be cancelled through UI: it reports busy, then success/failure. No cancelled result is published after an accepted commit. Closing the import page before persistence aborts the run; the source must be selected again after reopening. Jobs/passwords/File handles are not durable background tasks. This lifecycle is stated on the page. Background downloads and resumable ranges are outside this slice.

## Persistence

`PaperDatabase` uses database name `paperpane`, schema version 1. Stores:

- documents: metadata, content hash, source list, reading position and separate local/sync state; unique content-hash index.
- assets: original PDF Blobs, keyed by content hash.
- changes: monotonically sequenced document upserts, revision and device ID for later sync.
- meta: local device identity.
- cache: regenerable artifacts only.

No store is deleted during initialization. Version-change notifications close old connections so upgrades can proceed; blocked upgrades report a retryable error. Cross-page BroadcastChannel invalidation and refresh-on-visible update lists after writes. The unique hash index plus a single readwrite transaction makes competing imports converge on one document. Note/chat stores and their migrations will be added with those live services; this slice does not claim they are persisted yet.

`recordReading` commits validated page/offset/zoom/rotation and last-read time together with a change event. Recent IDs represent actual recorded reading, not merely importing/downloading a file. `readFile` checks the document ID and exact file version before returning the Blob. Cache clearing opens only the cache store, never documents/assets/changes. PDF bytes can be re-exported even if the source URL later stops working. The integration page's download button exports the saved original; it is not an embedded reader.

The extension declares unlimitedStorage to avoid normal origin quota/eviction for the library. Actual disk exhaustion can still fail. Browser extension storage is distinct from ordinary HTTP cache, but uninstalling/resetting the extension or deleting its browser profile removes local data. WebDAV and complete export/restore are not implemented in this slice; the page says data is currently local-only. Adding that external recovery path remains a separate stage.

## Dependencies and packaging

`pdfjs-dist 6.4.299`, Apache-2.0, supports the project's Node engine. The parser is imported lazily and its module worker is bundled as an extension-local asset; no CDN, eval-based loader or PDF scripting sandbox is enabled. Parsing does not load fonts/images or render page content. Content and asset source URLs are never interpolated into HTML. General runtime errors display stable messages rather than raw exception text that could expose a signed URL.

Checks performed: TypeScript, Chrome/Edge builds, real browser IndexedDB import/reopen/cache-clear/export with byte-for-byte hash comparison, same-file deduplication, password wrong/correct, invalid PDF rejection; temporary local HTTP checks exercise PDF download, redirects, HTML/404 rejection and stream cancellation; two database connections verify concurrent deduplication, scope promotion, reading state retention and invalid-position rejection. Temporary probes/fixtures are not shipped. Browser checks ran as local pages, not installed Chrome/Edge extensions: optional host permission prompts and extension-specific cross-origin redirects remain to verify when loading the extension. A browser process restart was not exercised; reopening the database/page was.

Sources: [Chrome network access](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests), [optional permissions](https://developer.chrome.com/docs/extensions/reference/api/permissions), [extension storage persistence](https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies), [PDF.js API](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html).
