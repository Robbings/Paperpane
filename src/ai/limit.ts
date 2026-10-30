import { waitForRetry } from "@/translation/queue";
import type { Connection } from "@/translation/provider";
/** Cross-tab slots and shared cooldown: translation and research use the same lanes. */
export async function modelSlot<T>(
  connection: Connection,
  signal: AbortSignal,
  run: () => Promise<T>,
): Promise<T> {
  const endpoint = connection.endpoint.baseUrl,
    limit = Math.max(1, Math.min(12, connection.view.runtime.concurrency));
  while (true) {
    signal.throwIfAborted();
    const until =
      Number(localStorage.getItem("paperpane-model-cooldown:" + endpoint)) || 0;
    if (until > Date.now()) {
      await waitForRetry(until - Date.now(), signal);
      continue;
    }
    for (let i = 0; i < limit; i++) {
      const result = await navigator.locks.request(
        `paperpane-model:${endpoint}:${i}`,
        { ifAvailable: true },
        async (lock) => {
          if (!lock) return null;
          signal.throwIfAborted();
          return { value: await run() };
        },
      );
      if (result) return result.value;
    }
    await waitForRetry(100, signal);
  }
}
export function coolModel(endpoint: string, ms: number) {
  const key = "paperpane-model-cooldown:" + endpoint;
  localStorage.setItem(
    key,
    String(Math.max(Number(localStorage.getItem(key)) || 0, Date.now() + ms)),
  );
}
