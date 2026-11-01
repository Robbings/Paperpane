export interface DavConnection {url:string;username:string;password:string}
export class DavError extends Error {status:number;constructor(status:number,message:string){super(message);this.status=status;}}
export class WebDavClient {
  readonly base:URL;
  private authorization:string;
  private fetcher:typeof fetch;
  constructor(connection:DavConnection,fetcher:typeof fetch=fetch){
    this.fetcher=fetcher.bind(globalThis);
    const url=new URL(connection.url);
    if(url.username||url.password||url.search||url.hash||!['https:','http:'].includes(url.protocol)||(url.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw new Error('WebDAV 地址须使用 HTTPS，本机测试可使用 HTTP');
    url.pathname=url.pathname.replace(/\/*$/,'/');this.base=url;
    this.authorization='Basic '+btoa(Array.from(new TextEncoder().encode(connection.username+':'+connection.password),b=>String.fromCharCode(b)).join(''));
  }
  private path(path:string){if(path==='')return this.base.href;if(path.startsWith('/')||path.split('/').some(p=>!p||p==='.'||p==='..'||p.includes('\\')))throw new Error('远程路径无效');return new URL(path.split('/').map(encodeURIComponent).join('/'),this.base).href;}
  private async request(method:string,path:string,headers:HeadersInit={},body?:BodyInit,signal?:AbortSignal){
    const h=new Headers(headers);h.set('Authorization',this.authorization);
    const response=await this.fetcher(this.path(path),{method,headers:h,body,signal:signal?AbortSignal.any([signal,AbortSignal.timeout(120000)]):AbortSignal.timeout(120000),redirect:'error',credentials:'omit',cache:'no-store'});
    if(!response.ok)throw new DavError(response.status,response.status===412?'远程内容已更新，请重新同步':response.status===401||response.status===403?'WebDAV 认证失败或没有权限':response.status===507?'WebDAV 存储空间不足':`WebDAV 请求失败（${response.status}）`);
    return response;
  }
  async get(path:string,signal?:AbortSignal,range?:string){const r=await this.request('GET',path,range?{Range:range}:{},undefined,signal);return {response:r,etag:r.headers.get('ETag')};}
  async put(path:string,body:BodyInit,etag?:string|null,signal?:AbortSignal){const headers:Record<string,string>={};if(etag===null)headers['If-None-Match']='*';else if(etag)headers['If-Match']=etag;const r=await this.request('PUT',path,headers,body,signal);return r.headers.get('ETag');}
  async mkdir(path:string,signal?:AbortSignal){try{await this.request('MKCOL',path,{},undefined,signal);}catch(e){if(!(e instanceof DavError)||![405,301].includes(e.status))throw e;}}
  async remove(path:string,signal?:AbortSignal){try{await this.request('DELETE',path,{},undefined,signal);}catch(e){if(!(e instanceof DavError)||e.status!==404)throw e;}}
  async list(path:string,signal?:AbortSignal){const r=await this.request('PROPFIND',path,{Depth:'1','Content-Type':'application/xml'},'<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/><d:getcontentlength/></d:prop></d:propfind>',signal);return r.text();}
  async probe(signal?:AbortSignal){
    await this.mkdir('paperpane',signal);const path=`paperpane/probe-${crypto.randomUUID()}.txt`;
    let conditional=false;
    try{await this.put(path,'paperpane-connection-test',null,signal);const {response,etag}=await this.get(path,signal);if(await response.text()!=='paperpane-connection-test')throw new Error('WebDAV 读写校验失败');
      try{await this.put(path,'conditional-test','"paperpane-never-matches"',signal);}catch(e){if(e instanceof DavError&&e.status===412)conditional=!!etag&&!etag.startsWith('W/');else throw e;}
      return {readable:true,writable:true,conditional};
    }finally{await this.remove(path,signal).catch(()=>{});}
  }
}
