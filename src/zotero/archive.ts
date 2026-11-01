import { unzipSync } from 'fflate';
import { archiveFilename } from './archive-names';
export function decodeZoteroArchive(bytes:Uint8Array,filename?:string):Blob{
  if(bytes.length>512*1024*1024)throw new Error('Zotero 附件包超过 512 MiB');
  let size=0,count=0;const files=unzipSync(bytes,{filter:file=>{
    if(++count>200)throw new Error('Zotero 附件包路径无效');
    size+=file.originalSize;if(size>512*1024*1024)throw new Error('Zotero 附件包解压体积过大');return /\.pdf$/i.test(archiveFilename(file.name));
  }});
  const names=Object.keys(files);const selected=names.find(n=>archiveFilename(n).split(/[\\/]/).at(-1)===filename)??(names.length===1?names[0]:undefined);
  if(!selected)throw new Error(names.length?'附件包中有多个 PDF，请先在 Zotero 中明确关联的附件':'附件包中没有 PDF');return new Blob([new Uint8Array(files[selected]!)],{type:'application/pdf'});
}
