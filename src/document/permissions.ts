import { browser } from 'wxt/browser';
import { parseSourceUrl } from './download';
/** Call directly from a click/drop action, before awaiting unrelated work. */
export async function requestImportOrigin(rawUrl: string): Promise<boolean> {
  const url = parseSourceUrl(rawUrl);
  // A web preview uses normal CORS. Installed extensions use explicit host grants.
  if (!browser.runtime?.id) return true;
  // Match patterns do not include ports. Only this protocol and hostname are requested.
  const permissions = { origins: [`${url.protocol}//${url.hostname}/*`] };
  if (await browser.permissions.contains(permissions)) return true;
  return browser.permissions.request(permissions);
}
export async function hasImportOrigin(rawUrl: string): Promise<boolean> {
  const url = parseSourceUrl(rawUrl);
  if (!browser.runtime?.id) return true;
  return browser.permissions.contains({ origins: [`${url.protocol}//${url.hostname}/*`] });
}
