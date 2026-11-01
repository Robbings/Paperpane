import type { ZoteroAccess, ZoteroItem, ZoteroData, ZoteroCollection } from './types';
import { md5 } from './md5.ts';
export class ZoteroError extends Error{status:number;retryAt?:number;constructor(status:number,message:string,retryAt?:number){super(message);this.status=status;this.retryAt=retryAt;}}
const pauses=new Map<string,number>();
export function zoteroKey(){const chars='23456789ABCDEFGHIJKLMNPQRSTUVWXYZ';return Array.from(crypto.getRandomValues(new Uint8Array(8)),n=>chars[n%chars.length]).join('');}
export class ZoteroClient {
  private key:string;readonly userId:string;private fetcher:typeof fetch;
  constructor(key:string,userId='',fetcher:typeof fetch=fetch){if(!key.trim())throw new Error('请先连接 Zotero');if(userId&&!/^\d+$/.test(userId))throw new Error('Zotero 用户 ID 无效');this.key=key;this.userId=userId;this.fetcher=fetcher.bind(globalThis);}
  private prefix(){if(!this.userId)throw new Error('缺少 Zotero 用户 ID');return `/users/${this.userId}`;}
  async request(path:string,options:RequestInit={},signal?:AbortSignal){
    if(!path.startsWith('/')||path.startsWith('//')||path.split('?')[0]!.split('/').includes('..'))throw new Error('Zotero 请求路径无效');
    const paused=pauses.get(this.key)??0;if(paused>Date.now())throw new ZoteroError(429,'Zotero 要求稍后重试',paused);
    const headers=new Headers(options.headers);headers.set('Authorization','Bearer '+this.key);headers.set('Zotero-API-Version','3');
    const r=await this.fetcher('https://api.zotero.org'+path,{...options,headers,signal:signal?AbortSignal.any([signal,AbortSignal.timeout(120000)]):AbortSignal.timeout(120000),redirect:'error',credentials:'omit',cache:'no-store'});
    const wait=Math.max(Number(r.headers.get('Backoff'))||0,Number(r.headers.get('Retry-After'))||0);if(wait>0)pauses.set(this.key,Date.now()+wait*1000);
    if(!r.ok)throw new ZoteroError(r.status,r.status===412?'Zotero 内容已变化，请重新读取后重试':r.status===429?'Zotero 请求频率受限，请稍后重试':r.status===403?'Zotero API Key 权限不足':r.status===404?'Zotero 条目或附件不存在':r.status===413?'Zotero 附件空间不足':`Zotero 请求失败（${r.status}）`,wait?Date.now()+wait*1000:undefined);
    return r;
  }
  async connection(signal?:AbortSignal):Promise<ZoteroAccess>{const data=await (await this.request('/keys/current',{},signal)).json();if(!data.access?.user?.library||!Number.isInteger(data.userID))throw new Error('API Key 没有个人文献库读取权限');return data;}
  async collections(signal?:AbortSignal):Promise<ZoteroCollection[]>{const values:ZoteroCollection[]=[];let start=0;while(true){const r=await this.request(`${this.prefix()}/collections?limit=100&start=${start}`,{},signal),page=await r.json();if(!Array.isArray(page))throw new Error('Zotero 分类响应无效');values.push(...page);if(page.length<100)break;start+=100;if(start>=10000)throw new Error('分类数量超出当前浏览限制');}return values;}
  async items(query:{collection?:string;text?:string;start?:number}={},signal?:AbortSignal):Promise<{items:ZoteroItem[];total:number}>{
    if(query.collection&&!/^[A-Z0-9]{8}$/.test(query.collection))throw new Error('Zotero 分类标识无效');
    const params=new URLSearchParams({limit:'50',start:String(Math.max(0,query.start??0)),sort:'title',direction:'asc'});if(query.text)params.set('q',query.text);
    const path=query.collection?`/collections/${query.collection}/items/top`:'/items/top';const r=await this.request(this.prefix()+path+'?'+params,{},signal),items=await r.json();if(!Array.isArray(items))throw new Error('Zotero 列表响应无效');return {items,total:Number(r.headers.get('Total-Results'))||items.length};
  }
  async item(key:string,signal?:AbortSignal):Promise<ZoteroItem>{if(!/^[A-Z0-9]{8}$/.test(key))throw new Error('条目标识无效');return (await this.request(`${this.prefix()}/items/${key}`,{},signal)).json();}
  async children(key:string,signal?:AbortSignal):Promise<ZoteroItem[]>{if(!/^[A-Z0-9]{8}$/.test(key))throw new Error('条目标识无效');const result:ZoteroItem[]=[];for(let start=0;start<10000;start+=100){const r=await this.request(`${this.prefix()}/items/${key}/children?limit=100&start=${start}`,{},signal),page=await r.json();if(!Array.isArray(page))throw new Error('Zotero 附件响应无效');result.push(...page);if(page.length<100)return result;}throw new Error('附件数量过多');}
  async save(data:ZoteroData,signal?:AbortSignal):Promise<ZoteroItem>{
    // Client-assigned keys require an object version even on first creation.
    // Zero asserts that the key is new; known versions retain optimistic locking.
    const payload=data.key&&data.version===undefined?{...data,version:0}:data;
    const r=await this.request(`${this.prefix()}/items`,{method:'POST',headers:{'Content-Type':'application/json',...(payload.version===undefined?{'Zotero-Write-Token':crypto.randomUUID().replaceAll('-','')}:{})},body:JSON.stringify([payload])},signal),result=await r.json();
    if(result.failed?.['0'])throw new ZoteroError(result.failed['0'].code,result.failed['0'].message??'Zotero 条目保存失败');
    const key=result.successful?.['0']?.key??result.success?.['0']??result.unchanged?.['0'];if(!key)throw new Error('Zotero 没有返回保存结果');return this.item(key,signal);
  }
  async download(key:string,signal?:AbortSignal){
    // Standard Authorization is removed by Fetch on cross-origin redirects; no custom secret header is used.
    if(!/^[A-Z0-9]{8}$/.test(key))throw new Error('附件标识无效');
    const r=await this.fetcher(`https://api.zotero.org${this.prefix()}/items/${key}/file`,{headers:{Authorization:'Bearer '+this.key,'Zotero-API-Version':'3'},redirect:'follow',credentials:'omit',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(120000)]):AbortSignal.timeout(120000)});
    if(!r.ok)throw new ZoteroError(r.status,r.status===404?'PDF 未上传到 Zotero Storage，可关联 WebDAV 后重试':'无法下载 Zotero PDF');return r;
  }
  async upload(key:string,blob:Blob,filename:string,previousMd5?:string,signal?:AbortSignal){
    const bytes=new Uint8Array(await blob.arrayBuffer()),hash=md5(bytes);const condition:Record<string,string>=previousMd5?{'If-Match':previousMd5}:{'If-None-Match':'*'};
    const path=`${this.prefix()}/items/${key}/file`,params=new URLSearchParams({md5:hash,filename,filesize:String(blob.size),mtime:String(Date.now())});
    const authorization=await (await this.request(path,{method:'POST',headers:{...condition,'Content-Type':'application/x-www-form-urlencoded'},body:params},signal)).json();if(authorization.exists)return;
    const target=new URL(authorization.url);if(target.protocol!=='https:'||target.username||target.password)throw new Error('Zotero 上传地址无效');
    const upload=await this.fetcher(target,{method:'POST',headers:{'Content-Type':authorization.contentType},body:new Blob([authorization.prefix,blob,authorization.suffix]),credentials:'omit',redirect:'error',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(120000)]):AbortSignal.timeout(120000)});if(!upload.ok)throw new Error('PDF 上传失败，可重新导出以重试');
    await this.request(path,{method:'POST',headers:{...condition,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({upload:authorization.uploadKey})},signal);
  }
}
