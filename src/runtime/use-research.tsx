import { useCallback, useEffect, useRef, useState } from "react";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { citations, normalizeSourceMarkers } from "@/ai/context";
import { ResearchService } from "@/ai/service";
import { renderResearchText } from "@/ai/markdown";
import { defaultCards } from "@/ai/defaults";
import { useConversationRuntime } from "@/ai/use-conversation-runtime";
import { ChatPanel } from "@/ui/reader/chat/ChatPanel";
import { OverviewPanel } from "@/ui/reader/overview/OverviewPanel";
import { PassageWindow } from "@/ui/reader/windows/PassageWindow";
import { ElementOverlay } from '@/ai/layout/ElementOverlay';
import { copyPersistence } from '@/ai/layout/transcribe';
import { RegionCapture } from "@/ai/ui/RegionCapture";
import { saveImageAttachment,withCaption } from '@/ai/attachments';
import { Button, Icon, IconButton, EmptyState, toast } from "@/ui/components";
import type { ChatSessionView, ModelChangeView } from "@/ui/reader/chat/types";
import type { ResearchPanelId } from "@/ui/reader/types";
import type { DocumentAnchor, SelectionSnapshot } from "@/contracts/document";
import type { SourceCitation } from "@/contracts/conversation";
import {
  messageVersions,
  latestLeaf,
  visibleMessages,
  type ExplanationSource,
} from "@/contracts/conversation";
import type { Preferences } from "@/ui/settings/types";
import type { ReaderController } from "./reader-controller";
const report = (e: unknown) =>
  toast.show({
    tone: "error",
    duration: 4000,
    message: e instanceof Error ? e.message : String(e),
  });
/**
 * Sources of one answer. Those resolved when the answer was written win: the
 * paper text the model saw may be segmented differently after a reload. The
 * current paper fills in IDs the stored list lacks (still streaming, or written
 * in a form older versions did not recognise).
 */
function answerCitations(
  message: { markdown: string; citations?: readonly SourceCitation[] },
  paper: Parameters<typeof citations>[1] | undefined,
): SourceCitation[] {
  const stored = [...(message.citations ?? [])];
  if (!paper) return stored;
  return [...stored, ...citations(message.markdown, paper).filter((c) => !stored.some((s) => s.label === c.label))];
}
function ConversationPanel({
  service,
  sid,
  title,
  onNew,
  onOpen,
  onCapture,
  onLocate,
  onExpand,
  compact = false,
}: {
  compact?: boolean;
  service: ResearchService;
  sid: string;
  title: "讨论" | "解释";
  onNew: () => void;
  onOpen: (sid: string) => void;
  onCapture: () => void;
  onLocate: (anchor: DocumentAnchor) => void;
  onExpand?: () => void;
}) {
  const { runtime, session } = useConversationRuntime(service, sid),
    [, redraw] = useState(0),
    [confirmation, setConfirmation] = useState<ModelChangeView | null>(null),
    confirmationId = useRef<string | undefined>(undefined);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const pasteTail = useRef(Promise.resolve());
  useEffect(() => {
    let alive = true;
    const urls: string[] = [];
    const assets = [
      ...new Set(
        [
          ...(session?.draft.attachments ?? []),
          ...(session?.messages.flatMap((m) => m.attachments) ?? []),
        ].map((a) => a.assetId),
      ),
    ];
    void Promise.all(
      assets.map(async (assetId) => {
        try {
          const url = URL.createObjectURL(
            await service.store.files.read(assetId),
          );
          urls.push(url);
          if (alive) setPreviews((old) => ({ ...old, [assetId]: url }));
        } catch {}
      }),
    );
    return () => {
      alive = false;
      urls.forEach(URL.revokeObjectURL);
    };
  }, [
    service,
    sid,
    session?.messages.length,
    session?.draft.attachments.map((a) => a.id).join(),
  ]);
  if (!session) return null;
  const attachment = (a: (typeof session.draft.attachments)[number]) => ({
    ...a,
    previewUrl: previews[a.assetId],
    pageLabel: a.anchor.pages[0] ? `第 ${a.anchor.pages[0].pageIndex + 1} 页` : undefined,
  });
  const view: ChatSessionView = {
    ...session,
    messages: visibleMessages(session)
      .filter((m) => {
        if (title !== "解释") return true;
        const seed =
          service.record.sessions.find((s) => s.id === sid)?.initialPromptId ??
          session.messages.find(
            (x) =>
              x.role === "user" &&
              x.parentId === null &&
              /^请解释(?:以下选中文本|这张论文截图)/.test(x.markdown),
          )?.id;
        return m.id !== seed;
      })
      .map((m) => {
        const versions = messageVersions(session, m.id);
        const verified = answerCitations(m, service.paper);
        const normalized = normalizeSourceMarkers(m.markdown);
        const unresolved =
          m.role === "assistant" &&
          !["running", "queued"].includes(m.generation?.state ?? "completed") &&
          !/\[\^[^\]]+\]/.test(normalized) &&
          /原文出处|第\s*\d+\s*页|\bpage\s*\d+/i.test(normalized);
        const markdown = normalized + (unresolved ? " [^unlocated]" : "");
        return {
          ...m,
          markdown,
          generation:
            m.generation && "error" in m.generation
              ? {
                  ...m.generation,
                  error: {
                    message: m.generation.error.message,
                    recovery: m.generation.error.recovery.filter(
                      (x): x is "retry" | "configure-model" | "change-model" =>
                        ["retry", "configure-model", "change-model"].includes(
                          x,
                        ),
                    ),
                  },
                }
              : m.generation
                ? { state: m.generation.state }
                : undefined,
          attachments: m.attachments.map(attachment),
          version:
            versions.length > 1
              ? {
                  index: versions.findIndex((v) => v.id === m.id) + 1,
                  count: versions.length,
                }
              : undefined,
          citations: [
            ...verified.map((c) => ({
              ...c,
              verified: true,
              pageLabel: `第 ${c.anchor.pages[0]!.pageIndex + 1} 页`,
            })),
            ...[...markdown.matchAll(/\[\^([^\]]+)\]/g)]
              .filter((match) => !verified.some((c) => c.label === match[1]))
              .map((match) => ({
                id: match[1]!,
                label: match[1]!,
                quote:
                  match[1] === "unlocated"
                    ? "模型只提供了概括性出处，未给出可核对的原文句子，无法精确定位。"
                    : "模型给出的出处不在本次原文来源中。",
                verified: false,
              })),
          ],
        };
      }),
    draft: {
      text: session.draft.text,
      attachments: session.draft.attachments.map(attachment),
    },
    draftSaveFailed: !!service.saveError,
  };
  const locate = (label: string) => {
    const c = session.messages
      .flatMap((m) => answerCitations(m, service.paper))
      .find((c) => c.label === label);
    if (c) onLocate(c.anchor);
    else toast.show({ message: "未能定位这条出处。" });
  };
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ChatPanel
        title={title}
        mode={title === "解释" ? "explanation" : "conversation"}
        hideHeader={compact}
        headerActions={
          onExpand ? (
            <IconButton
              icon="openExternal"
              label="在原文旁打开"
              size="md"
              shape="pill"
              onClick={onExpand}
            />
          ) : undefined
        }
        renderAnswerText={renderResearchText}
        session={view}
        models={service.models().map((m) => ({
          ...m,
          vision: m.capabilities.vision,
          webSearch: m.capabilities.webSearch,
          reasoningLevels: m.capabilities.reasoningLevels,
        }))}
        sessions={service.record.sessions
          .filter(
            (s) =>
              !s.deletedAt && Boolean(s.explanation) === (title === "解释"),
          )
          .map((s) => ({
            id: s.id,
            title: s.title,
            updatedAt: s.updatedAt,
            messageCount: visibleMessages(s).length,
          }))}
        defaultModelId={session.modelId}
        starters={
          title === "讨论"
            ? [
                "这篇论文解决什么问题？",
                "核心方法和已有工作的区别是什么？",
                "实验支持哪些结论，有什么局限？",
              ]
            : ["请用更直白的话解释", "这个公式中的符号是什么意思？"]
        }
        source={undefined}
        modelChange={confirmation}
        onDraft={(text) => {
          const draft=service.record.sessions.find(s=>s.id===sid)!.draft;
          void service.setDraft(sid, { ...draft, text });
        }}
        onSend={() => {
          void pasteTail.current.then(()=> {
            if (!service.canSend(sid)) return;
            return service.send(
              sid,
              service.getSnapshot().data.sessions.find((s) => s.id === sid)!
                .draft,
              service.getSnapshot().data.sessions.find((s) => s.id === sid)!
                .activeLeafId,
            );
          })
            .then((r) => {
              if (r && !r.ok) report(r.error.message);
            }).catch(report);
        }}
        onStop={() => void service.stop(sid)}
        onRegenerate={(mid) => {
          void service.regenerate(sid, mid).then((r) => {
            if (!r.ok) report(r.error.message);
          });
        }}
        onEditQuestion={(mid, text) => {
          const m = session.messages.find((m) => m.id === mid);
          void service.editQuestion(sid, mid, {
            text,
            attachments: m?.attachments ?? [],
          });
        }}
        onVersion={(mid, direction) => {
          const versions = messageVersions(session, mid),
            version =
              versions[versions.findIndex((m) => m.id === mid) + direction];
          if (version) {
            const leaf = latestLeaf(session, version.id);
            if (leaf) void service.selectBranch(sid, leaf);
          }
        }}
        onLocate={(c) => locate(c.label)}
        onRecover={(mid, action) => {
          if (action === "configure-model")
            window.open("options.html#models", "_blank", "noopener");
          else if (
            session.messages.find((m) => m.id === mid)?.generation?.state ===
              "save-failed" ||
            service.saveError
          )
            void service.flush().then((saved) => {
              if (!saved) report(service.saveError ?? "保存失败，请重试");
            });
          else
            void service.regenerate(sid, mid).then((r) => {
              if (!r.ok) report(r.error.message);
            });
        }}
        onRetrySuggestions={() => void service.suggest(sid)}
        onModel={(modelId) => {
          void service.changeModel(sid, modelId).then((r) => {
            if (!r.ok) report(r.error.message);
            else if (r.value.state === "confirmation-required") {
              const c = r.value.confirmation;
              confirmationId.current = c.id;
              setConfirmation({
                target: {
                  ...c.target,
                  vision: c.target.capabilities.vision,
                  reasoningLevels: c.target.capabilities.reasoningLevels,
                },
                messageCount: c.disclosure.messageCount,
                imageCount: c.disclosure.imageCount,
                documents: [service.ref.documentId],
              });
            }
            redraw((n) => n + 1);
          });
        }}
        onReasoning={(v) => void service.reasoning(sid, v)}
        onCaptureRegion={onCapture}
        onPasteImages={(files)=>{
          pasteTail.current=service.pasteImages(sid,files);
          void pasteTail.current.catch(report);
        }}
        onRemoveAttachment={(aid) =>
          void service.setDraft(sid, {
            ...service.record.sessions.find(s=>s.id===sid)!.draft,
            attachments: service.record.sessions.find(s=>s.id===sid)!.draft.attachments.filter((a) => a.id !== aid),
          })
        }
        onConfirmModelChange={() => {
          if (confirmationId.current)
            void service
              .confirmModelChange(confirmationId.current)
              .then((r) => {
                if (!r.ok) report(r.error.message);
                setConfirmation(null);
              });
        }}
        onCancelModelChange={() => setConfirmation(null)}
        onNewSession={onNew}
        onOpenSession={onOpen}
        onRenameSession={(id, title) => void service.rename(id, title)}
        onRemoveSession={(id) => void service.remove(id).then(onNew)}
        onConfigureModels={() =>
          window.open("options.html#models", "_blank", "noopener")
        }
      />
    </AssistantRuntimeProvider>
  );
}
export function useResearch(
  owner: ReaderController | undefined,
  preferences: Preferences,
  configRevision?: string,
  preferencesReady = false,
) {
  const [service, setService] = useState<ResearchService>(),
    [, redraw] = useState(0),
    [discussion, setDiscussion] = useState<string>(),
    [frontWindow, setFrontWindow] = useState<string>(),
    [capture, setCapture] = useState<{ sid?: string }>(),
    [panelRequest, setPanelRequest] = useState<{
      id: ResearchPanelId;
      token: string;
    }>();
  useEffect(()=>{if(!owner)return;owner.researchSessions.add(copyPersistence);return()=>{if(!copyPersistence.unsaved)owner.researchSessions.delete(copyPersistence);};},[owner]);
  const latestPreferences = useRef(preferences);
  latestPreferences.current = preferences;
  const state = owner?.reader.getSnapshot().data,
    ref = state?.document;
  useEffect(() => {
    if (!owner || !ref || state?.phase !== "ready") return;
    let active = true;
    const s = new ResearchService(
      ref,
      (signal) => owner.reader.extractTranslation(signal, () => {}),
      latestPreferences.current,
    );
    setService(s);
    setDiscussion(undefined);
    setFrontWindow(undefined);
    owner.researchSessions.add(s);
    const off = s.subscribe(() => {
      if (active) redraw((n) => n + 1);
    });
    void s.load();
    return () => {
      active = false;
      off();
      setService(undefined);
      void s.dispose().then(() => {
        if (!s.unsaved) owner.researchSessions.delete(s);
      });
    };
  }, [owner, ref?.documentId, ref?.fileVersion, state?.phase]);
  useEffect(() => {
    if (service) {
      service.preferences = preferences;
      void service.settings.view().then((view) => {
        if (service.disposed) return;
        service.view = view;
        service.notify();
        void service.overview();
      });
    }
  }, [service, configRevision, preferences.answerLanguage]);
  const openPanel = (id: ResearchPanelId) =>
    setPanelRequest({ id, token: crypto.randomUUID() });
  const create = async (
    kind: "discuss" | "explain",
    source?: ExplanationSource,
  ) => {
    if (!service) return;
    const result = await service.create({
      title: kind === "explain" ? "选区解释" : "新对话",
      documents: [service.ref],
      modelId: service.defaultModel(kind),
      explanation: source,
    });
    if (!result.ok) {
      report(result.error.message);
      return;
    }
    if (kind === "explain") setFrontWindow(result.value.id);
    else setDiscussion(result.value.id);
    return result.value.id;
  };
  const locate = async (anchor: DocumentAnchor) => {
    const r = await owner?.reader.locate(anchor);
    if (r?.state === "unavailable") toast.show({ message: r.error.message });
  };
  const selected = async (selection: SelectionSnapshot, action: string) => {
    if (!service) return;
    const sid =
      action === "explain"
        ? await create("explain", { kind: "text", selection })
        : (discussId ?? (await create("discuss")));
    if (!sid) return;
    if (action !== "explain") openPanel("discuss");
    if (action === "explain") {
      setFrontWindow(sid);
      const sent = await service.startExplanation(sid, {
        text: `请解释以下选中文本，并结合论文上下文：\n\n${selection.text}`,
        attachments: [],
      });
      if (!sent.ok) report(sent.error.message);
    } else {
      const draft = service
        .getSnapshot()
        .data.sessions.find((s) => s.id === sid)!.draft;
      service.attachText(sid, selection);
      await service.setDraft(sid, {
        text: `${draft.text}${draft.text ? "\n\n" : ""}> ${selection.text.replace(/\n/g, "\n> ")}\n\n`,
        attachments: draft.attachments,
      });
    }
    owner?.reader.dismissMenu();
  };
  const imageAction = async (
    value: Awaited<
      ReturnType<NonNullable<typeof owner>["reader"]["captureImage"]>
    >,
    action: string,
    targetSid?: string,
    caption?: string,
  ) => {
    if (!service) return;
    try {
      const attachment = await saveImageAttachment(service,value.blob,`第 ${value.anchor.pages[0]!.pageIndex + 1} 页截图`,value.anchor);
      const target = targetSid
        ? service.record.sessions.find(
            (s) => s.id === targetSid && !s.deletedAt,
          )
        : undefined;
      if (targetSid && !target) throw new Error("发起框选的会话已关闭");
      const sid =
        target?.id ??
        (action === "explain"
          ? await create("explain", { kind: "image", attachment })
          : (discussId ?? (await service.ensureDiscussion())));
      if (!sid) return;
      if (!targetSid && action !== "explain") openPanel("discuss");
      if (action === "explain" && !targetSid) {
        setFrontWindow(sid);
        const sent = await service.startExplanation(sid, {
          text: "请解释这张论文截图，包括图表、公式、符号及其与论文的关系。" + (caption ? `\n\n已识别图注：\n${caption}` : ""),
          attachments: [attachment],
        });
        if (!sent.ok) report(sent.error.message);
      } else {
        const draft = service
          .getSnapshot()
          .data.sessions.find((s) => s.id === sid)!.draft;
        await service.setDraft(sid, {
          text: caption ? withCaption(draft.text,caption) : draft.text,
          attachments: [...draft.attachments, attachment],
        });
      }
    } catch (e) {
      report(e);
    }
  };
  const closeCapture = useCallback(() => setCapture(undefined), []),
    startCapture = (sid?: string) => {
      if (!owner || state?.phase !== "ready") {
        toast.show({ message: "请先打开论文。" });
        return;
      }
      owner.reader.dismissMenu();
      setCapture({ sid });
    };
  const available = service?.record.sessions.filter((s) => !s.deletedAt) ?? [],
    discussId =
      available.find(
        (s) =>
          s.id === (discussion ?? service?.record.activeDiscussionId) &&
          !s.explanation,
      )?.id ?? available.find((s) => !s.explanation)?.id;
  const empty = (kind: "discuss" | "explain") => (
    <EmptyState
      icon={kind}
      title={
        kind === "explain"
          ? "选中原文后解释"
          : service?.loading
            ? "正在准备对话"
            : "暂时无法打开对话"
      }
      description={
        kind === "explain"
          ? "选中文字后，使用选区工具栏开始解释。"
          : service?.error
      }
      actions={
        kind === "discuss" && !service?.loading ? (
          <Button
            size="sm"
            onClick={() => void service?.ensureDiscussion().catch(report)}
          >
            重试
          </Button>
        ) : undefined
      }
    />
  );
  const chat = (
    sid: string | undefined,
    title: "讨论" | "解释",
    compact = false,
  ) =>
    service && sid ? (
      <ConversationPanel
        key={sid}
        service={service}
        sid={sid}
        title={title}
        compact={compact}
        onNew={() => {
          if (title === "解释") startCapture();
          else void create("discuss");
        }}
        onOpen={(sid) => {
          if (title === "讨论") setDiscussion(sid);
          void service.selectSession(sid);
        }}
        onCapture={() => startCapture(sid)}
        onLocate={(a) => void locate(a)}
        onExpand={
          title === "解释" && !compact ? () => setFrontWindow(sid) : undefined
        }
      />
    ) : (
      empty(title === "解释" ? "explain" : "discuss")
    );
  const run = service?.record.overviews.find(
    (r) => r.id === service.record.activeOverviewId,
  );
  const windows = (service?.record.explanationWindows ?? [])
    .filter((w) => !w.closed)
    .flatMap((w) => {
      const session = available.find((s) => s.id === w.id && s.explanation);
      return session ? [{ ...w, session }] : [];
    });
  const overlay = (
    <>
      {owner && ref && state?.phase==='ready' && <ElementOverlay key={ref.documentId+ref.fileVersion} reader={owner.reader} document={ref} preferences={preferences} preferencesReady={preferencesReady} configRevision={configRevision} hidden={!!capture} onAction={(value,action,caption)=>imageAction(value,action,undefined,caption)}/>}

      {capture && owner && (
        <RegionCapture
          reader={owner.reader}
          allowExplain={!capture.sid}
          onClose={closeCapture}
          onAction={(v, a) => void imageAction(v, a, capture.sid)}
        />
      )}{" "}
      {service &&
        owner &&
        windows.map((window, index) => {
          const windowSession = window.session,
            source = windowSession.explanation!;
          const anchor =
            source.kind === "text"
              ? source.selection.anchor
              : source.attachment.anchor;
          return (
            <PassageWindow
              key={windowSession.id}
              container={owner.reader.translationScrollElement()}
              initialHeight={460}
              layout={window.layout}
              zoomPercent={(state?.position.zoom ?? 1) * 100}
              onLayoutChange={layout => service.layoutExplanation(windowSession.id, layout)}
              onLayoutCommit={() => void service.flush()}
              initialOffset={{ x: (index % 4) * 18, y: (index % 4) * 26 }}
              stackOrder={frontWindow === windowSession.id ? 5 : 3}
              onActivate={() => setFrontWindow(windowSession.id)}
              collapsed={window.collapsed ?? false}
              onCollapsedChange={(collapsed) =>
                void service.collapseExplanation(windowSession.id, collapsed)
              }
              label="选区解释"
              collapsedTitle="解释"
              icon={<Icon name="explain" size={14} />}
              anchorPoint={() => {
                const r = owner.rects(anchor)[0];
                return r ? { x: r.left + r.width + 12, y: r.top } : null;
              }}
              sourceRects={() => owner.rects(anchor)}
              subscribeGeometry={(f) =>
                owner.reader.subscribeProjection("viewport", f)
              }
              onClose={() => void service.closeExplanation(windowSession.id)}
              onLocate={() => void locate(anchor)}
            >
              <div
                className="pp-note__text"
                style={{
                  position: "relative",
                  padding: 0,
                  flex: 1,
                  minHeight: 0,
                  display: "flex",
                  overflow: "hidden",
                }}
              >
                {chat(windowSession.id, "解释", true)}
              </div>
            </PassageWindow>
          );
        })}
    </>
  );
  const panels = {
    discuss: chat(discussId, "讨论"),
    overview: service ? (
      <OverviewPanel
        versions={service.record.overviews
          .map((v, i) => ({
            id: v.id,
            label: `版本 ${i + 1} · ${new Date(v.createdAt).toLocaleString()}`,
            active: v.id === run?.id,
          }))
          .reverse()}
        onVersion={(id) => void service.selectOverview(id)}
        cards={
          run?.id === service.record.overviews.at(-1)?.id
            ? service.record.cards
            : (run?.cards ?? service.record.cards)
        }
        results={run?.results ?? {}}
        defaultCards={defaultCards}
        modelReady={!!service.models().length && !service.loading}
        renderText={renderResearchText}
        onRegenerate={(ids) => void service.overview(true, ids)}
        onStop={() => service.stopOverview()}
        onHide={(id) =>
          void service.saveCards(
            service.record.cards.map((c) =>
              c.id === id ? { ...c, visible: false } : c,
            ),
          )
        }
        onSaveCards={(cards) => void service.saveCards(cards).catch(report)}
        onLocate={(source) => {
          const sentence =
            service.paper?.sentences[Number(source.label.slice(1)) - 1];
          if (sentence) void locate(sentence.anchor);
          else toast.show({ message: "未能定位出处。" });
        }}
        onConfigureModels={() =>
          window.open("options.html#models", "_blank", "noopener")
        }
      />
    ) : (
      <EmptyState icon="overview" title="正在读取论文" />
    ),
  };
  return { panels, overlay, panelRequest, startCapture, selected, service };
}
