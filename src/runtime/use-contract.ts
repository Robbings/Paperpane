import { useCallback, useSyncExternalStore } from 'react';
import type { Readable } from '../contracts/common';
/** Pass a stable service instance created above the component tree. */
export function useContract<T>(service: Readable<T>) {
  const subscribe = useCallback((listener: () => void) => service.subscribe(listener), [service]);
  const getSnapshot = useCallback(() => service.getSnapshot(), [service]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
