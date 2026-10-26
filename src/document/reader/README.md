# PDF.js reading surface

`reader.html` and `reader-proof.html` use the same live integration. `reader.html?view=sample`, `?view=gallery` and `?view=selbar` retain the UI review pages. The live reader reuses ReaderShell and its controlled menus, notes, toolbar and settings.

PDF.js 6.4.299 owns rendering and text selection. Business annotations, comments, original PDF-point anchors and note layouts are persisted independently in IndexedDB; PDF.js editor objects are disposable views. See `docs/contracts/reader.md` and `docs/contracts/annotation-storage.md`.

The pinned geometry patch merges adjacent fragments within a line and unions overlapping bands. Approved light colors and opacity 1 are retained. File identity, original blobs and reading positions use the library's shared data layer. Reader/setting/popup preferences share the formal local preference store.

Full navigation, OCR, embedded PDF annotation import and annotated PDF export remain subsequent work. Original PDF export leaves the stored source unchanged. No extension network-permission validation is claimed by the local web preview.
