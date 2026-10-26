import type { AnchorService, DocumentAnchor, DocumentRef, LocateResult, Projection, ProjectionSpace } from '../document';
/** UI fixtures control projection; this deliberately does not pretend to render PDF coordinates. */
export function createDemoAnchors(ref: DocumentRef) {
  const projections: Record<ProjectionSpace, Projection> = {
    page: { space: 'page', state: 'pending', pageIndexes: [0] },
    viewport: { space: 'viewport', state: 'pending', pageIndexes: [0] },
  };
  let accuracy: 'exact' | 'approximate' = 'exact';
  const listeners: Record<ProjectionSpace, Set<() => void>> = { page: new Set(), viewport: new Set() };
  const matches = (anchor: DocumentAnchor) => anchor.documentId === ref.documentId && anchor.fileVersion === ref.fileVersion;
  const missing = { code: 'FILE_MISSING' as const, message: '此文件版本不可用', recovery: ['choose-file' as const] };
  const service: AnchorService = {
    async locate(anchor): Promise<LocateResult> { return matches(anchor) ? { state: accuracy, anchor: structuredClone(anchor) } : { state: 'unavailable', error: missing }; },
    project: (anchor, space) => matches(anchor) ? structuredClone(projections[space]) : { space, state: 'unavailable', error: missing },
    subscribeProjection: (space, listener) => { listeners[space].add(listener); return () => { listeners[space].delete(listener); }; },
  };
  return { service, controls: {
    setProjection(value: Projection) { projections[value.space] = structuredClone(value); listeners[value.space].forEach((listener) => listener()); },
    setAccuracy: (value: typeof accuracy) => { accuracy = value; },
  } };
}
