import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import type Vditor from "vditor";
import { IconButton, toast } from "@/ui/components";
import {
  MarkdownAssets,
  assetHash,
  markdownWork,
} from "@/domain/notes/assets";
import "vditor/dist/index.css";
import "./markdown-editor.css";
// Vditor's default synchronous icon loader injects inline JavaScript, forbidden by MV3.
// Load the bundled script once and maintain only its marker across editor destruction.
let iconsReady: Promise<void> | undefined;
function markIconsReady() {
  if (!document.getElementById("vditorIconScript")) {
    const marker = document.createElement("meta");
    marker.id = "vditorIconScript";
    document.head.appendChild(marker);
  }
}
function loadIcons() {
  return iconsReady ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = new URL("vditor/dist/js/icons/ant.js", location.href).href;
    script.onload = () => { markIconsReady(); resolve(); };
    script.onerror = () => { iconsReady = undefined; script.remove(); reject(new Error("编辑器图标载入失败")); };
    document.head.appendChild(script);
  });
}
interface Props {
  storageKey?: string;
  value: string;
  onChange: (markdown: string) => void;
  label: string;
  placeholder?: string;
  compact?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  onBlur?: () => void;
  onEscape?: () => void;
  onSave?: () => void;
}
export function MarkdownEditor(props: Props) {
  const id = "pp-md-" + useId().replace(/:/g, ""),
    host = useRef<HTMLDivElement>(null),
    editor = useRef<Vditor | undefined>(undefined),
    latest = useRef(props),
    alive = useRef(false),
    applying = useRef(false),
    revision = useRef(0),
    echoes = useRef<string[]>([]),
    observedProp = useRef(props.value),
    scope = useRef<MarkdownAssets | undefined>(undefined),
    [error, setError] = useState(""),
    [ready, setReady] = useState(false);
  latest.current = props;
  const uploadId = useRef(props.storageKey ?? id),
    text = useRef(props.value);
  useSyncExternalStore(
    markdownWork.uploads.subscribe, markdownWork.uploads.getSnapshot,
  );
  const failedUpload = markdownWork.uploads.firstFailure(uploadId.current);
  const visibleError = failedUpload?.error ?? error;
  useEffect(() => {
    alive.current = true;
    let live = true,
      initialized = false;
    let observer: MutationObserver | undefined;
    const assets = new MarkdownAssets();
    scope.current = assets;
    let instance: Vditor | undefined;
    const taskIds = new Set<string>();
    const releaseAssets = () => {
      if (!live && ![...taskIds].some(id => markdownWork.uploads.has(id)))
        assets.dispose();
    };
    const repairImages = () => {
      for (const img of instance?.vditor.ir?.element.querySelectorAll("img") ??
        []) {
        const src = img.getAttribute("src") ?? "",
          hash = assetHash(src);
        if (hash)
          void assets
            .url(hash)
            .then((url) => {
              if (live && img.getAttribute("src") !== url)
                img.setAttribute("src", url);
            })
            .catch(() => {});
      }
    };
    const changes = () => {
      if (!live || !initialized || applying.current || !instance) return;
      repairImages();
      const value = assets.canonical(instance.getValue());
      if (value === text.current) return;
      revision.current++;
      text.current = value;
      markdownWork.values.set(uploadId.current, value);
      echoes.current = [...echoes.current.slice(-7), value];
      latest.current.onChange(value);
    };
    const addImages = async (files: File[], cancelled: () => boolean) => {
      const saved = await Promise.all(files.map((file) => assets.upload(file)));
      if (cancelled()) return;
      const canonical = saved
        .map(
          (x, i) =>
            `![${files[i]!.name.replace(/[\[\]\n]/g, "")}](${x.reference})`,
        )
        .join("\n\n");
      // Closing a card must not discard an already accepted paste. Persist its markdown even after unmount.
      const appendToClosedEditor = () => {
        text.current =
          (markdownWork.values.get(uploadId.current) ?? text.current) +
          "\n\n" +
          canonical +
          "\n";
        markdownWork.values.set(uploadId.current, text.current);
        echoes.current = [...echoes.current.slice(-7), text.current];
        latest.current.onChange(text.current);
      };
      if (!live || !instance) {
        appendToClosedEditor();
        return;
      }
      const rendered = await assets.hydrate(canonical);
      if (cancelled()) return;
      if (!live) {
        appendToClosedEditor();
        return;
      }
      instance.insertValue("\n\n" + rendered + "\n");
      changes();
    };
    const upload = (files: File[]) => {
      const captured = [...files];
      const task = markdownWork.uploads.create(
        uploadId.current, cancelled => addImages(captured, cancelled), releaseAssets,
      );
      taskIds.add(task.id);
      return task.retry();
    };
    void (async () => {
      try {
        const [{ default: Editor }, value] = await Promise.all([
          import("vditor"),
          assets.hydrate(latest.current.value),
          loadIcons(),
        ]);
        if (!live) return;
        instance = new Editor(id, {
          mode: "ir",
          value,
          lang: "zh_CN",
          cdn: new URL("vditor", location.href).href,
          cache: { enable: false },
          height: "100%",
          minHeight: 60,
          placeholder: latest.current.placeholder ?? "",
          toolbar: latest.current.compact
            ? ["bold", "italic", "link", "upload", "undo", "redo"]
            : [
                "headings",
                "bold",
                "italic",
                "list",
                "check",
                "quote",
                "link",
                "table",
                "upload",
                "undo",
                "redo",
              ],
          toolbarConfig: { pin: true },
          counter: { enable: false },
          preview: {
            hljs: { enable: false },
            math: { engine: "KaTeX", inlineDigit: true },
            markdown: { autoSpace: false, fixTermTypo: false },
          },
          upload: {
            accept: "image/png,image/jpeg,image/webp,image/gif,image/bmp",
            handler: async (files): Promise<null> => {
              try {
                await upload(files);
              } catch {
                /* The editor exposes its retry action and retains the accepted files. */
              }
              return null;
            },
          },
          input: changes,
          blur: () => latest.current.onBlur?.(),
          keydown: (event) => {
            if (event.key === "Escape") latest.current.onEscape?.();
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey))
              latest.current.onSave?.();
          },
          after: () => {
            markIconsReady();
            if (!live) {
              instance?.destroy();
              markIconsReady();
              return;
            }
            initialized = true;
            editor.current = instance;
            const input = instance!.vditor.ir?.element;
            if (input) {
              input.setAttribute("aria-label", latest.current.label);
              input.setAttribute("role", "textbox");
              input.setAttribute("aria-multiline", "true");
              observer = new MutationObserver(changes);
              observer.observe(input, {
                childList: true,
                subtree: true,
                characterData: true,
              });
            }
            if (latest.current.disabled) instance!.disabled();
            if (latest.current.autoFocus) instance!.focus();
            setReady(true);
            repairImages();
          },
        });
        // Initialization takes time. Apply a remote update only after the editor has finished creating.
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : "编辑器载入失败");
      }
    })();
    return () => {
      changes();
      observer?.disconnect();
      live = false;
      alive.current = false;
      editor.current = undefined;
      if (initialized) instance?.destroy();
      releaseAssets();
    };
  }, [id]);
  useEffect(() => {
    const changed = observedProp.current !== props.value;
    observedProp.current = props.value;
    const echo = echoes.current.lastIndexOf(props.value);
    if (echo >= 0) {
      echoes.current.splice(0, echo + 1);
      return;
    }
    // A ready-state render may still carry the value from before the first keystroke.
    // Await its parent echo rather than restoring that stale value into the editor.
    if (echoes.current.length && !changed) return;
    echoes.current = [];
    text.current = props.value;
    markdownWork.values.set(uploadId.current, props.value);
    const e = editor.current,
      assets = scope.current;
    if (!e || !assets) return;
    const current = assets.canonical(e.getValue());
    if (current === props.value) return;
    const version = revision.current;
    void assets.hydrate(props.value).then((value) => {
      if (
        !alive.current ||
        editor.current !== e ||
        revision.current !== version
      )
        return;
      applying.current = true;
      try {
        e.setValue(value);
      } finally {
        applying.current = false;
      }
    });
  }, [props.value, ready]);
  useEffect(() => {
    if (editor.current) {
      props.disabled ? editor.current.disabled() : editor.current.enable();
    }
  }, [props.disabled, ready]);
  return (
    <div
      className="pp-markdown-editor"
      data-compact={props.compact ? "true" : undefined}
      data-pp-overlay=""
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div id={id} ref={host} />
      {!ready && !visibleError && (
        <span className="pp-markdown-editor__loading">载入中…</span>
      )}
      {visibleError && (
        <div className="pp-markdown-editor__error" role="status">
          <span>{visibleError}</span>
          <IconButton
            icon="rotate"
            label="重试图片保存"
            size="md"
            onClick={() => {
              if (failedUpload)
                void failedUpload.retry().catch((e) =>
                  toast.show({ tone: "error", message: String(e) }),
                );
            }}
          />
          <IconButton
            icon="close"
            label="取消本次图片插入"
            size="md"
            onClick={() => {
              failedUpload?.cancel();
              if (!failedUpload) setError("");
            }}
          />
        </div>
      )}
    </div>
  );
}
