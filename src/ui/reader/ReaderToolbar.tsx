import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type RefObject } from 'react';
import { GlassSurface, Icon, IconButton, Menu, Tooltip, type MenuEntry } from '@/ui/components';
import { ReadingOptions } from './ReadingOptions';
import type { ReaderSettingsProps } from './QuickSettings';
import type { DocumentHeaderView, DockPlacement, Rotation } from './types';

/** Progressively hide secondary controls as the paper pane narrows; keep them in More. */
export type ToolbarDensity = 'full' | 'compact' | 'tight' | 'mini' | 'single' | 'hidden';

export type ToolbarTool = 'open' | 'region' | 'export' | 'settings' | 'fit-width';

interface ReaderToolbarProps {
  header: DocumentHeaderView;
  /** 0-based. */
  pageIndex: number;
  zoomPercent: number;
  density: ToolbarDensity;
  showTitle: boolean;
  sidebarOpen: boolean;
  placement: DockPlacement;
  /** False when the window is too narrow to dock on the right. */
  canDockRight: boolean;
  autoHighlight: boolean;
  onToggleSidebar: () => void;
  /** In the library? Shown by the bookmark next to the title; omit to hide it. */
  saved?: boolean;
  saveRef?: RefObject<HTMLButtonElement | null>;
  saveOpen?: boolean;
  onSave?: () => void;
  onToggleTitle: () => void;
  onPageSubmit: (pageIndex: number) => void;
  onZoom: (direction: 'in' | 'out') => void;
  /** A typed percentage, already limited to 25–400. */
  onZoomTo: (percent: number) => void;
  onTogglePlacement: () => void;
  /** Lets the research area fill the window; dragging its edge back or double-clicking it restores. */
  onMaximizeResearch?: () => void;
  onToggleAutoHighlight: () => void;
  findOpen: boolean;
  /** Opens or closes the find bar. */
  onFind: () => void;
  rotation: Rotation;
  onRotateTo: (angle: Rotation) => void;
  readingSettings?: ReaderSettingsProps;
  /** Quick settings: the button's popover. Without it the button reports onTool('settings'). */
  settingsRef?: RefObject<HTMLButtonElement | null>;
  settingsOpen?: boolean;
  onSettings?: () => void;
  /** The 译文 button; omit translationOpen to hide it. */
  translationOpen?: boolean;
  onToggleTranslation?: () => void;
  /** Return to the library via More, without occupying the narrow toolbar. */
  onBack?: () => void;
  onOriginalPdf?: () => void;
  /** What 导出 offers; without it the button reports onTool('export'). */
  exports?: readonly ExportOption[];
  onExport?: (id: string) => void;
  onTool: (tool: ToolbarTool) => void;
}

export interface ExportOption {
  id: string;
  label: string;
  disabled?: boolean;
}

const FIND_SHORTCUT = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘F' : 'F3';

type OpenMenu = { kind: 'context' | 'more' | 'export'; x: number; y: number; align: 'start' | 'end' } | null;

export function ReaderToolbar(props: ReaderToolbarProps) {
  const {header,pageIndex,zoomPercent,density,showTitle,onPageSubmit,onZoom,onZoomTo}=props;
  const [pageDraft,setPageDraft]=useState(String(pageIndex+1));
  const [zoomDraft,setZoomDraft]=useState<string|null>(null);
  const cancelZoom=useRef(false);
  useEffect(()=>setZoomDraft(current=>current===null?null:String(zoomPercent)),[zoomPercent]);
  useEffect(()=>setPageDraft(String(pageIndex+1)),[pageIndex]);
  const [menu,setMenu]=useState<OpenMenu>(null),[viewOpen,setViewOpen]=useState(false),[viewFromMore,setViewFromMore]=useState(false);
  const moreRef=useRef<HTMLButtonElement>(null),viewRef=useRef<HTMLButtonElement>(null);
  const spacious=density==='full'||density==='compact';
  const tools=spacious||density==='tight';
  const pages=tools||density==='mini';
  const titleVisible=showTitle&&density==='full';
  useLayoutEffect(()=>{if(!spacious&&props.settingsOpen&&props.settingsRef)props.settingsRef.current=moreRef.current;},[spacious,props.settingsOpen,props.settingsRef]);
  useEffect(()=>{setMenu(null);setViewOpen(false);},[density]);
  const atMore=(kind:NonNullable<OpenMenu>['kind']='more')=>{
    const box=moreRef.current?.getBoundingClientRect();if(box)setMenu({kind,x:box.right,y:box.bottom+6,align:'end'});
  };
  const showSettings=()=>{if(!spacious&&props.settingsRef)props.settingsRef.current=moreRef.current;if(props.onSettings)props.onSettings();else props.onTool('settings');};
  const showView=()=>{setViewFromMore(true);setViewOpen(true);};
  const entries:MenuEntry[]=[
    ...(!tools?[{id:'sidebar',label:props.sidebarOpen?'隐藏侧栏':'显示侧栏',icon:'sidebar'} as MenuEntry]:[]),
    ...(!spacious?[{id:'region',label:'框选提问',icon:'region'},{id:'zoom-in',label:'放大',icon:'plus'},{id:'zoom-out',label:'缩小',icon:'minus'}] as MenuEntry[]:[]),
    ...(!tools&&props.onToggleTranslation?[{id:'translation',label:props.translationOpen?'关闭译文':'译文',icon:'translate'} as MenuEntry]:[]),
    ...(!tools?[{id:'marker',label:'自动高亮',icon:'marker',checked:props.autoHighlight},{id:'view',label:'页面显示',icon:'pageDisplay'}] as MenuEntry[]:[]),
    ...(!spacious?[{id:'settings',label:'阅读设置',icon:'settings'} as MenuEntry]:[]),
    ...(!spacious&&props.onSave?[{id:'save',label:props.saved?'编辑收藏':'收藏到文献库',icon:'bookmark'} as MenuEntry]:[]),
    ...(!spacious?[{kind:'separator',id:'sep-files'} as MenuEntry]:[]),
    {id:'search',label:props.findOpen?'关闭查找':'查找',icon:'search',shortcut:FIND_SHORTCUT},
    {id:'open',label:'打开论文',icon:'file'},
    ...(props.onBack?[{id:'back',label:'返回文献库',icon:'chevronLeft'} as MenuEntry]:[]),
    ...(props.onOriginalPdf?[{id:'original-pdf',label:'返回原 PDF',icon:'openExternal'} as MenuEntry]:[]),
    {id:'export',label:'导出',icon:'export'},
    {kind:'separator',id:'sep-layout'},
    {id:'placement',label:props.placement==='right'?'研究区移到下方':'研究区移到右侧',icon:props.placement==='right'?'dockBottom':'dockRight',disabled:props.placement!=='right'&&!props.canDockRight},
    ...(props.onMaximizeResearch?[{id:'maximize',label:'研究区铺满窗口',icon:'columns'} as MenuEntry]:[]),
    {id:'title',label:'显示论文标题',checked:showTitle},
  ];
  const select=(id:string)=>{
    if(id==='title')props.onToggleTitle();
    else if(id==='region')props.onTool('region');
    else if(id==='sidebar')props.onToggleSidebar();
    else if(id==='search')props.onFind();
    else if(id==='zoom-in')onZoom('in');
    else if(id==='zoom-out')onZoom('out');
    else if(id==='translation')props.onToggleTranslation?.();
    else if(id==='marker')props.onToggleAutoHighlight();
    else if(id==='placement')props.onTogglePlacement();
    else if(id==='maximize')props.onMaximizeResearch?.();
    else if(id==='view')showView();
    else if(id==='settings')showSettings();
    else if(id==='back')props.onBack?.();
    else if(id==='original-pdf')props.onOriginalPdf?.();
    else if(id==='open')props.onTool('open');
    else if(id==='save'){if(props.saveRef)props.saveRef.current=moreRef.current;props.onSave?.();}
    else if(id==='export'){if(props.exports)window.setTimeout(()=>atMore('export'),0);else props.onTool('export');}
  };
  const submitPage=(event:FormEvent)=>{event.preventDefault();const n=Number(pageDraft);if(Number.isInteger(n)&&n>=1&&n<=header.pageCount)onPageSubmit(n-1);else setPageDraft(String(pageIndex+1));};
  const submitZoom=()=>{const n=Number.parseFloat(zoomDraft??'');if(!cancelZoom.current&&Number.isFinite(n))onZoomTo(Math.round(Math.min(400,Math.max(25,n))));cancelZoom.current=false;setZoomDraft(null);};
  if(density==='hidden')return null;
  return <GlassSurface as="header" tone="bar" radius="pill" className="pp-toolbar" data-density={density} data-title={titleVisible?'shown':'hidden'} onContextMenu={event=>{event.preventDefault();setMenu({kind:'context',x:event.clientX,y:event.clientY,align:'start'});}}>
    {tools&&<IconButton icon={props.sidebarOpen?'sidebarShown':'sidebar'} label={props.sidebarOpen?'隐藏侧栏':'显示侧栏'} shape="pill" aria-pressed={props.sidebarOpen} onClick={props.onToggleSidebar}/>}
    {titleVisible?<Tooltip label={header.title} className="pp-toolbar__title-wrap"><span className="pp-toolbar__title">{header.title}</span></Tooltip>:<span className="pp-visually-hidden">{header.title}</span>}
    {spacious&&props.onSave&&<IconButton ref={props.saveRef} icon={props.saved?'bookmarkFilled':'bookmark'} label={props.saved?'已在文献库，点按编辑':'收藏到文献库'} shape="pill" onClick={props.onSave}/>}
    {pages&&<div className="pp-toolbar__group">
      <form className="pp-toolbar__pill pp-toolbar__page" onSubmit={submitPage}>
        <input aria-label="页码" className="pp-toolbar__page-input" inputMode="numeric" value={pageDraft} onChange={e=>setPageDraft(e.target.value.replace(/\D/g,''))} onBlur={()=>setPageDraft(String(pageIndex+1))}/><span className="pp-toolbar__page-total">/ {header.pageCount}</span>
      </form>
      {spacious&&<div className="pp-toolbar__pill pp-toolbar__zoom">
        <button aria-label="缩小" onClick={()=>onZoom('out')}><Icon name="minus" size={15}/></button>
        <input className="pp-toolbar__zoom-input" aria-label="缩放比例（%）" inputMode="numeric" value={zoomDraft??`${zoomPercent}%`} onFocus={e=>{cancelZoom.current=false;setZoomDraft(String(zoomPercent));const input=e.currentTarget;window.setTimeout(()=>input.select(),0);}} onChange={e=>setZoomDraft(e.target.value.replace(/[^\d.]/g,''))} onBlur={submitZoom} onKeyDown={e=>{if(e.key==='Escape'){cancelZoom.current=true;e.currentTarget.blur();}if(e.key==='Enter')e.currentTarget.blur();}}/>
        <button aria-label="放大" onClick={()=>onZoom('in')}><Icon name="plus" size={15}/></button>
      </div>}
    </div>}
    {spacious&&<IconButton icon="region" label="框选提问" shape="pill" onClick={()=>props.onTool('region')}/>}
    {tools&&props.onToggleTranslation&&<IconButton icon="translate" label={props.translationOpen?'关闭译文':'译文'} shape="pill" active={props.translationOpen} onClick={props.onToggleTranslation}/>}
    {tools&&<IconButton icon="marker" label="自动高亮" shape="pill" active={props.autoHighlight} onClick={props.onToggleAutoHighlight}/>}
    {tools&&<IconButton ref={viewRef} icon="pageDisplay" label="页面显示" shape="pill" active={viewOpen} aria-haspopup="dialog" aria-expanded={viewOpen} tooltip={!viewOpen} onClick={()=>{setViewFromMore(false);setViewOpen(v=>!v);}}/>}
    {spacious&&<IconButton ref={props.settingsRef} icon="settings" label="阅读设置" shape="pill" active={props.settingsOpen} onClick={props.onSettings??(()=>props.onTool('settings'))}/>}
    <IconButton ref={moreRef} icon="more" label="更多工具" shape="pill" aria-haspopup="menu" aria-expanded={menu?.kind==='more'} active={menu?.kind==='more'} tooltip={!menu} onClick={()=>menu?setMenu(null):atMore()}/>
    <ReadingOptions anchorRef={viewFromMore?moreRef:viewRef} open={viewOpen} onClose={()=>setViewOpen(false)} settings={props.readingSettings} rotation={props.rotation} onRotate={props.onRotateTo} onFitWidth={()=>props.onTool('fit-width')}/>
    {menu&&<Menu label={menu.kind==='export'?'导出':'更多工具'} entries={menu.kind==='export'?(props.exports??[]).map(o=>({id:o.id,label:o.label,disabled:o.disabled})):entries} anchor={{x:menu.x,y:menu.y}} align={menu.align} triggerRef={moreRef} onSelect={menu.kind==='export'?(id)=>props.onExport?.(id):select} onClose={()=>setMenu(null)}/>}
  </GlassSurface>;
}
