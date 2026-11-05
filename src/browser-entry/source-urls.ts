import { publisherPdfUrl } from './publisher-pdf.ts';
export interface PaperSource { id: string; label: string }
const sources: Record<string, PaperSource> = {
  'science.org': { id:'science',label:'Science' },
  'aclanthology.org': { id:'acl',label:'ACL Anthology' },
  'openreview.net': { id:'openreview',label:'OpenReview' },
  'openaccess.thecvf.com': { id:'cvf',label:'CVF Open Access' },
  'proceedings.mlr.press': { id:'pmlr',label:'PMLR' },
  'papers.nips.cc': { id:'neurips',label:'NeurIPS' },
  'papers.neurips.cc': { id:'neurips',label:'NeurIPS' },
  'proceedings.neurips.cc': { id:'neurips',label:'NeurIPS' },
  'huggingface.co': { id:'huggingface',label:'Hugging Face Papers' },
  'biorxiv.org': { id:'biorxiv',label:'bioRxiv' },
  'medrxiv.org': { id:'medrxiv',label:'medRxiv' },
  'semanticscholar.org': { id:'semantic-scholar',label:'Semantic Scholar' },
  'pmc.ncbi.nlm.nih.gov': { id:'pmc',label:'PubMed Central' },
  'zenodo.org': { id:'zenodo',label:'Zenodo' },
  'frontiersin.org': { id:'frontiers',label:'Frontiers' },
  'journals.plos.org': { id:'plos',label:'PLOS' },
};
function httpUrl(raw:string):URL|undefined {
  try { const url=new URL(raw);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)return;url.hash='';return url; }
  catch { return; }
}
function scholarHost(host:string):boolean {
  return /^scholar\.google\.(?:com(?:\.[a-z]{2})?|co\.[a-z]{2}|[a-z]{2})$/.test(host);
}
export function paperSource(raw:string):PaperSource|undefined {
  const url=httpUrl(raw);if(!url)return;
  const host=url.hostname.replace(/^www\./,'');
  if(scholarHost(host))return{id:'google-scholar',label:'Google Scholar'};
  if(host==='hal.science'||host.endsWith('.hal.science')||host==='hal.archives-ouvertes.fr')return{id:'hal',label:'HAL'};
  if(host==='ncbi.nlm.nih.gov'&&url.pathname.startsWith('/pmc/'))return sources['pmc.ncbi.nlm.nih.gov'];
  return sources[host];
}

/** Only documented, deterministic paper routes. Unknown landing pages stay unknown. */
export function sourcePdfUrl(raw:string):string|undefined {
  const publisher=publisherPdfUrl(raw);if(publisher)return publisher;
  const url=httpUrl(raw);if(!url||url.port)return;
  const source=paperSource(url.href);if(!source)return;
  const path=url.pathname,origin=url.origin;
  switch(source.id){
    case 'openreview':{
      const id=url.searchParams.get('id');
      if(!['/forum','/pdf'].includes(path)||!id||!/^[\w-]+$/.test(id))return;
      if(path==='/pdf')return url.href;
      return `${origin}/pdf?${new URLSearchParams({id})}`;
    }
    case 'acl':{
      const id=/^\/((?:\d{4}\.[a-zA-Z0-9.-]+\.\d+|[a-zA-Z]\d{2}-\d{4}))(?:\.pdf)?\/?$/.exec(path)?.[1];
      if(id)return `${origin}/${id}.pdf`;return;
    }
    case 'pmlr':{
      const match=/^\/(v\d+)\/([a-zA-Z0-9_-]+)\.html$/.exec(path);
      if(match)return `${origin}/${match[1]}/${match[2]}/${match[2]}.pdf`;return;
    }
    case 'cvf':
      if(/^\/content(?:\/|_)/.test(path)&&path.includes('/html/')&&path.endsWith('.html'))return origin+path.replace('/html/','/papers/').replace(/\.html$/,'.pdf');
      return;
    case 'neurips':
      if(/^\/(?:paper_files\/paper|paper)\/\d{4}\/hash\/[a-f0-9]{32}-Abstract(?:-[\w]+)?\.html$/i.test(path))return origin+path.replace('/hash/','/file/').replace('-Abstract','-Paper').replace(/\.html$/,'.pdf');
      return;
    case 'huggingface':{
      const id=/^\/papers\/(\d{4}\.\d{4,5}(?:v[1-9]\d*)?)\/?$/.exec(path)?.[1];
      if(id)return `https://arxiv.org/pdf/${id}`;return;
    }
    case 'biorxiv':case 'medrxiv':{
      const id=/^\/content\/(10\.1101\/\d+(?:\.\d+)*(?:v[1-9]\d*)?)(?:\.full(?:\.pdf)?|\.abstract)?\/?$/.exec(path)?.[1];
      if(id)return `${origin}/content/${id}.full.pdf`;return;
    }
    case 'hal':{
      const id=/^\/((?:hal|inria|tel|insu|inserm)-\d+(?:v[1-9]\d*)?)(?:\/document)?\/?$/.exec(path)?.[1];
      if(id)return /\/document\/?$/.test(path)?url.href:`${origin}/${id}/document`;return;
    }
    case 'frontiers':
      if(path.includes('/articles/10.')&&path.endsWith('/full'))return origin+path.slice(0,-5)+'/pdf';
      return;
    case 'plos':{
      const id=url.searchParams.get('id');
      if(/^\/[a-z]+\/article$/.test(path)&&id&&/^10\.1371\/journal\.[a-z]+\.\d+$/.test(id))return `${origin}${path}/file?${new URLSearchParams({id,type:'printable'})}`;
      return;
    }
  }
}

/** Scholar wrappers encode the destination once; retain escaped signatures inside it. */
export function unwrapScholarLink(raw:string):string|undefined {
  const url=httpUrl(raw);if(!url)return;
  if(scholarHost(url.hostname)&&/^\/(scholar_url|url)$/.test(url.pathname))return httpUrl(url.searchParams.get('url')??url.searchParams.get('q')??'')?.href;
  return url.href;
}
