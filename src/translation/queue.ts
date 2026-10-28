import { retryPolicy } from './errors';
export function waitForRetry(ms: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}
/** One task owns dispatch, pacing and recovery. Workers cannot retry behind the scheduler. */
export async function runTranslationQueue<T>(items: readonly T[], options: {
  concurrency: number; signal: AbortSignal;
  execute: (item: T, attempt: number, signal: AbortSignal) => Promise<void>;
  onRetry: (item: T, attempt: number, delay: number, error: string) => Promise<void>;
  split?: (item: T) => T[];
  maxRetries?: number; baseDelay?: number; minInterval?: number; maxRecoveryProbes?: number; rateLimitDelay?: number;
}): Promise<{ errors: string[] }> {
  type Job = { item: T; attempt: number; contentRetries: number; readyAt: number };
  const pending: Job[] = items.map(item => ({ item, attempt: 0, contentRetries: 0, readyAt: 0 }));
  const stop = new AbortController(), signal = AbortSignal.any([options.signal, stop.signal]);
  const active = new Set<Promise<void>>(), errors: string[] = [];
  const limit = Math.max(1, Math.min(12, Math.floor(options.concurrency) || 1));
  const baseDelay = options.baseDelay ?? 5000, interval = options.minInterval ?? 750;
  const retryBudget = Math.max(8, Math.min(24, Math.ceil(items.length * .3)));
  let effectiveInterval = interval;
  let nextDispatch = 0, cooldownUntil = 0, recovering = false, recoveryProbes = 0, retries = 0, consecutiveContentFailures = 0;
  const halt = (message: string) => { errors.push(message); stop.abort(new DOMException('任务已停止发送新请求', 'AbortError')); };
  const launch = (job: Job, probe: boolean) => {
    if (job.attempt > 0 && ++retries > retryBudget) { halt('本次任务已达到自动重试总上限，已保留译文。请检查接口后继续。'); return; }
    nextDispatch = Date.now() + effectiveInterval;
    const work = (async () => {
      try {
        await options.execute(job.item, job.attempt, signal);
        consecutiveContentFailures = 0;
        if (probe) { recovering = false; recoveryProbes = 0; cooldownUntil = 0; }
      } catch (error) {
        if (signal.aborted) return;
        const policy = retryPolicy(error);
        if (policy.fatal || !policy.retryable) { halt(policy.message); return; }
        if (policy.recovery === 'service') {
          // Failures already in flight form ONE outage wave, not several recovery attempts.
          const rateLimited = policy.diagnostics?.category === 'rate-limit';
          // Slow once per outage wave/probe; concurrent failures do not multiply the penalty.
          if (rateLimited && (!recovering || probe)) effectiveInterval = Math.min(60000, Math.max(interval, effectiveInterval * 2));
          if (!recovering) { recovering = true; recoveryProbes = 0; }
          if (probe) recoveryProbes++;
          if (recoveryProbes >= (options.maxRecoveryProbes ?? 3)) {
            halt(`${policy.message} 接口连续恢复失败，已停止整项任务的新请求；已收到的译文保留，可稍后继续。`); return;
          }
          const recoveryDelay = rateLimited ? (options.rateLimitDelay ?? 60000) : baseDelay;
          const delay = Math.max(policy.retryAfterMs, Math.min(rateLimited ? 300000 : 60000, recoveryDelay * 2 ** recoveryProbes) + Math.floor(Math.random() * Math.max(1, recoveryDelay * .1)));
          cooldownUntil = Math.max(cooldownUntil, Date.now() + delay);
          pending.unshift({ ...job, attempt: job.attempt + 1, readyAt: cooldownUntil });
          await options.onRetry(job.item, recoveryProbes + 1, delay, `${policy.message} 整个任务冷却后仅发送一个恢复请求。${rateLimited ? `恢复后请求间隔至少 ${Math.ceil(effectiveInterval / 1000)} 秒。` : ''}`);
        } else {
          consecutiveContentFailures++;
          if (job.contentRetries >= (options.maxRetries ?? 2)) {
            errors.push(policy.message);
            if (consecutiveContentFailures >= 5) halt('连续多个分块无法生成有效译文，已停止任务，请检查模型输出。');
            return;
          }
          const delay = Math.max(policy.retryAfterMs, baseDelay * 2 ** job.contentRetries);
          const parts = options.split?.(job.item) ?? [job.item];
          pending.push(...parts.map(item => ({ item, attempt: job.attempt + 1, contentRetries: job.contentRetries + 1, readyAt: Date.now() + delay })));
          await options.onRetry(job.item, job.contentRetries + 1, delay, policy.message);
        }
      }
    })().catch(error => { if (!signal.aborted) halt(retryPolicy(error).message); });
    active.add(work); void work.finally(() => active.delete(work));
  };
  try {
    while (!signal.aborted && (pending.length || active.size)) {
      const now = Date.now();
      // Drain old in-flight requests before the single recovery probe. No new chunks during outage.
      const canDispatch = pending.length && active.size < limit && (!recovering || active.size === 0) && now >= nextDispatch && now >= cooldownUntil;
      const index = canDispatch ? pending.findIndex(job => job.readyAt <= now) : -1;
      if (index >= 0) { launch(pending.splice(index, 1)[0]!, recovering); continue; }
      if (!pending.length || active.size >= limit || (recovering && active.size > 0)) {
        await Promise.race(active); continue;
      }
      const earliest = Math.max(nextDispatch, cooldownUntil, Math.min(...pending.map(job => job.readyAt)));
      // Cancel the unused timer when an in-flight completion wakes the scheduler.
      const timerAbort = new AbortController();
      try { await Promise.race([...active, waitForRetry(Math.max(1, earliest - Date.now()), AbortSignal.any([signal, timerAbort.signal]))]); }
      finally { timerAbort.abort(); }
    }
  } catch (error) { if (!signal.aborted) halt(retryPolicy(error).message); }
  await Promise.allSettled(active);
  return { errors };
}
