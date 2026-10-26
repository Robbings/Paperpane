import { browser } from 'wxt/browser';
import { parseSourceUrl } from './download';
/** Call directly from a click/drop action, before awaiting unrelated work. */
export async function requestImportOrigin(rawUrl: string): Promise<boolean> {
  const url = parseSourceUrl(rawUrl);
  // Match patterns do not include ports. Only this protocol and hostname are requested.
  return browser.permissions.request({ origins: [`${url.protocol}//${url.hostname}/*`] });
}
