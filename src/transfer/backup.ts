import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { assetPath, assetMime, imageReferences } from './assets.ts';
import type { TransferSnapshot, TransferAsset } from '@/contracts/transfer';
export const BACKUP_LIMITS={bytes:1024*1024*1024,entries:50000,manifest:64*1024*1024};
export async function sha256(bytes:Uint8Array):Promise<string>{return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(bytes))),b=>b.toString(16).padStart(2,'0')).join('');}
function ensure(condition:unknown,message:string):asserts condition {if(!condition)throw new Error(message);}
function validate(snapshot:TransferSnapshot){
  ensure(snapshot?.format==='paperpane-backup'&&[1,2].includes(snapshot.version),'备份格式或版本不支持');
  ensure(typeof snapshot.id==='string'&&snapshot.id.length>0&&typeof snapshot.createdAt==='string'&&typeof snapshot.complete==='boolean','备份清单无效');
  ensure(Array.isArray(snapshot.databases)&&Array.isArray(snapshot.assets),'备份数据无效');
  const names=new Set<string>();
  for(const db of snapshot.databases){
    ensure(typeof db.name==='string'&&/^paperpane(?:[-_].*)?$/.test(db.name)&&!names.has(db.name),'备份数据库无效或重复');names.add(db.name);
    ensure(Number.isInteger(db.version)&&db.version>0&&db.stores&&typeof db.stores==='object'&&!Array.isArray(db.stores),'备份数据库版本无效');
    for(const [store,records] of Object.entries(db.stores))ensure(!['__proto__','constructor','prototype','assets','cache','changes','credentials'].includes(store)&&Array.isArray(records)&&records.every(r=>r&&typeof r==='object'&&!Array.isArray(r)),'备份记录无效');
  }
  const assets=new Map(snapshot.assets.map(a=>[`${a.database}:${a.id}`,a]));
  ensure(assets.size===snapshot.assets.length,'备份文件引用重复');
  for(const asset of snapshot.assets)ensure(names.has(asset.database)&&typeof asset.id==='string'&&/^[a-f0-9]{64}$/.test(asset.sha256)&&['application/pdf','image/png'].includes(assetMime(asset))&&(assetMime(asset)!=='image/png'||asset.id==='note-image:'+asset.sha256),'附件文件标识无效');
  if(snapshot.complete)for(const db of snapshot.databases)for(const doc of db.stores.documents??[]){
    const file=doc.file as {assetId?:string;sha256?:string}|undefined;
    if(file?.assetId)ensure(assets.get(`${db.name}:${file.assetId}`)?.sha256===file.sha256,'完整备份缺少 PDF 文件');
  }
  if(snapshot.complete&&snapshot.version>=2)for(const db of snapshot.databases)for(const hash of imageReferences(db.stores))ensure(assets.get(`${db.name}:note-image:${hash}`)?.sha256===hash,'完整备份缺少嵌入图片');
}
/** Runs inside a dedicated extension worker when used by the UI. */
export async function createBackup(snapshot:TransferSnapshot):Promise<Blob>{
  validate(snapshot);
  const files:Record<string,Uint8Array>=Object.create(null);
  const assets=[];
  for(const asset of snapshot.assets){const bytes=new Uint8Array(await asset.blob.arrayBuffer());ensure(await sha256(bytes)===asset.sha256,'附件文件校验失败');files[assetPath(asset)]=bytes;const {blob,...record}=asset;assets.push({...record,byteLength:bytes.length});}
  const manifest=strToU8(JSON.stringify({...snapshot,assets}));ensure(manifest.length<=BACKUP_LIMITS.manifest,'备份清单过大');files['manifest.json']=manifest;
  ensure(Object.values(files).reduce((n,b)=>n+b.length,0)<=BACKUP_LIMITS.bytes,'备份超过当前单包容量限制（1 GiB）');
  return new Blob([new Uint8Array(zipSync(files,{level:0}))],{type:'application/zip'});
}
export async function inspectBackup(blob:Blob):Promise<TransferSnapshot>{
  ensure(blob.size<=BACKUP_LIMITS.bytes,'备份超过当前单包容量限制（1 GiB）');
  let size=0,count=0;const paths=new Set<string>();
  const files=unzipSync(new Uint8Array(await blob.arrayBuffer()),{filter:entry=>{
    ensure(++count<=BACKUP_LIMITS.entries,'备份文件数量过多');
    ensure(!paths.has(entry.name),'备份包含重复文件');paths.add(entry.name);
    ensure(entry.name==='manifest.json'||/^assets\/[a-f0-9]{64}\.(?:pdf|png)$/.test(entry.name),'备份包含非法路径');
    size+=entry.originalSize;ensure(size<=BACKUP_LIMITS.bytes,'备份解压体积过大');
    if(entry.name==='manifest.json')ensure(entry.originalSize<=BACKUP_LIMITS.manifest,'备份清单过大');return true;
  }});
  ensure(files['manifest.json'],'备份缺少清单');
  const raw=JSON.parse(strFromU8(files['manifest.json'])) as TransferSnapshot & {assets:(Omit<TransferAsset,'blob'>&{byteLength:number})[]};
  validate(raw as unknown as TransferSnapshot);
  const assets:TransferAsset[]=[];
  for(const a of raw.assets){const bytes=files[assetPath(a)];ensure(bytes&&bytes.length===a.byteLength&&await sha256(bytes)===a.sha256,'备份附件缺失或损坏');assets.push({...a,blob:new Blob([new Uint8Array(bytes)],{type:assetMime(a)})});}
  return {...raw,assets};
}
