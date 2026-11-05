export interface DavConnection {url:string;username:string;password:string}
export class DavError extends Error {status:number;constructor(status:number,message:string){super(message);this.status=status;}}
export class WebDavClient {
  readonly base:URL;
  private authorization:string;
  private fetcher:typeof fetch;
  constructor(connection:DavConnection,fetcher:typeof fetch=fetch){
    this.fetcher=fetcher.bind(globalThis);
    const url=new URL(connection.url);
    if(url.username||url.password||url.search||url.hash||!['https:','http:'].includes(url.protocol)||(url.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw new Error('地址需要以 https:// 开头');
    url.pathname=url.pathname.replace(/\/*$/,'/');this.base=url;
    this.authorization='Basic '+btoa(Array.from(new TextEncoder().encode(connection.username+':'+connection.password),b=>String.fromCharCode(b)).join(''));
  }
  private path(path:string){if(path==='')return this.base.href;if(path.startsWith('/')||path.split('/').some(p=>!p||p==='.'||p==='..'||p.includes('\\')))throw new Error('远程路径无效');return new URL(path.split('/').map(encodeURIComponent).join('/'),this.base).href;}
  private async request(method:string,path:string,headers:HeadersInit={},body?:BodyInit,signal?:AbortSignal){
    const h=new Headers(headers);h.set('Authorization',this.authorization);
    const response=await this.fetcher(this.path(path),{method,headers:h,body,signal:signal?AbortSignal.any([signal,AbortSignal.timeout(120000)]):AbortSignal.timeout(120000),redirect:method==='GET'?'follow':'error',credentials:'omit',cache:'no-store'});
    if(!response.ok)throw new DavError(response.status,response.status===412?'云端有更新，请重新同步':response.status===401||response.status===403?'用户名或密码不对':response.status===507?'WebDAV 存储空间不足':`WebDAV 请求失败（${response.status}）`);
    return response;
  }
  private async originEtag(path:string,signal?:AbortSignal):Promise<string|null>{
    try {
      const r=await this.request('PROPFIND',path,{Depth:'0','Content-Type':'application/xml'},'<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:getetag/></d:prop></d:propfind>',signal);
      const xml=await r.text();
      for(const block of xml.matchAll(/<(?:[\w-]+:)?propstat\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?propstat>/g)){
        if(!/<(?:[\w-]+:)?status\b[^>]*>HTTP\/\S+ 200(?:\s|<)/.test(block[1]!))continue;
        const value=block[1]!.match(/<(?:[\w-]+:)?getetag\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?getetag>/)?.[1]?.trim();
        if(value)return value.replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
      }
      return null;
    }catch(e){if(e instanceof DavError&&[405,501].includes(e.status))return null;throw e;}
  }
  async get(path:string,signal?:AbortSignal,range?:string){
    let r=await this.request('GET',path,range?{Range:range}:{},undefined,signal);
    if(!r.redirected)return {response:r,etag:r.headers.get('ETag')};
    // Signed storage URLs have their own validators. Only the DAV origin's ETag
    // may guard a later PUT. Bracket a fresh read so a concurrent write cannot
    // pair stale downloaded bytes with a newer origin validator.
    for(let attempt=0;attempt<3;attempt++){
      const before=await this.originEtag(path,signal);
      if(!before)return {response:r,etag:null};
      await r.body?.cancel();
      r=await this.request('GET',path,range?{Range:range}:{},undefined,signal);
      const after=await this.originEtag(path,signal);
      if(before===after)return {response:r,etag:after};
    }
    await r.body?.cancel();
    throw new DavError(412,'云端有更新，请重新同步');
  }
  async put(path:string,body:BodyInit,etag?:string|null,signal?:AbortSignal){const headers:Record<string,string>={};if(etag===null)headers['If-None-Match']='*';else if(etag)headers['If-Match']=etag;const r=await this.request('PUT',path,headers,body,signal);return r.headers.get('ETag');}
  async mkdir(path:string,signal?:AbortSignal){try{await this.request('MKCOL',path,{},undefined,signal);}catch(e){if(!(e instanceof DavError)||![405,301].includes(e.status))throw e;}}
  async remove(path:string,signal?:AbortSignal){try{await this.request('DELETE',path,{},undefined,signal);}catch(e){if(!(e instanceof DavError)||e.status!==404)throw e;}}
  /** Depth-0 lookup; 404 means absent. Use '' for the base so collections need no redirect. */
  async exists(path:string,signal?:AbortSignal){try{const r=await this.request('PROPFIND',path,{Depth:'0','Content-Type':'application/xml'},'<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/></d:prop></d:propfind>',signal);await r.body?.cancel();return true;}catch(e){if(e instanceof DavError&&e.status===404)return false;throw e;}}
  async list(path:string,signal?:AbortSignal){const r=await this.request('PROPFIND',path,{Depth:'1','Content-Type':'application/xml'},'<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/><d:getcontentlength/></d:prop></d:propfind>',signal);return r.text();}
  async probe(signal?:AbortSignal){
    await this.mkdir('paperpane',signal);const path=`paperpane/probe-${crypto.randomUUID()}.txt`;
    let conditional=false;
    try{await this.put(path,'paperpane-connection-test',null,signal);const {response,etag}=await this.get(path,signal);if(await response.text()!=='paperpane-connection-test')throw new Error('WebDAV 读写校验失败');
      if(etag&&!etag.startsWith('W/')){
        let rejectsStale=false,rejectsExisting=false;
        try{await this.put(path,'conditional-test','"paperpane-never-matches"',signal);}catch(e){if(e instanceof DavError&&e.status===412)rejectsStale=true;else if(!(e instanceof DavError)||![400,405,501].includes(e.status))throw e;}
        if(rejectsStale){
          try{await this.put(path,'conditional-create-test',null,signal);}catch(e){if(e instanceof DavError&&e.status===412)rejectsExisting=true;else if(!(e instanceof DavError)||![400,405,501].includes(e.status))throw e;}
          if(rejectsExisting){try{await this.put(path,'paperpane-connection-test',etag,signal);conditional=true;}catch(e){if(!(e instanceof DavError)||![400,405,412,501].includes(e.status))throw e;}}
        }
      }
      return {readable:true,writable:true,conditional};
    }finally{await this.remove(path,signal).catch(()=>{});}
  }
}
