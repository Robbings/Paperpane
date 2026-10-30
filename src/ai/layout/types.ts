import type { DocumentAnchor, DocumentRef } from '@/contracts/document';
import { DEFAULT_LAYOUT_ENGINE,layoutVersion } from './engines';
export const LAYOUT_VERSION=layoutVersion(DEFAULT_LAYOUT_ENGINE);
export const LAYOUT_THRESHOLD=.5;
export type ElementKind='picture'|'table'|'formula';
export type Box=[number,number,number,number];
export interface LayoutRegion { label:string; score:number; box:Box }
export interface PageLayout extends DocumentRef { pageIndex:number; width:number; height:number; version:string; regions:LayoutRegion[] }
export interface PaperElement { id:string; kind:ElementKind; region:LayoutRegion; anchor:DocumentAnchor; page:PageLayout; caption?:LayoutRegion; captionAnchor?:DocumentAnchor }
export interface CopyAttempt { id:string; state:'running'|'complete'|'failed'|'interrupted'; raw:string; at:string; modelId:string; promptVersion?:string; batchId?:string; result?:string|string[][]; usage?:import('../types').Usage; error?:string }
export interface ElementCopyRecord { attempts:CopyAttempt[]; value?:string|string[][] }
