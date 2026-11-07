import * as Automerge from '@automerge/automerge/slim';
import { automergeWasmBase64 } from '@automerge/automerge/automerge.wasm.base64';

let ready: Promise<void> | undefined;

/** The merge library, with its WebAssembly loaded once per worker or page. */
export async function loadAutomerge() {
  ready ??= Automerge.isWasmInitialized() ? Promise.resolve() : Automerge.initializeBase64Wasm(automergeWasmBase64);
  await ready;
  return Automerge;
}
export type AutomergeApi = typeof Automerge;
