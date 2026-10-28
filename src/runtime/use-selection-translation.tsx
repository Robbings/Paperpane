import { useEffect, useRef, useState } from 'react';
import type { DocumentAnchor } from '@/contracts/document';
import type { ExtractedPaper } from '@/contracts/translation';
import type { Preferences } from '@/ui/settings/types';
import { SelectionTranslationWindow } from '@/ui/reader/translation/SelectionTranslationWindow';
import { TranslationSession } from '@/translation/session';
import type { TranslationLanguage } from '@/translation/languages';
import { TranslationMarkdown } from './translation-markdown';
import type { ReaderController } from './reader-controller';

interface Card {
  key: string; text: string; anchor: DocumentAnchor;
  session: TranslationSession; sourceLanguage: string; targetLanguage: TranslationLanguage;
}
/** Selection translation has its own session, storage pointer, cancellation and window. */
export function useSelectionTranslation(owner: ReaderController | undefined, preferences: Preferences) {
  const [card,setCard]=useState<Card>(),[,redraw]=useState(0);
  const current=useRef<Card | undefined>(undefined), generation=useRef(0), defaults=useRef(preferences);
  defaults.current=preferences;
  const document=owner?.reader.getSnapshot().data.document;
  useEffect(()=>{
    if(!owner)return;
    let alive=true;
    owner.translateSelection=(anchor,selectedText)=>{void (async()=>{
      if(owner.isChangingDocument)return;
      const text=(selectedText ?? anchor.pages.map(p=>p.quote?.exact??'').join(' ')).trim();
      if(!text){owner.report('没有取得选中文字，请重新划选。');return;}
      const ticket=++generation.current;
      const old=current.current;
      if(old&&!await owner.releaseTranslation(old.session)){owner.report('选区译文尚未保存，请先在悬浮窗中重试保存。');return;}
      if(!alive||ticket!==generation.current||owner.isChangingDocument||owner.reader.getSnapshot().data.document?.documentId!==anchor.documentId||owner.reader.getSnapshot().data.document?.fileVersion!==anchor.fileVersion)return;
      current.current=undefined;setCard(undefined);
      const bytes=new TextEncoder().encode(JSON.stringify({text,pages:anchor.pages.map(p=>({pageIndex:p.pageIndex,rects:p.rects.map(r=>({x:Math.round(r.x*10)/10,y:Math.round(r.y*10)/10,width:Math.round(r.width*10)/10,height:Math.round(r.height*10)/10}))}))}));
      const key=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
      if(!alive||ticket!==generation.current||owner.isChangingDocument||owner.reader.getSnapshot().data.document?.documentId!==anchor.documentId||owner.reader.getSnapshot().data.document?.fileVersion!==anchor.fileVersion)return;
      const sourceLanguage='auto',targetLanguage=defaults.current.translationLanguage;
      const paper:ExtractedPaper={documentId:anchor.documentId,fileVersion:anchor.fileVersion,version:`selection-v1:${key}`,pageCount:owner.reader.getSnapshot().data.pageCount,warnings:[],sentences:[{id:'selection-text',paragraphId:'selection-text',source:text,kind:'text',anchor,approximate:false,warnings:[]}]};
      const session=new TranslationSession({documentId:anchor.documentId,fileVersion:anchor.fileVersion},async()=>paper,()=>{if(alive&&current.current?.session===session)redraw(n=>n+1);},{key,text,anchor,sourceLanguage});
      owner.trackTranslation(session);
      const next:Card={key,text,anchor,session,sourceLanguage,targetLanguage};
      current.current=next;setCard(next);owner.reader.dismissMenu();window.getSelection()?.removeAllRanges();
      await session.load();
      if(!alive||current.current!==next)return;
      // Reuse an exact selection's saved result. A cancelled partial task resumes its own UUID.
      const compatible=session.run?.profile.language===targetLanguage&&(session.run.profile.sourceLanguage??'auto')===sourceLanguage;
      if(compatible)await session.resume(targetLanguage);else await session.start(targetLanguage);
    })().catch(()=>{if(alive)owner.report('无法打开选区翻译，请重试。');});};
    return()=>{alive=false;++generation.current;owner.translateSelection=undefined;const old=current.current;current.current=undefined;setCard(undefined);if(old)void owner.releaseTranslation(old.session);};
  },[owner,document?.documentId,document?.fileVersion]);
  if(!card)return null;
  const session=card.session, output=session.output('selection-text');
  const busy=session.loading||session.run?.phase==='running'||session.run?.phase==='pausing';
  const close=async()=>{
    if(!await owner?.releaseTranslation(session)){owner?.report('译文还没有保存，已保留窗口，请先重试保存。');return;}
    if(current.current!==card)return;
    ++generation.current;current.current=undefined;setCard(undefined);
  };
  const translate=async(sourceLanguage:string,targetLanguage:TranslationLanguage)=>{
    if(busy)return;
    if(session.saveFailed){await session.retrySave();if(session.saveFailed)return;}
    if(current.current!==card)return;
    session.selection!.sourceLanguage=sourceLanguage;
    const next={...card,sourceLanguage,targetLanguage};current.current=next;setCard(next);
    await session.start(targetLanguage,undefined,false,undefined,true);
  };
  const container=owner?.reader.translationScrollElement();
  if(!container)return null;
  return <SelectionTranslationWindow key={card.key} text={card.text} container={container}
    anchorPoint={()=>{const first=owner?.rects(card.anchor)[0];return first?{x:first.left,y:first.top+first.height+12}:null;}}
    sourceLanguage={card.sourceLanguage} targetLanguage={card.targetLanguage} busy={busy}
    sourceRects={()=>owner?.rects(card.anchor)??[]}
    subscribeGeometry={listener=>owner?.reader.subscribeProjection('viewport',listener)??(()=>{})}
    error={session.error??session.run?.error} hasOutput={!!output.text}
    paused={session.run?.phase==='paused'||session.run?.phase==='interrupted'} retrying={!!session.retrying.size} saveFailed={session.saveFailed}
    onTranslate={(source,target)=>void translate(source,target)} onClose={()=>void close()}
    onPause={()=>void session.pause()} onRetry={()=>void(session.saveFailed?session.retrySave():session.resume(card.targetLanguage))}
    onLocate={()=>void owner?.reader.locate(card.anchor)}>
    {output.text&&<TranslationMarkdown block text={output.text} inferredMath={output.inferredMath}/>}
  </SelectionTranslationWindow>;
}
