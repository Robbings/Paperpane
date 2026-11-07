import * as Automerge from '@automerge/automerge/slim';
import { browser } from 'wxt/browser';

let ready: Promise<void> | undefined;

/**
 * The merge library, with its WebAssembly loaded once per worker or page. The
 * extension ships automerge.wasm as a file (see wxt.config.ts) rather than inlined,
 * so the background and the settings page share one copy. Scripts outside the
 * extension hand over the bytes in `globalThis.__paperpaneAutomergeWasm`.
 */
export async function loadAutomerge() {
  ready ??= Automerge.isWasmInitialized()
    ? Promise.resolve()
    : Automerge.initializeWasm(
        (globalThis as { __paperpaneAutomergeWasm?: Uint8Array }).__paperpaneAutomergeWasm ??
          fetch(browser.runtime.getURL('/automerge.wasm' as any)).then(async (r) => new Uint8Array(await r.arrayBuffer())),
      );
  await ready;
  return Automerge;
}
export type AutomergeApi = typeof Automerge;
