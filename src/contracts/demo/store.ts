import type { AppError, Readable, Result, Snapshot } from '../common';
import { success } from '../common';
/** Only an in-memory UI fixture. No network, filesystem or browser storage. */
export interface DemoControls {
  setDelay(ms: number): void;
  /** Consumed by the next asynchronous operation, not by each stream chunk. */
  failNext(error: AppError): void;
  setLoadState(state: 'loading' | 'ready' | 'partial' | 'failed', error?: AppError): void;
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    Object.values(value).forEach(freeze);
  }
  return value;
}
export function demoStore<T>(initial: T) {
  let snapshot: Snapshot<T> = freeze({ mode: 'demo', state: 'ready', data: structuredClone(initial) });
  const listeners = new Set<() => void>();
  let delay = 80;
  let nextError: AppError | undefined;
  const emit = () => listeners.forEach((listener) => listener());
  const readable: Readable<T> = {
    getSnapshot: () => snapshot,
    subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
  const controls: DemoControls = {
    setDelay: (ms) => { delay = Number.isFinite(ms) ? Math.max(0, ms) : 0; },
    failNext: (error) => { nextError = structuredClone(error); },
    setLoadState: (state, error) => {
      const data = snapshot.data;
      snapshot = freeze(state === 'failed' || state === 'partial'
        ? { mode: 'demo', state, data, error: error ?? { code: 'NETWORK', message: '演示加载失败', recovery: ['retry'] } }
        : { mode: 'demo', state, data });
      emit();
    },
  };
  return {
    readable, controls,
    data: () => snapshot.data,
    update: (data: T) => { snapshot = freeze({ ...snapshot, data: structuredClone(data) }); emit(); },
    async gate(): Promise<Result<void>> {
      const error = nextError; nextError = undefined;
      await new Promise((resolve) => setTimeout(resolve, delay));
      return error ? { ok: false, error } : success(undefined);
    },
  };
}
export const demoId = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
