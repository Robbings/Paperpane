import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, Icon, IconButton, Popover, Select, Spinner, Switch } from '@/ui/components';
import { TRANSLATION_LANGUAGES, type TranslationLanguage } from '@/translation/languages';
import { PassageWindow, type PassageRect } from '../windows/PassageWindow';
import './selection-translation.css';

interface Props {
  container:HTMLElement;
  anchorPoint:()=>{x:number;y:number}|null;
  sourceRects:()=>readonly PassageRect[];
  subscribeGeometry:(listener:()=>void)=>()=>void;
  text:string;sourceLanguage:string;targetLanguage:TranslationLanguage;
  busy:boolean;paused:boolean;retrying:boolean;error?:string;saveFailed:boolean;hasOutput:boolean;children:ReactNode;
  onTranslate:(source:string,target:TranslationLanguage)=>void;onClose:()=>void;onPause:()=>void;onRetry:()=>void;onLocate:()=>void;
}
/** Translation content and commands; all passage-window behavior is shared with future explanation UI. */
export function SelectionTranslationWindow(props:Props){
  const [settings,setSettings]=useState(false),[showSource,setShowSource]=useState(false);
  const [source,setSource]=useState(props.sourceLanguage),[target,setTarget]=useState(props.targetLanguage);
  const gear=useRef<HTMLButtonElement>(null);
  useEffect(()=>{setSource(props.sourceLanguage);setTarget(props.targetLanguage);},[props.sourceLanguage,props.targetLanguage]);
  const summary=props.busy?(props.retrying?'等待恢复':'正在翻译'):props.error?'翻译需要处理':props.paused?'已暂停':'选区翻译';
  return <>
    <PassageWindow container={props.container} label="选区翻译" collapsedTitle="翻译" anchorPoint={props.anchorPoint} sourceRects={props.sourceRects} subscribeGeometry={props.subscribeGeometry}
      icon={<Icon name="translate" size={14}/>} collapsedIcon={props.busy?<Spinner size={14}/>:undefined}
      onClose={props.onClose} onLocate={props.onLocate} onCollapse={()=>setSettings(false)}
      actions={<IconButton ref={gear} icon="gear" label="选区翻译选项" size="md" shape="pill" active={settings} aria-expanded={settings} aria-haspopup="dialog" tooltip={!settings} onClick={()=>setSettings(v=>!v)}/>}>
        <div className="pp-note__text pp-selection-translation__body" dir="auto">
          {showSource&&<p className="pp-selection-translation__source" dir="auto">{props.text}</p>}
          {props.children}
          {!props.hasOutput&&!props.busy&&!props.error&&<span className="pp-selection-translation__hint">选择语言后翻译。</span>}
        </div>
        {(props.busy||props.error||props.paused||!props.hasOutput)&&<footer className="pp-selection-translation__footer">
          <span className="pp-selection-translation__hint" role="status">{props.busy&&<Spinner size={12}/>} {summary}</span>
          {props.busy&&<Button size="sm" variant="quiet" onClick={props.onPause}>暂停</Button>}
          {!props.busy&&(props.error||props.paused||!props.hasOutput)&&<Button size="sm" variant="quiet" onClick={props.onRetry}>{props.saveFailed?'重试保存':'继续翻译'}</Button>}
        </footer>}
        {props.error&&<p className="pp-selection-translation__error">{props.error}</p>}
    </PassageWindow>
    <Popover anchorRef={gear} open={settings} onClose={()=>setSettings(false)} label="选区翻译选项" placement="bottom-end" width={260} className="pp-selection-translation__options">
      <label>原文语言<Select label="原文语言" value={source} options={[{value:'auto',label:'自动检测'},...TRANSLATION_LANGUAGES]} disabled={props.busy} onChange={setSource} block size="sm"/></label>
      <label>翻译到<Select label="翻译到" value={target} options={TRANSLATION_LANGUAGES} disabled={props.busy} onChange={setTarget} block size="sm"/></label>
      <Switch label="显示原文" checked={showSource} onChange={setShowSource}/>
      <div className="pp-selection-translation__options-actions"><Button size="sm" disabled={props.busy} onClick={()=>{setSettings(false);props.onTranslate(source,target);}}>{props.hasOutput?'重新翻译':'翻译'}</Button></div>
    </Popover>
  </>;
}
