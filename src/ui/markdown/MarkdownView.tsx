import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
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
export function MarkdownView({ value }: { value: string }) {
  return (
    <div className="pp-markdown-view">
      <ReactMarkdown
        skipHtml
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[
          [
            rehypeKatex,
            { trust: false, throwOnError: false, maxExpand: 500, maxSize: 20 },
          ],
        ]}
        urlTransform={(url, key) =>
          key === "src" && /^paperpane-asset:[a-f0-9]{64}$/.test(url)
            ? url
            : /^(https?:|#|\/)/.test(url)
              ? url
              : ""
        }
        components={{
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
        }}
      >
        {value}
      </ReactMarkdown>
    </div>
  );
}
