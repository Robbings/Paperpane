import './ZoteroDestination.css';
import { Select } from '@/ui/components';
import { folderLabel, type FolderOption } from '@/zotero/catalog';
export function ZoteroDestination({mode,onMode,folder,onFolder,folders,canPreserve=true,disabled=false}:{
  mode:'collections'|'folder';onMode:(mode:'collections'|'folder')=>void;folder:string;onFolder:(folder:string)=>void;
  folders:readonly FolderOption[];canPreserve?:boolean;disabled?:boolean;
}){
  return <div className="pp-zotero-destination">
    <Select label="导入目录方式" value={mode} onChange={onMode} disabled={disabled} options={[
      {value:'collections',label:'保留 Zotero 分类与子目录',disabled:!canPreserve},
      {value:'folder',label:'放入指定目录'},
    ]}/>
    {mode==='folder'?<Select label="纸窗目标目录" value={folder} onChange={onFolder} disabled={disabled} options={[
      {value:'root',label:'未分类'},...folders.map(f=>({value:f.id,label:folderLabel(folders,f.id)})).sort((a,b)=>a.label.localeCompare(b.label,'zh-CN')),
    ]}/>:<p className="pp-zotero-hint">在纸窗的 Zotero 文件夹下保留原分类；一篇论文的多个分类都会保留。</p>}
    {!canPreserve&&<p className="pp-zotero-hint">WebDAV 不包含分类信息。连接 Zotero API 后可保留原分类，现在可选择导入目录。</p>}
  </div>;
}
