import type { AnchorService, DocumentAnchor, DocumentRef, LocateResult, Projection } from '../document';
/** UI fixtures control projection; this deliberately does not pretend to render PDF coordinates. */
export function createDemoAnchors(ref: DocumentRef) {
  let projection: Projection = { state: 'pending', pageIndexes: [0] };
  let accuracy: 'exact' | 'approximate' = 'exact';
  const listeners = new Set<() => void>();
  const matches = (anchor: DocumentAnchor) => anchor.documentId === ref.documentId && anchor.fileVersion === ref.fileVersion;
  const missing = { code: 'FILE_MISSING' as const, message: '此文件版本不可用', recovery: ['choose-file' as const] };
  const service: AnchorService = {
    async locate(anchor): Promise<LocateResult> { return matches(anchor) ? { state: accuracy, anchor: structuredClone(anchor) } : { state: 'unavailable', error: missing }; },
    project: (anchor) => matches(anchor) ? structuredClone(projection) : { state: 'unavailable', error: missing },
    subscribeViewport: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
  return { service, controls: { setProjection: (value: Projection) => { projection = structuredClone(value); listeners.forEach((listener) => listener()); }, setAccuracy: (value: typeof accuracy) => { accuracy = value; } } };
}
