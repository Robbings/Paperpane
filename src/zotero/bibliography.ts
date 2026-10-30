import type { ZoteroData } from './types';
export function zoteroBibliography(data:ZoteroData){return {
  title:data.title??data.filename??'未命名论文',
  authors:(data.creators??[]).filter(c=>c.creatorType==='author').map(c=>c.name??[c.firstName,c.lastName].filter(Boolean).join(' ')),
  year:data.date?.match(/\b\d{4}\b/)?.[0]?Number(data.date.match(/\b\d{4}\b/)![0]):undefined,
  venue:data.publicationTitle??String(data.proceedingsTitle??''),doi:data.DOI??'',abstract:data.abstractNote??'',
};}
