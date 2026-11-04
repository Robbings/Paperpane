import { useEffect, useMemo, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { MarkdownAssets } from "@/domain/notes/assets";
import "katex/dist/katex.min.css";
import "./markdown-editor.css";
function AssetImage({ reference, alt }: { reference: string; alt?: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const scope = new MarkdownAssets();
    let live = true;
    const hash = /^paperpane-asset:([a-f0-9]{64})$/.exec(reference)?.[1];
    if (hash)
      void scope
        .url(hash)
        .then((value) => {
          if (live) setUrl(value);
        })
        .catch(() => {});
    return () => {
      live = false;
      scope.dispose();
    };
  }, [reference]);
  return url ? (
    <img src={url} alt={alt ?? "旁注图片"} />
  ) : (
    <span className="pp-markdown-view__missing">{alt || "图片暂不可用"}</span>
  );
}
// Module-level overrides keep element types stable, so a re-render does not
// remount images (refetching them) or replace the text under a selection.
const components: Components = {
  img: ({ src, alt }) =>
    src?.startsWith("paperpane-asset:") ? (
      <AssetImage reference={src} alt={alt} />
    ) : null,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </a>
  ),
};
const remarkPlugins = [remarkGfm, remarkMath];
const rehypePlugins: NonNullable<Parameters<typeof ReactMarkdown>[0]["rehypePlugins"]> = [
  [rehypeKatex, { trust: false, throwOnError: false, maxExpand: 500, maxSize: 20 }],
];
const urlTransform = (url: string, key: string) =>
  key === "src" && /^paperpane-asset:[a-f0-9]{64}$/.test(url)
    ? url
    : /^(https?:|#|\/)/.test(url)
      ? url
      : "";
export function MarkdownView({ value }: { value: string }) {
  const body = useMemo(
    () => (
      <ReactMarkdown
        skipHtml
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        urlTransform={urlTransform}
        components={components}
      >
        {value}
      </ReactMarkdown>
    ),
    [value],
  );
  return <div className="pp-markdown-view">{body}</div>;
}
