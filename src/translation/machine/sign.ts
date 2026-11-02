const utf8 = new TextEncoder();
export const bytes = (value: string) => utf8.encode(value);
export const hex = (value: ArrayBuffer) =>
  Array.from(new Uint8Array(value), (b) => b.toString(16).padStart(2, '0')).join('');
export const sha256 = async (value: string) => hex(await crypto.subtle.digest('SHA-256', bytes(value)));
export async function hmac(key: string | ArrayBuffer, value: string, hash = 'SHA-256') {
  const imported = await crypto.subtle.importKey(
    'raw',
    typeof key === 'string' ? bytes(key) : key,
    { name: 'HMAC', hash },
    false,
    ['sign'],
  );
  return crypto.subtle.sign('HMAC', imported, bytes(value));
}
export const percent = (s: string) =>
  encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
