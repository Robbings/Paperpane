import { browser } from 'wxt/browser';

/** Keep all image decoders local in both WXT development and production. */
export function pdfjsResources() {
  const root = browser.runtime?.id ? browser.runtime.getURL('/') : new URL('/', location.href).href;
  return { wasmUrl: new URL('pdfjs/wasm/', root).href };
}
