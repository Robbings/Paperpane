import { useCallback, useEffect, useState } from 'react';
import { checkForUpdate, dismissUpdate, onUpdateChanged, readUpdate, type UpdateState } from '@/update/check';

/** The recorded update check, kept current across pages, with the two things a page can do about it. */
export function useUpdate() {
  const [state, setState] = useState<UpdateState | null>(null);
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    let alive = true;
    const load = () => void readUpdate().then((next) => alive && setState(next)).catch(() => {});
    load();
    let stop = () => {};
    try {
      stop = onUpdateChanged(load);
    } catch {
      // Not an extension page (a static preview): nothing to follow.
    }
    return () => {
      alive = false;
      stop();
    };
  }, []);
  const check = useCallback(async () => {
    setChecking(true);
    try {
      setState(await checkForUpdate());
    } catch {
      // The check records its own failure; only storage itself failing lands here.
    } finally {
      setChecking(false);
    }
  }, []);
  const dismiss = useCallback((version: string) => void dismissUpdate(version).catch(() => {}), []);
  return { state, checking, check, dismiss };
}
