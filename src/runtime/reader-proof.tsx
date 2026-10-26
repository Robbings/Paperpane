import { useCallback, useEffect, useRef, useState } from 'react';
import { ReaderShell } from '@/ui/reader/ReaderShell';
import { Button, Dialog, EmptyState, Spinner, TextField, Toaster, toast } from '@/ui/components';
import { downloadFile } from './library-page';
import type { AnnotationView, NoteLayout, ReaderInteraction } from '@/ui/reader/types';
import type { ReaderState } from '@/contracts/reader';
import type { DocumentAnchor } from '@/contracts/document';
import { PdfjsReader } from '@/document/reader/pdfjs-reader';
import { LibraryDatabase } from '@/data/library-database';
import { readingPersistence } from './reading-persistence';
import { importError } from '@/document/errors';
import { useLocalPreferences } from './use-local-preferences';
import '@/document/reader/surface.css';

const idleSearch = { query: '', matchCase: false, wholeWord: false, status: 'idle', total: 0, current: 0 } as const;

/** Real PDF/open-position bridge. Research data is still explicitly session-only. */
export function ReaderProof({ libraryItemId }: { libraryItemId?: string }) {
  const preferences = useLocalPreferences();
  const surface = useRef<HTMLDivElement>(null);
  const owner = useRef<PdfjsReader | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [state, setState] = useState<ReaderState>();
  const [title, setTitle] = useState('请选择 PDF');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasFile, setHasFile] = useState(false);
  const [password, setPassword] = useState('');
  const [annotations, setAnnotations] = useState<AnnotationView[]>([]);
  const [noteLayouts, setNoteLayouts] = useState<NoteLayout[]>([]);
  const anchors = useRef(new Map<string, DocumentAnchor>());
  const storedFile = useRef<Blob | undefined>(undefined);
  useEffect(() => {
    const element = surface.current;
    if (!element || !container) return;
    const reader = new PdfjsReader(container, element);
    owner.current = reader;
    const db = new LibraryDatabase();
    let alive = true;
    let persistence: ReturnType<typeof readingPersistence> | undefined;
    const update = () => {
      const data = reader.getSnapshot().data;
      setState(data);
      if (data.phase === 'ready') persistence?.update(data.position);
    };
    const unsubscribe = reader.subscribe(update);
    update();
    if (libraryItemId)
      void (async () => {
        try {
          const item = await db.getItem(libraryItemId);
          if (!item?.document || !item.hasPdf) throw new Error('这条书目没有可用的 PDF，请返回文献库重新导入。');
          const document = await db.getDocument(item.document.documentId);
          const blob = await db.readFile(item.document);
          if (!alive) return;
          storedFile.current = blob;
          setHasFile(true);
          setTitle(item.title);
          await reader.open(blob, item.document);
          if (!alive || reader.getSnapshot().data.phase !== 'ready') return;
          if (document?.position) {
            const restored = await reader.restorePosition(document.position);
            if (!restored.ok) report(restored.error.message);
          }
          if (!alive) return;
          persistence = readingPersistence(db, item.document, () => {
            if (alive) report('阅读位置保存失败，请检查本机存储空间。');
          });
          persistence.update(reader.getSnapshot().data.position);
        } catch (error) {
          if (alive)
            setLoadError(
              error instanceof Error && !(error instanceof DOMException) ? error.message : importError(error).message,
            );
        }
      })();
    return () => {
      alive = false;
      unsubscribe();
      owner.current = null;
      void reader.dispose();
      void (async () => {
        await persistence?.dispose();
        await db.close();
      })();
    };
  }, [libraryItemId, container]);
  const report = (text: string) => toast.show({ message: text });
  // Problems the reader or the preference store report once, as a notice.
  const readerError = state?.phase === 'failed' ? state.error?.message : undefined;
  useEffect(() => {
    if (preferences.state.error) toast.show({ tone: 'warning', message: preferences.state.error });
  }, [preferences.state.error]);
  const backToLibrary = () => location.assign(new URL('library.html', location.href).href);
  const pickFile = () => input.current?.click();
  const subscribeGeometry = useCallback(
    (listener: () => void) => owner.current?.subscribeProjection('viewport', listener) ?? (() => {}),
    [],
  );
  const annotationRects = useCallback((id: string) => {
    const anchor = anchors.current.get(id);
    if (!anchor) return null;
    const projection = owner.current?.project(anchor, 'viewport');
    return projection?.state === 'ready' ? projection.rects.map((item) => item.rect) : null;
  }, []);
  const selected = state?.selection;
  const interaction: ReaderInteraction = {
    onScrollContainer: setContainer,
    menuTarget:
      selected?.projection.state === 'ready'
        ? {
            kind: 'selection',
            id: selected.id,
            text: selected.snapshot.text,
            rects: selected.projection.rects.map((item) => item.rect),
          }
        : null,
    onDismissMenu: () => {
      if (selected) owner.current?.dismissSelection(selected.id);
    },
    tool: 'select',
    onToolChange: () => report('自动高亮模式尚未接合，请使用选区菜单；当前高亮仅在本次会话有效。'),
    async onCreateHighlight(id, color = 'yellow') {
      const reader = owner.current,
        resolved = reader?.resolveSelection(id);
      if (!reader || !resolved?.ok) {
        report('选区已改变，请重新拖选。');
        return null;
      }
      const result = await reader.highlight(id, color);
      if (!result.ok) {
        report(result.error.message);
        return null;
      }
      anchors.current.set(id, resolved.value.anchor);
      setAnnotations((items) => [
        ...items,
        {
          id,
          kind: 'highlight',
          color,
          pageIndex: resolved.value.anchor.pages[0]!.pageIndex,
          quote: resolved.value.text,
        },
      ]);
      return id;
    },
    onSelectionAction(id, action) {
      const result = owner.current?.resolveSelection(id);
      if (!result?.ok) {
        report('选区已改变，请重新拖选。');
        return;
      }
      if (action === 'copy')
        void navigator.clipboard.writeText(result.value.text).catch(() => report('复制失败，请使用系统复制快捷键。'));
      else report('翻译、解释与问答尚未接通。');
    },
    onAnnotationAction: () => report('批注的 AI 操作尚未接通。'),
    onAnnotationColor: () => report('已有 PDF 高亮的改色尚未接合。'),
    onAnnotationComment(id, comment) {
      setAnnotations((items) => items.map((item) => (item.id === id ? { ...item, note: comment } : item)));
    },
    onAnnotationDelete: () => report('PDF 批注删除尚未接合。'),
    annotationRects,
    subscribeGeometry,
    rotation: state?.position.rotation ?? 0,
    onRotate: (rotation) => {
      const result = owner.current?.setRotation(rotation);
      if (result && !result.ok) report(result.error.message);
    },
    search: idleSearch,
    onSearch: () => report('文档内查找尚未接合。'),
    onSearchStep: () => report('文档内查找尚未接合。'),
    onSearchClose: () => {},
    noteLayouts,
    onNoteLayouts: setNoteLayouts,
  };
  return (
    <>
      <ReaderShell
        header={{
          title,
          sourceLabel: libraryItemId
            ? '本机 PDF · 阅读位置已接存储 · 会话高亮不保存'
            : 'PDF.js 接合验证 · 会话高亮不保存',
          pageCount: state?.pageCount ?? 0,
        }}
        outline={[]}
        pageIndex={state?.position.pageIndex ?? 0}
        zoomPercent={Math.round((state?.position.zoom ?? 1) * 100)}
        annotations={annotations}
        annotationStatus={{ local: 'unmodified', sync: 'unconfigured', simulated: true }}
        notes={{
          value: '',
          onChange: () => report('笔记接合不在本轮验证范围。'),
          local: 'unmodified',
          sync: 'unconfigured',
          simulated: true,
        }}
        document={
          <>
            <div ref={surface} className="pdfViewer pp-pdf-surface" />
            {(loadError ?? readerError) ? (
              <div className="pp-reader-state">
                <EmptyState
                  icon="alert"
                  tone="danger"
                  title="这篇论文打不开"
                  description={loadError ?? readerError}
                  actions={libraryItemId ? <Button onClick={backToLibrary}>返回文献库</Button> : <Button onClick={pickFile}>换一个 PDF</Button>}
                />
              </div>
            ) : state?.phase === 'loading' || (libraryItemId && !state?.pageCount) ? (
              <div className="pp-reader-state" role="status">
                <Spinner size={18} label="正在打开论文" />
              </div>
            ) : (
              !libraryItemId &&
              !state?.pageCount && (
                <div className="pp-reader-state">
                  <EmptyState
                    icon="file"
                    title="打开一份 PDF"
                    description="用于检查真实 PDF 的显示和选区；这里的高亮只留在本次会话。"
                    actions={<Button variant="primary" onClick={pickFile}>选择 PDF</Button>}
                  />
                </div>
              )
            )}
          </>
        }
        onNavigate={(index) => {
          void owner.current?.navigate(index).then((r) => {
            if (!r.ok) report(r.error.message);
          });
        }}
        onZoom={(direction) => {
          const r = owner.current?.setZoom((state?.position.zoom ?? 1) + (direction === 'in' ? 0.1 : -0.1));
          if (r && !r.ok) report(r.error.message);
        }}
        onZoomTo={(percent) => {
          const result = owner.current?.setZoom(percent / 100);
          if (result && !result.ok) report(result.error.message);
        }}
        interaction={interaction}
        onBack={libraryItemId ? backToLibrary : undefined}
        exports={libraryItemId ? [{ id: 'original', label: '导出原 PDF', disabled: !hasFile }] : undefined}
        onExport={() => {
          const blob = storedFile.current;
          if (blob) downloadFile(blob, `${title}.pdf`);
        }}
        settings={{
          preferences: preferences.state.preferences,
          onPreference: preferences.setPreference,
          models: [],
          defaultModelId: null,
          onDefaultModel: () => report('模型配置服务尚未接合，请先完成模型设置。'),
          status: {
            local: preferences.state.local,
            sync: 'unconfigured',
            lastSyncedAt: null,
            modelAvailability: 'unconfigured',
          },
          onOpenSettings: (section) => {
            window.open(`./options.html${section ? `#${section}` : ''}`, '_blank', 'noopener');
          },
        }}
        onLocateAnnotation={(id) => {
          const anchor = anchors.current.get(id);
          if (anchor) void owner.current?.locate(anchor);
        }}
        onTool={(tool) => {
          if (tool === 'rotate') {
            const rotation = (((state?.position.rotation ?? 0) + 90) % 360) as 0 | 90 | 180 | 270;
            owner.current?.setRotation(rotation);
          } else report('该工具将在完整阅读接合阶段连接。');
        }}
      />
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          if (file.size > 256 * 1024 * 1024) {
            report('请选择 256 MiB 以内的 PDF。');
            return;
          }
          setTitle(file.name);
          setLoadError(null);
          setAnnotations([]);
          anchors.current.clear();
          void owner.current?.open(file, { documentId: crypto.randomUUID(), fileVersion: crypto.randomUUID() });
        }}
      />
      <Dialog
        open={Boolean(state?.passwordRequest)}
        onClose={() => (libraryItemId ? backToLibrary() : setPassword(''))}
        title="这份 PDF 需要密码"
        description="密码只用于本次打开，不会保存。"
        footer={
          <>
            <Button onClick={() => (libraryItemId ? backToLibrary() : setPassword(''))}>{libraryItemId ? '返回文献库' : '取消'}</Button>
            <Button
              variant="primary"
              disabled={!password}
              onClick={() => {
                if (!state?.passwordRequest) return;
                owner.current?.submitPassword(state.passwordRequest.requestId, password);
                setPassword('');
              }}
            >
              解锁
            </Button>
          </>
        }
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!state?.passwordRequest || !password) return;
            owner.current?.submitPassword(state.passwordRequest.requestId, password);
            setPassword('');
          }}
        >
          <TextField
            label="PDF 密码"
            hideLabel
            type="password"
            autoComplete="off"
            placeholder="输入密码"
            value={password}
            onChange={setPassword}
            error={state?.passwordRequest?.incorrect ? '密码不正确，请重新输入' : undefined}
          />
        </form>
      </Dialog>
      <Toaster />
    </>
  );
}
