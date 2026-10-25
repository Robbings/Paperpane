# Editor and content dependencies

Direct versions are exact and recorded in package.json / pnpm-lock.yaml. Reviewed registry metadata on 2026-10-25:

| Package | Version | License | Purpose |
| --- | --- | --- | --- |
| @tiptap/core, pm, react, starter-kit, markdown, extension-mathematics | 3.32.0 | MIT | Common rich-text schema, React editor and Markdown/math conversion |
| dompurify | 3.4.17 | MPL-2.0 OR Apache-2.0 | Sanitize HTML in extension document contexts |
| katex | 0.16.47 | MIT | Math rendering, aligned with the prior chat integration |

TipTap React peers accept React 19; all TipTap packages use the same version. No cloud conversion/editor service is added. The Markdown bridge is still labeled Beta in upstream docs; canonical storage is JSON. Local installed source confirms inline/block mathematics serialize to dollar-delimited Markdown.

The UI should lazy-load the editor/Markdown/math renderer. Current production pages do not import these dependencies and are not claimed to verify their final visual integration. The codec is headless. Use `noteExtensions` from `src/domain/notes/codec.ts` for the editor so supported nodes match persistence. KaTeX must have `trust: false`; plain-text LaTeX is retained even when rendering fails. Load styles only in the UI; select WOFF2 font assets when the visual renderer is introduced, rather than copying every bundled font format now.

Model/PDF/user Markdown is untrusted. Disable raw HTML and remote image loading by default. If a feature produces HTML, sanitize before insertion with a narrow tag/attribute allowlist; sanitization alone does not prevent remote image tracking. Validate link protocols, do not execute scripts or model-generated commands. Rendering components and their CSS belong to the UI integration PR, not these DTOs. DOMPurify requires a DOM and must not be imported into a service worker as though it provides one.

Sources: [TipTap Markdown](https://tiptap.dev/docs/editor/markdown), [mathematics](https://tiptap.dev/docs/editor/extensions/nodes/mathematics), [DOMPurify](https://github.com/cure53/DOMPurify), [KaTeX security](https://katex.org/docs/security).

There is no direct `marked` dependency or standalone application parser. TipTap Markdown still uses it transitively for note conversion. Model output uses the conversation integration's react-markdown renderer; do not add a second rendering path.
