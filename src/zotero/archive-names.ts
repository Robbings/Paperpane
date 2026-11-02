/** Zotero's older WebDAV archives encode UTF-8 names with a %ZB64 suffix. */
export function archiveFilename(raw: string): string {
  let name = raw;
  if (name.endsWith('%ZB64')) {
    try { name = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(name.slice(0, -5)), c => c.charCodeAt(0))); }
    catch { throw new Error('附件文件名编码无效'); }
  }
  if (name.startsWith('/') || /^[a-z]:/i.test(name) || name.split(/[\\/]/).includes('..') || /[\x00-\x1f]/.test(name)) throw new Error('Zotero 附件包路径无效');
  return name;
}
/** Read the ZIP directory without inflating PDF data. ZIP64 is outside the 512 MiB limit. */
export function zipDirectory(tail: Uint8Array, offset = 0) {
  const view = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  for (let i = tail.length - 22; i >= Math.max(0, tail.length - 65557); i--) {
    if (view.getUint32(i, true) !== 0x06054b50 || i + 22 + view.getUint16(i + 20, true) !== tail.length) continue;
    const count = view.getUint16(i + 10, true), size = view.getUint32(i + 12, true), start = view.getUint32(i + 16, true);
    if (view.getUint16(i+4,true) || view.getUint16(i+6,true) || view.getUint16(i+8,true)!==count || count > 200 || size > 2*1024*1024 || start+size > offset+i) throw new Error('Zotero 附件包目录无效');
    return { start, size, count };
  }
  throw new Error('无法读取 Zotero 附件包目录');
}
export function zipPdfNames(directory: Uint8Array, count: number): string[] {
  const view = new DataView(directory.buffer, directory.byteOffset, directory.byteLength), names: string[] = [];
  let at = 0, total = 0;
  for (let i=0;i<count;i++) {
    if(at+46>directory.length||view.getUint32(at,true)!==0x02014b50)throw new Error('Zotero 附件包目录损坏');
    const length=view.getUint16(at+28,true),extra=view.getUint16(at+30,true),comment=view.getUint16(at+32,true);
    const end=at+46+length+extra+comment;if(end>directory.length)throw new Error('Zotero 附件包目录损坏');
    total+=view.getUint32(at+24,true);if(total>512*1024*1024)throw new Error('Zotero 附件包解压体积过大');
    const name=archiveFilename(new TextDecoder().decode(directory.subarray(at+46,at+46+length)));
    if(/\.pdf$/i.test(name))names.push(name.split(/[\\/]/).at(-1)!);
    at=end;
  }
  return names;
}
