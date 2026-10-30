import { useEffect } from 'react';
import type { PdfjsReader } from '@/document/reader/pdfjs-reader';
import type { DocumentRef } from '@/contracts/document';
import type { Preferences } from '@/ui/settings/types';
import { ModelSettingsStore } from '@/data/model-settings';
import { toast } from '@/ui/components';
import { ElementStore } from './store';
import { readLayoutPage, pageElements } from './detection';
import { expandBox } from './geometry';
import { LAYOUT_VERSION, type PaperElement } from './types';
import { copyRecord, runElementJob, transcribeFormulaBatch } from './transcribe';

export interface FormulaPlan {
  state: 'eligible' | 'over-limit';
  count: number;
  elements: PaperElement[];
  sessionId: string;
  runState?: 'running' | 'complete' | 'failed' | 'interrupted';
  error?: string;
}
const planKey = (ref: DocumentRef, limit: number) => `formula-plan:v1:${ref.documentId}:${ref.fileVersion}:${LAYOUT_VERSION}:${limit}`;

/** Only local inference until the entire paper is known to fit the threshold. */
export async function formulaPlan(reader: PdfjsReader, ref: DocumentRef, limit: number, signal: AbortSignal): Promise<FormulaPlan> {
  const store = new ElementStore(), key = planKey(ref, limit);
  const saved = await store.read<FormulaPlan>(key);
  signal.throwIfAborted();
  if (saved) return saved;
  const formulas: PaperElement[] = [];
  const count = reader.getSnapshot().data.pageCount;
  for (let i = 0; i < count; i++) {
    signal.throwIfAborted();
    const page = await readLayoutPage(reader, ref, i, signal);
    formulas.push(...(await pageElements(reader, page, signal)).filter(e => e.kind === 'formula'));
    if (formulas.length > limit) {
      const plan: FormulaPlan = { state: 'over-limit', count: formulas.length, elements: [], sessionId: crypto.randomUUID() };
      await store.write(key, plan);
      return plan;
    }
  }
  signal.throwIfAborted();
  const plan: FormulaPlan = { state: 'eligible', count: formulas.length, elements: formulas, sessionId: crypto.randomUUID() };
  await store.write(key, plan);
  return plan;
}

export async function preprocessFormulas(reader: PdfjsReader, ref: DocumentRef, limit: number, signal: AbortSignal) {
  return navigator.locks.request(`formula-preprocess:${ref.fileVersion}`, { signal }, async () => {
    const plan = await formulaPlan(reader, ref, limit, signal);
    if (plan.state !== 'eligible' || plan.runState === 'failed') return;
    const pending: PaperElement[] = [];
    for (const e of plan.elements) {
      signal.throwIfAborted();
      const saved = await copyRecord(e);
      if (saved?.value === undefined && !saved?.attempts.length) pending.push(e);
    }
    const key = planKey(ref, limit), store = new ElementStore();
    const current = reader.getSnapshot().data.position.pageIndex;
    pending.sort((a, b) => Math.abs(a.page.pageIndex - current) - Math.abs(b.page.pageIndex - current));
    const batches: PaperElement[][] = [];
    for (let i = 0; i < pending.length; i += 5) batches.push(pending.slice(i, i + 5));
    plan.runState = 'running';
    await store.write(key, plan);
    let cursor = 0, failure: unknown;
    const dispatchStop = new AbortController();
    const pendingSignal = AbortSignal.any([signal, dispatchStop.signal]);
    const stopPending = (error: unknown) => {
      if (failure === undefined) failure = error;
      if (!dispatchStop.signal.aborted) dispatchStop.abort(error);
    };
    const lane = async () => {
      while (!failure && cursor < batches.length) {
        const batch = batches[cursor++]!;
        try {
          pendingSignal.throwIfAborted();
          const inputs = [];
          for (const element of batch) {
            pendingSignal.throwIfAborted();
            const anchor = await reader.elementAnchor(element.page.pageIndex, expandBox(element.region.box, 'formula'));
            const image = await reader.captureAnchor(anchor, pendingSignal);
            const hint = await reader.elementText(element.anchor).catch(() => '');
            inputs.push({ element, blob: image.blob, hint });
          }
          await transcribeFormulaBatch(inputs, signal, plan.sessionId, {pendingSignal, onFailure:stopPending});
        } catch (e) { stopPending(e); }
      }
    };
    // This is an upper bound; the shared endpoint concurrency/cooldown still applies.
    await Promise.all(Array.from({ length: Math.min(3, batches.length) }, lane));
    plan.runState = failure ? (signal.aborted ? 'interrupted' : 'failed') : 'complete';
    plan.error = failure instanceof Error ? failure.message : failure ? String(failure) : undefined;
    await store.write(key, plan);
    if (failure) throw failure;
  });
}

export function useFormulaPreprocessing(reader: PdfjsReader, ref: DocumentRef, p: Preferences, ready: boolean, configRevision?: string) {
  useEffect(() => {
    if (!ready || !p.elementDetection || !p.detectFormulas || !p.formulaPreprocess || p.formulaCopyMode === 'image') return;
    const controller = new AbortController();
    void runElementJob(controller.signal, async signal => {
      // Unconfigured/non-vision readers remain usable and do not show a startup error.
      try { const c = await new ModelSettingsStore().resolveConnection(undefined, 'explain'); if (!c.model.vision) return; }
      catch { return; }
      signal.throwIfAborted();
      await preprocessFormulas(reader, ref, p.formulaPreprocessLimit, signal);
    }).catch(e => {
      if (!controller.signal.aborted && e?.name !== 'AbortError') toast.show({ tone: 'error', duration: 4000, message: '公式预处理未完成，可点击复制单独识别。' });
    });
    return () => controller.abort();
  }, [reader, ref.documentId, ref.fileVersion, ready, p.elementDetection, p.detectFormulas, p.formulaPreprocess, p.formulaPreprocessLimit, p.formulaCopyMode, configRevision]);
}
