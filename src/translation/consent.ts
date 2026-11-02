const key = 'paperpane-translation-cost-accepted-v1';
interface ConsentRequest {
  detail?: string;
  section: 'models' | 'translation';
  finish: (accepted: boolean) => void;
}
let pending: ConsentRequest | null = null;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((listener) => listener());
export const consentSnapshot = () => pending;
export function subscribeConsent(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function translationCostAccepted() {
  return localStorage.getItem(key) === 'yes';
}

export async function allowTranslation(
  signal?: AbortSignal,
  detail?: string,
  section: 'models' | 'translation' = 'models',
) {
  if (translationCostAccepted()) return true;
  return navigator.locks.request(key, { signal }, () => {
    signal?.throwIfAborted();
    if (translationCostAccepted()) return true;
    // Offscreen import jobs require prior acknowledgement in a visible extension page.
    if (!listeners.size) return false;
    return new Promise<boolean>((resolve, reject) => {
      const cancel = () => finish(false);
      const finish = (accepted: boolean) => {
        if (pending?.finish !== finish) return;
        signal?.removeEventListener('abort', cancel);
        pending = null;
        changed();
        try {
          if (accepted) localStorage.setItem(key, 'yes');
          resolve(accepted);
        } catch (e) {
          reject(e);
        }
      };
      pending = { detail, section, finish };
      signal?.addEventListener('abort', cancel, { once: true });
      changed();
    });
  });
}
