import { useSyncExternalStore } from 'react';
import type { Readable } from '../contracts/common';
/** Pass a stable service instance created above the component tree. */
export function useContract<T>(service: Readable<T>) {
  return useSyncExternalStore(service.subscribe, service.getSnapshot, service.getSnapshot);
}
