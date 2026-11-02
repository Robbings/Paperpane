import { waitForRetry } from '../queue';
import { TranslationError } from '../errors';
import type { MachineTranslationConfig } from '@/ui/settings/types';

/** Reader windows share both lanes and the earliest dispatch time for this configured account. */
export async function machineSlot<T>(
  apiId: string,
  settings: MachineTranslationConfig,
  signal: AbortSignal,
  send: () => Promise<T>,
): Promise<T> {
  const name = 'paperpane-machine:' + apiId,
    next = name + ':next';
  const interval = Math.ceil(60000 / settings.requestsPerMinute);
  for (;;) {
    signal.throwIfAborted();
    const remaining = Number(localStorage.getItem(next)) - Date.now();
    if (remaining > 0) {
      await waitForRetry(remaining, signal);
      continue;
    }
    for (let i = 0; i < settings.concurrency; i++) {
      const result = await navigator.locks.request(
        name + ':lane:' + i,
        { ifAvailable: true },
        async (lane) => {
          if (!lane) return;
          const allowed = await navigator.locks.request(name + ':clock', { signal }, () => {
            signal.throwIfAborted();
            if (Number(localStorage.getItem(next)) > Date.now()) return false;
            localStorage.setItem(next, String(Date.now() + interval));
            return true;
          });
          if (!allowed) return;
          signal.throwIfAborted();
          try {
            return { value: await send() };
          } catch (e) {
            if (e instanceof TranslationError && e.diagnostics?.category === 'rate-limit') {
              await navigator.locks.request(name + ':clock', () => {
                const until = Date.now() + Math.max(e.retryAfterMs, 60000);
                localStorage.setItem(next, String(Math.max(Number(localStorage.getItem(next)), until)));
              });
            }
            throw e;
          }
        },
      );
      if (result) return result.value;
    }
    await waitForRetry(80, signal);
  }
}
