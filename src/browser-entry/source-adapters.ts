import { arxivPdfUrl } from './arxiv';
import { isPdfLink, pdfSourceUrl } from './pdf';
import { paperSource, sourcePdfUrl, unwrapScholarLink } from './source-urls';

export interface PdfCandidate {
  source:Element; url:string; floating:boolean; anchor?:Element; position?:'after'|'append'; site?:string;
}
export function resolvePaperLink(raw:string):string|undefined {
  try { const direct=pdfSourceUrl(raw);if(isPdfLink(direct))return direct;try{return arxivPdfUrl(direct);}catch{return sourcePdfUrl(direct);} }
  catch { return; }
}

function scholarResults(doc:Document):PdfCandidate[]{
  const candidates:PdfCandidate[]=[];
  for(const result of doc.querySelectorAll('.gs_r.gs_scl,.gs_r[data-cid]')){
    let url:string|undefined,anchor:Element|undefined;
    for(const link of result.querySelectorAll<HTMLAnchorElement>('.gs_ggs a[href],.gs_ggsd a[href]')){
      const target=unwrapScholarLink(link.href);if(!target)continue;
      const label=link.textContent?.trim()??'';
      if(/\[\s*PDF\s*\]/i.test(label)||isPdfLink(target)){
        url=resolvePaperLink(target)??target;anchor=link.closest('.gs_ggs,.gs_ggsd')??link;break;
      }
    }
    if(!url){
      const heading=result.querySelector<HTMLAnchorElement>('.gs_rt a[href]');
      const target=heading?unwrapScholarLink(heading.href):undefined;
      if(target){
        const explicitPdf=/\[\s*PDF\s*\]/i.test(result.querySelector('.gs_rt .gs_ct1')?.textContent??'');
        url=resolvePaperLink(target)??(explicitPdf?target:undefined);anchor=result.querySelector('.gs_fl')??heading??undefined;
      }
    }
    if(url&&anchor)candidates.push({source:result,anchor,url,floating:false,position:anchor.matches('a')?'after':'append',site:'google-scholar'});
  }
  return candidates;
}

const primarySelectors:Record<string,string>={
  acl:'a[href*=".pdf" i]',openreview:'a.citation_pdf_url,a[href*="/pdf?"]',
  cvf:'a[href*="/papers/"][href*=".pdf" i]',pmlr:'a[href*=".pdf" i]',neurips:'a[href*="-Paper"][href*=".pdf" i]',
  huggingface:'a[href*="arxiv.org/abs/"],a[href*="arxiv.org/pdf/"]',
  biorxiv:'a.article-dl-pdf-link,a[href*=".full.pdf" i]',medrxiv:'a.article-dl-pdf-link,a[href*=".full.pdf" i]',
  hal:'a[href$="/document"],a[href*="/document?"],a[href*="/file/"][href*=".pdf" i]',
  'semantic-scholar':'a[data-test-id="paper-pdf-link"],a[data-heap-id="paper-pdf-link"]',
  pmc:'a[href*="/pdf/"]',zenodo:'a[href*="/files/"][href*=".pdf"]',
  frontiers:'a[href$="/pdf"],a[href*="/pdf?"]',plos:'a[href*="/article/file"][href*="type=printable"]',
};

export function scanPaperSources(doc:Document):{exclusive:boolean;candidates:PdfCandidate[]}{
  const site=paperSource(doc.location.href);
  if(site?.id==='google-scholar')return{exclusive:true,candidates:scholarResults(doc)};
  if(!site)return{exclusive:false,candidates:[]};
  const primaryLinks=doc.querySelectorAll<HTMLAnchorElement>(primarySelectors[site.id]??'a[type="application/pdf"]');
  const meta=doc.querySelector<HTMLMetaElement>('meta[name="citation_pdf_url"]');
  let url:string|undefined;
  const metadata=meta?.content.trim();
  if(metadata&&!metadata.startsWith('#')){
    try{const candidate=pdfSourceUrl(new URL(metadata,doc.baseURI).href);if(candidate!==pdfSourceUrl(doc.location.href))url=candidate;}catch{/* Fall through to explicit links or known routes. */}
  }
  const known=sourcePdfUrl(doc.location.href);
  if(!url)for(const primary of primaryLinks){try{
    const target=resolvePaperLink(primary.href)??pdfSourceUrl(primary.href);
    const expected=known?new URL(known):undefined,actual=new URL(target);
    // Keep tokens on the actual download link, while rejecting links to another paper.
    if(!expected||(expected.origin===actual.origin&&expected.pathname===actual.pathname&&Array.from(expected.searchParams).every(([key,value])=>actual.searchParams.get(key)===value))){url=target;break;}
  }catch{/* Invalid download target. */}}
  url??=known;
  if(!url)return{exclusive:false,candidates:[]};
  const heading=doc.querySelector('h1,#papertitle,.citation_title');
  const matchingLink=Array.from(doc.querySelectorAll<HTMLAnchorElement>('a[href]')).find(link=>{
    try{return (resolvePaperLink(link.href)??pdfSourceUrl(link.href))===url;}catch{return false;}
  });
  const anchor=matchingLink??heading;
  return{exclusive:false,candidates:[{source:matchingLink??meta??heading??doc.documentElement,anchor:anchor??undefined,url,floating:!anchor,site:site.id}]};
}
