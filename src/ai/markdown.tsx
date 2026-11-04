import { createContext, useContext, useMemo, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import { normalizeSourceMarkers } from "./context";
import { normalizeTranslationMarkdown } from "@/translation/markdown";
import "katex/dist/katex.min.css";
import "./ui/markdown.css";
// Transform citations in prose only. Never rewrite code or LaTeX source.
function sourceLinks() {
  return (tree: any) => {
    const visit = (node: any) => {
      if (!node.children) return;
      node.children = node.children.flatMap((child: any) => {
        if (child.type === "footnoteDefinition") return [];
        if (child.type === "footnoteReference")
          return [
            {
              type: "link",
              url: "#paperpane-source",
              data: { hProperties: { "data-pp-citation": child.identifier } },
              children: [{ type: "text", value: child.identifier }],
            },
          ];
        if (child.type !== "text") {
          if (
            !["code", "inlineCode", "math", "inlineMath"].includes(child.type)
          )
            visit(child);
          return [child];
        }
        const out: any[] = [];
        let last = 0;
        for (const m of child.value.matchAll(/\[\^([^\]]+)\]/g)) {
          if (m.index > last)
            out.push({ type: "text", value: child.value.slice(last, m.index) });
          out.push({
            type: "link",
            url: "#paperpane-source",
            data: { hProperties: { "data-pp-citation": m[1] } },
            children: [{ type: "text", value: m[1] }],
          });
          last = m.index + m[0].length;
        }
        if (last < child.value.length)
          out.push({ type: "text", value: child.value.slice(last) });
        return out;
      });
    };
    visit(tree);
  };
}
type MarkerFn = (label: string) => ReactNode;
// Overrides are module-level so React keeps the same element types between
// renders. Inline functions here would remount every answer on each render,
// dropping text selections and re-running KaTeX (visible as flicker).
const MarkdownScope = createContext<{ marker: MarkerFn; inline: boolean }>({
  marker: () => null,
  inline: false,
});
const Heading = ({ children }: { children?: ReactNode }) => (
  <h4 className="pp-md__heading">{children}</h4>
);
function SourceLink({ href, children, node }: { href?: string; children?: ReactNode; node?: any }) {
  const { marker } = useContext(MarkdownScope);
  if (href !== "#paperpane-source")
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  return (
    <>
      {marker(
        String(
          node?.properties["data-pp-citation"] ??
            node?.properties.dataPpCitation ??
            "unlocated",
        ),
      )}
    </>
  );
}
function Paragraph({ children }: { children?: ReactNode }) {
  const { inline } = useContext(MarkdownScope);
  return inline ? <span>{children}</span> : <p>{children}</p>;
}
const components: Components = {
  h1: Heading,
  h2: Heading,
  h3: Heading,
  h4: Heading,
  h5: Heading,
  h6: Heading,
  img: () => null,
  a: SourceLink,
  p: Paragraph,
  pre: ({ children }) => (
    <pre style={{ maxWidth: "100%", overflowX: "auto" }}>{children}</pre>
  ),
};
const remarkPlugins = [remarkMath, remarkGfm, sourceLinks];
const rehypePlugins: NonNullable<Parameters<typeof ReactMarkdown>[0]["rehypePlugins"]> = [
  [
    rehypeKatex,
    {
      trust: false,
      strict: "ignore",
      throwOnError: false,
      maxExpand: 500,
      maxSize: 20,
    },
  ],
];
export function ResearchMarkdown({
  text,
  marker,
  className,
  inline = false,
}: {
  text: string;
  marker: MarkerFn;
  className?: string;
  inline?: boolean;
}) {
  const Wrapper = inline ? "span" : "div";
  const source = useMemo(
    () => normalizeTranslationMarkdown(normalizeSourceMarkers(text)),
    [text],
  );
  // The parsed tree only depends on the text; citation markers read the
  // latest marker function through context.
  const body = useMemo(
    () => (
      <ReactMarkdown
        skipHtml
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={components}
      >
        {source}
      </ReactMarkdown>
    ),
    [source],
  );
  return (
    <Wrapper
      className={`pp-md pp-ai-markdown ${className ?? ""}`}
      style={inline ? { display: "inline" } : undefined}
    >
      <MarkdownScope.Provider value={{ marker, inline }}>{body}</MarkdownScope.Provider>
    </Wrapper>
  );
}
export type ResearchTextRenderer = (
  text: string,
  marker: (label: string) => ReactNode,
  className?: string,
  inline?: boolean,
) => ReactNode;
export const renderResearchText: ResearchTextRenderer = (
  text,
  marker,
  className,
  inline,
) => (
  <ResearchMarkdown
    text={text}
    marker={marker}
    className={className}
    inline={inline}
  />
);
