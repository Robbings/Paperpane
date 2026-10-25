# Editor and content dependencies

Direct versions are exact and recorded in package.json / pnpm-lock.yaml. Reviewed registry metadata on 2026-10-25:

| Package | Version | License | Purpose |
| --- | --- | --- | --- |
| @tiptap/core, pm, react, starter-kit, markdown, extension-mathematics | 3.32.0 | MIT | Common rich-text schema, React editor and Markdown/math conversion |
| marked | 18.1.1 | MIT | Markdown parsing; never treat output as sanitized HTML |
| dompurify | 3.4.17 | MPL-2.0 OR Apache-2.0 | Sanitize HTML in extension document contexts |
| katex | 0.16.47 | MIT | Math rendering, aligned with the prior chat integration |

TipTap React peers accept React 19; all TipTap packages use the same version. No cloud conversion/editor service is added. The Markdown bridge is still labeled Beta in upstream docs; canonical storage is JSON. Local installed source confirms inline/block mathematics serialize to dollar-delimited Markdown.

The UI should lazy-load the editor/Markdown/math renderer. Current production pages do not import these dependencies and are not claimed to verify their final visual integration. The codec is headless. Use `noteExtensions` from `src/domain/notes/codec.ts` for the editor so supported nodes match persistence. KaTeX must have `trust: false`; plain-text LaTeX is retained even when rendering fails. Load styles only in the UI; select WOFF2 font assets when the visual renderer is introduced, rather than copying every bundled font format now.

Model/PDF/user Markdown is untrusted. Disable raw HTML and remote image loading by default. If producing HTML with marked, sanitize before insertion with a narrow tag/attribute allowlist; sanitization alone does not prevent remote image tracking. Validate link protocols, do not execute scripts or model-generated commands. Rendering components and their CSS belong to the UI integration PR, not these DTOs. DOMPurify requires a DOM and must not be imported into a service worker as though it provides one.

Sources: [TipTap Markdown](https://tiptap.dev/docs/editor/markdown), [mathematics](https://tiptap.dev/docs/editor/extensions/nodes/mathematics), [DOMPurify](https://github.com/cure53/DOMPurify), [KaTeX security](https://katex.org/docs/security).

## Conversation adapter

The second proposal adds the versions from the earlier isolated integration: `@assistant-ui/react 0.15.31`, `@assistant-ui/react-markdown 0.14.24`, `remark-math 6.0.0`, `rehype-katex 7.0.1` (MIT). It reuses `katex 0.16.47`. SDK types were checked against the installed source, including ExternalStoreRuntime, AppendMessage.sourceId, MessageNotSentError and composer textChange origins. These adapter APIs stay confined to `src/ai/`; changing the pinned SDK requires rechecking that boundary. No assistant-cloud or AI SDK dependency is added directly.

[ExternalStoreRuntime documentation](https://www.assistant-ui.com/docs/runtimes/custom/external-store) describes its externally owned state model. Production pages still do not mount this runtime, so ordinary builds alone do not verify the UI adapter. Demo checks exercise mapping and callbacks; the actual discussion UI is a separate integration step.
