# Translation integration

This implementation connects the existing reader translation pane to PDF.js extraction,
OpenAI Responses / Chat Completions-compatible endpoints, and local IndexedDB storage.
It does not require an application server. Full-document work runs while its reader page
is open; there is no persistent background translation worker in this revision.

## Ownership and identity

`ExtractedPaper` belongs to a document ID, file version, and extraction algorithm version.
Sentence IDs are stable within that extraction. Each sentence has one `DocumentAnchor`
with one or more page anchors. The canonical geometry uses crop-relative, unrotated PDF
points. Viewport rectangles are projected by the current reader and are never stored.
Sub-item character widths and layout classification are heuristic; the adapter marks
locations approximate. Scan-only pages have no OCR fallback in this revision.

The UI displays a cross-page sentence once, under its starting page. Either covered page
can locate it or include it in a translation request. Translation highlighting is an
ephemeral overlay and does not create or mutate saved annotations. Original PDF.js
annotation rendering and its selected colors are unchanged.

## Requests and lifecycle

Opening the pane, following reading and hovering never request a model. Explicit page,
whole-document or selection actions enqueue sentences with bounded paragraph context.
Adjacent sentences are batched within a page according to the saved LLM request limits. The prompt requests one JSON object per line with a source sentence ID and text.
Unknown IDs never update another sentence; incomplete or malformed output remains in the
attempt record. Display formulas are not translated. Inline math remains a known extraction
limitation; the revised prompt may infer LaTeX with an explicit verification flag.

The task schedules bounded concurrent paragraph requests. It respects the configured maximum
duration per request and output cap; see the retry and concurrency section below. A Web Lock
prevents multiple tabs from starting the same document/version simultaneously. The lock
is a device/browser mechanism, not cross-device coordination.

Pause stops dispatch, aborts the active request and persists received output. A page/process
interruption restores an interrupted task without a new request. Resume/retry is explicit;
retries with partial/failed output show the existing confirmation dialog about possible
repeat charges. Completed sentence results are reused. Old attempt text is retained when
a replacement attempt starts. Transient failures receive bounded automatic retries as described below; there is no automatic provider fallback.

## Persistence

Extraction and run records use namespaced keys in the existing `meta` store; they are not
cache entries. Runs include model, protocol, sanitized endpoint URL, configuration revision,
language, extraction version, prompt version and per-attempt configuration revisions. Keys
and bearer headers never appear in these records. Each received text delta is committed
before reporting it saved. Failed writes stop new work and retain unsaved output in memory
for retry; the reader must stay open to recover a write that failed.

Run writes use revision checks, append to the synchronization change journal, and promote
the document to record-and-file scope atomically when output exists. This does not implement
WebDAV transfer: local durability and change-journal entries are not a claim of remote backup.
`PaperDatabase.clearCache()` does not delete extraction, translations, settings or PDFs.
Historical run/attempt records are retained; a UI for browsing/exporting versions is not yet
provided. Model/protocol/language changes start a new version through an explicit new task.

## Configuration and protocols

The settings page retains its existing layout and component styles. Model settings now use
local revisioned storage. Saved keys are only exposed as presence bits to UI snapshots;
new keys are write-only edits. Changing the endpoint address requires entering a new key.
Settings request permission for the endpoint origin from the user's Save action. Web previews
also require the provider to permit browser CORS; installed extension permission behavior
must be checked in the installed extension before claiming parity.

Responses sends `instructions`, typed `input`, `stream: true`, `store: false`, and optional
`max_output_tokens`. It handles `response.output_text.delta`, `response.completed`,
`response.incomplete`, failure/refusal events, and non-streaming `output` arrays. Chat
Completions uses `messages`, text deltas and its own finish reason. The transport handles
split UTF-8/SSE boundaries, limits response sizes, rejects redirects and never follows
model-generated tool calls. A supplied `/responses` or `/chat/completions` suffix is
normalized before adding the path for the explicitly selected protocol.

References: [Responses streaming](https://developers.openai.com/api/docs/guides/streaming-responses),
[Responses event schemas](https://developers.openai.com/api/reference/resources/responses/streaming-events).

## Concurrency, retries and engine adapters

The translation task now uses a bounded worker pool (1–12, read from runtime configuration
at task start). This limit is per task, not a provider-wide quota across tabs or independent
selection tasks. Request chunks default to 24 sentences and 6000 source characters, with
a default pace of 10 requests per minute. Settings permit 1–64 sentences, 500–12000 characters
and 1–120 requests per minute. The configured output-token cap can lower the character budget.
Chunks do not cross a starting-page boundary; paragraph context is supplied separately.
Content-retry rounds split failed chunks further. A single long sentence retains its canonical ID rather than being
silently fragmented. Two automatic retry rounds are allowed; an oversized single sentence
can still require manual intervention after these rounds.

HTTP 408/413/429/500/502/503/504, transport errors, timeouts, malformed output and missing
sentences are eligible for bounded retry. Retry-After is respected, with a task-wide cooldown
on rate limits, plus exponential delay and jitter. Authentication/permission/address errors
stop dispatch. Exhausted rate limits stop the queue; other exhausted chunks remain failed
while independent chunks may finish. Only unfinished IDs are resubmitted. Terminal-frame
loss does not resend fully received sentences. Automatic retries can incur duplicate charges
for outcome-unknown requests. Pause cancels active requests and retry timers. There is still
no automatic task restart after closing/reopening the reader.

All workers share one serialized revisioned storage queue. A storage failure aborts dispatch,
retains in-memory output, and requires explicit save recovery. Attempts record engine,
prompt version and retry round. Explicit retranslation of a page creates a new run and retains
the previous run as its parent; other pages can reuse their prior results. The confirmation
explains repeat charges and the absence of a historical-version browser.

`TranslationEngine` is a protocol-independent boundary emitting sentence IDs, text, completeness,
and raw attempt deltas. The LLM adapter owns NDJSON prompts/parsing and Responses/Chat transport.
A future Google Cloud Translation adapter can map the ordered input/output arrays back to
canonical sentence IDs; an Alibaba adapter can map its own request/result schema. Neither
service is advertised as working yet. Their authentication, language identifiers, character
quotas, batch limits and browser access must be implemented and validated separately; they
must not be sent LLM prompts or OpenAI credentials. Conventional translation should preserve
protected math instead of being assumed capable of repairing equations.

References: [Google Cloud Translation](https://docs.cloud.google.com/translate/docs/translate-text),
[Alibaba Machine Translation REST API](https://www.alibabacloud.com/help/en/machine-translation/developer-reference/using-rest-api).

## Markdown, mathematical recovery and following

New LLM output is sentence-aligned Markdown within NDJSON: `$...$` inline math, `$$...$$`
display math. JSON escaping is required. The prompt permits context-based recovery of damaged
mathematical notation, but requires `inferredMath: true`; insufficient evidence requires
retention of the available source notation instead of an invented formula. This flag is
persisted for provenance but no review warning is shown in the reading UI.
It is a model-reported flag, not proof that unflagged formulas are correct. Extracted standalone
formula/figure-label blocks still link to the original and are not automatically reconstructed.

The adapter uses react-markdown, remark-math and KaTeX; existing pane layout/styles are retained.
Older bracket delimiters are accepted. Raw HTML and remote images are disabled, trusted KaTeX
commands are disallowed, expansion and dimensions are bounded, and unfinished math stays
readable as source. No parser can reconstruct an old malformed plain-text equation solely
by changing rendering. Explicit page retranslation uses the new prompt without silently
charging the user or overwriting the old record.

Following is driven by user-initiated paper scrolling after a 180 ms settling period, not by
PDF render/resize/projection events. Candidate selection keeps a stable column and hysteresis.
An already-visible translated sentence is left in place. Manual scrolling in the translation
pane and explicit click-to-original navigation suppress feedback; hover only changes the
transient highlight. Follow and geometry repaint have separate scheduling.

## User task identity and recovery

A user-triggered page, document or selection translation creates a durable task with its own
UUID `sessionId` and scope. Pause, reopen, resume and retry reuse that UUID. A separate page /
document action or explicit retranslation creates a new task; compatible completed sentences
may be copied forward without another model call. Historical runs remain in storage. Legacy
runs without `sessionId` use their existing run UUID. Responses requests use `prompt_cache_key`
and Chat Completions uses `metadata.session_id` for gateway correlation. This is request grouping,
not automatic model conversation history; provider-specific gateway support must be checked.

The task dispatcher enforces both maximum concurrency and a start interval derived from the
configured requests-per-minute limit (six seconds by default). Transport / 429 / 5xx errors
cool down the entire task. In-flight requests drain before one recovery probe is allowed.
Ordinary service failures start with five seconds of backoff; recognized rate limits start
with at least sixty seconds, honoring Retry-After. Rate-limit recovery also doubles request
spacing once per outage wave or failed probe, up to sixty seconds.
After three failed recovery probes, no later chunks are dispatched. A separate per-invocation
retry budget bounds repeated intermittent failures. User-requested continuation starts a fresh
bounded recovery window while retaining the task UUID and completed output.

Only content/length/missing-sentence errors split remaining sentences into smaller requests,
with at most two split rounds. Authentication, billing/quota, invalid configuration and known
permanent errors stop the task. HTTP and Responses SSE errors share classification, including
HTTP 200 responses containing `response.failed`. Unknown implementation errors are not treated
as network outages. Each attempt retains a completion time and allowlisted, credential-redacted
HTTP status, service code/type/message, Retry-After, request ID and response ID when available.
Browsers cannot inspect CORS-blocked responses or unexposed request headers; these remain explicitly
classified as network failures rather than fabricated HTTP diagnoses.

## Independent selection translation

The selection toolbar translates the exact selected text in a separate floating window. It
never changes the sidebar task, extraction cache, or document latest-run pointer. Selection
records use a stable text-and-PDF-anchor key, with their own latest pointer, task UUID and lock.
Legacy selection runs accidentally stored as the document latest pointer are skipped when
loading the sidebar; the newest remaining page/document run is used without deleting history.

Minimizing keeps the task running. Closing pauses and saves received output; a failed save
keeps the window available for recovery. Selecting the same text again can reuse or resume
a compatible saved selection. Explicit retranslation creates a new run and keeps the old one.
Only one selection window is shown at a time; switching selections saves the previous one.

The gear menu provides source language (automatic by default), target language, original-text
visibility and explicit retranslation. A separate header button locates the original. Language edits are drafts until
translation is requested. The local `translationLanguage` preference supplies the default
target for new page, document and selection tasks independently of `answerLanguage`. Changing
the default does not rewrite stored output or change an already-running task's language.

The selection window uses the shared `PassageWindow` shell, with comment-note styling and
reader-local coordinates. Dragging near the reading viewport edges pans that viewport; the
window and its connector are clipped inside the PDF layer. Hover or keyboard focus reveals
the dashed passage connector; the completed window has no source-text heading or language
footer. Translation-specific settings remain a separate content adapter, so explanation
can reuse the shell without adopting translation tasks or persistence.

## Shared passage window and positioning

`PassageWindow` provides the reader-local shell for selection translation and future explanation
content. It supports header dragging with edge panning, a comment-style resize handle, collapse,
close, a locate action and a hover/focus connector. Expanded translation shows one busy indicator;
a collapsed window uses one spinner. Resized dimensions survive collapse/expand during the open
window's lifetime; window layout is not a persisted user preference in this revision.

Comment, annotation and translation anchors and search matches use the same landing policy:
keep horizontal position when the target fits; otherwise center it as far as scroll bounds allow.
Targets requiring scrolling land approximately one third down the reading viewport. Fully visible
targets do not move. A 1.9-second transient accent mark fades after every locate, including a
no-scroll locate; it tracks current projection and never changes saved highlights. Explicit page
navigation and PDF-native destinations retain their existing semantics.
