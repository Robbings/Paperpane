import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
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
export function ResearchMarkdown({
  text,
  marker,
  className,
  inline = false,
}: {
  text: string;
  marker: (label: string) => ReactNode;
  className?: string;
  inline?: boolean;
}) {
  const Wrapper = inline ? "span" : "div";
  return (
    <Wrapper
      className={`pp-md pp-ai-markdown ${className ?? ""}`}
      style={inline ? { display: "inline" } : undefined}
    >
      <ReactMarkdown
        skipHtml
        remarkPlugins={[remarkMath, remarkGfm, sourceLinks]}
        rehypePlugins={[
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
        ]}
        components={{
          h1: ({ children }) => <h4 className="pp-md__heading">{children}</h4>,
          h2: ({ children }) => <h4 className="pp-md__heading">{children}</h4>,
          h3: ({ children }) => <h4 className="pp-md__heading">{children}</h4>,
          h4: ({ children }) => <h4 className="pp-md__heading">{children}</h4>,
          h5: ({ children }) => <h4 className="pp-md__heading">{children}</h4>,
          h6: ({ children }) => <h4 className="pp-md__heading">{children}</h4>,
          img: () => null,
          a: ({ href, children, node }) =>
            href === "#paperpane-source" ? (
              <>
                {marker(
                  String(
                    node?.properties["data-pp-citation"] ??
                      node?.properties.dataPpCitation ??
                      "unlocated",
                  ),
                )}
              </>
            ) : (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            ),
          p: ({ children }) =>
            inline ? <span>{children}</span> : <p>{children}</p>,
          pre: ({ children }) => (
            <pre style={{ maxWidth: "100%", overflowX: "auto" }}>
              {children}
            </pre>
          ),
        }}
      >
        {normalizeTranslationMarkdown(normalizeSourceMarkers(text))}
      </ReactMarkdown>
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
