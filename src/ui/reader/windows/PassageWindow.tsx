import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useUiScale } from '@/ui/use-ui-scale';
import { createPortal } from 'react-dom';
import { IconButton } from '@/ui/components';
import type { NoteLayout } from '../types';
import { useFloatingCanvas } from './floating-canvas';
import '../notes/notes.css';
import './passage-window.css';

export interface PassageRect { left:number; top:number; width:number; height:number }
interface Point { x:number; y:number }
/** Use the same passage-relative layout fields as comment notes. */
export type PassageWindowLayout = Pick<NoteLayout,'dx'|'dy'|'width'|'height'|'zoom'>;
interface Props {
  layout?:PassageWindowLayout;
  zoomPercent?:number;
  onLayoutChange?:(layout:PassageWindowLayout)=>void;
  onLayoutCommit?:()=>void;
  clampOnResize?:boolean;
  initialOffset?:{x:number;y:number};
  stackOrder?:number;
  onActivate?:()=>void;
  collapsed?:boolean;
  onCollapsedChange?:(collapsed:boolean)=>void;
  /** Optional starting height for content that contains its own scroll area. */
  initialHeight?:number;
  container:HTMLElement;
  label:string;
  icon:ReactNode;
  collapsedIcon?:ReactNode;
  collapsedTitle:string;
  /** Current viewport position beside the passage; null while its page is not mounted. */
  anchorPoint:()=>Point|null;
  sourceRects:()=>readonly PassageRect[];
  subscribeGeometry:(listener:()=>void)=>()=>void;
  actions?:ReactNode;
  children:ReactNode;
  onClose:()=>void;
  onLocate:()=>void;
  onCollapse?:()=>void;
}
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(n,Math.max(min,max)));
const nearest=(r:PassageRect,x:number,y:number)=>({x:clamp(x,r.left,r.left+r.width),y:clamp(y,r.top,r.top+r.height)});
const same=(a:Point,b:Point)=>a.x===b.x&&a.y===b.y;

/** Shared passage window for translation/explanation. Uses comment-note visuals and drag/pan behavior. */
export function PassageWindow(props:Props){
  const {container}=props;
  const uiScale=useUiScale();
  const [dragging,setDragging]=useState(false);
  const [internalCollapsed,setInternalCollapsed]=useState(false),[hovered,setHovered]=useState(false),[focused,setFocused]=useState(false);
  const collapsed=props.collapsed??internalCollapsed;
  const setCollapsed=(value:boolean)=>{setInternalCollapsed(value);props.onCollapsedChange?.(value);};
  const [anchor,setAnchor]=useState<Point>({x:container.scrollLeft+24,y:container.scrollTop+80});
  const [localOffset,setLocalOffset]=useState<Point>({x:0,y:0});
  const [localSize,setLocalSize]=useState<{width:number;height?:number}>({width:360,height:props.initialHeight});
  const layoutScale=(props.zoomPercent??100)/(props.layout?.zoom??props.zoomPercent??100);
  const offset=props.layout?{x:props.layout.dx*layoutScale,y:props.layout.dy*layoutScale}:localOffset;
  const size=props.layout??localSize;
  const [bounds,setBounds]=useState({width:container.clientWidth,height:container.clientHeight});
  const [,tick]=useState(0);
  const panel=useRef<HTMLElement>(null),initialized=useRef(false),frame=useRef(0);
  const gesture=useRef<{kind:'move'|'resize';size:{width:number;height:number};id:number;target:HTMLElement;x:number;y:number;px:number;py:number;scrollX:number;scrollY:number;inset:number;start:Point;moved:boolean}|null>(null);
  const lastViewport=useRef({width:container.clientWidth,height:container.clientHeight});
  const latest=useRef({props,anchor,offset,size,bounds,collapsed});latest.current={props,anchor,offset,size,bounds,collapsed};
  const changeLayout=(nextOffset:Point,nextSize=latest.current.size)=>{
    setLocalOffset(nextOffset);setLocalSize(nextSize);
    latest.current.offset=nextOffset;latest.current.size=nextSize;
    latest.current.props.onLayoutChange?.({dx:nextOffset.x,dy:nextOffset.y,width:nextSize.width,height:nextSize.height??props.initialHeight??180,zoom:latest.current.props.zoomPercent??100});
  };
  const width=collapsed?undefined:Math.min(size.width*uiScale,Math.max(140,container.clientWidth-24));
  const logicalLeft=anchor.x+offset.x,top=anchor.y+offset.y;
  const canvas=useFloatingCanvas(container,initialized.current?logicalLeft:null);
  const left=logicalLeft+canvas.inset,actualWidth=panel.current?.offsetWidth??width??130*uiScale;
  const active=hovered||focused;

  useLayoutEffect(()=>{
    const measure=()=>{
      const current=latest.current,box=container.getBoundingClientRect(),point=current.props.anchorPoint();
      const resized=lastViewport.current.width!==container.clientWidth||lastViewport.current.height!==container.clientHeight;
      lastViewport.current={width:container.clientWidth,height:container.clientHeight};
      if(point){
        const next={x:point.x-box.left-container.clientLeft+container.scrollLeft-canvas.readInset(),y:point.y-box.top-container.clientTop+container.scrollTop};
        setAnchor(old=>same(old,next)?old:next);
        if(!initialized.current){
          initialized.current=true;
          if(!current.props.layout){
            const w=Math.min(360*uiScale,container.clientWidth-24);
            changeLayout({x:clamp(next.x+(props.initialOffset?.x??0),container.scrollLeft-canvas.readInset()+12,container.scrollLeft-canvas.readInset()+container.clientWidth-w-12)-next.x,y:clamp(next.y+(props.initialOffset?.y??0),container.scrollTop+64,container.scrollTop+container.clientHeight-(props.initialHeight===undefined?180:props.initialHeight*uiScale+12))-next.y});
          }
        }else if(current.props.clampOnResize&&resized&&!gesture.current){
          const w=Math.min(panel.current?.offsetWidth??360,container.clientWidth-24),h=Math.min(panel.current?.offsetHeight??460,container.clientHeight-48);
          changeLayout({x:clamp(next.x+current.offset.x,container.scrollLeft-canvas.readInset()+12,container.scrollLeft-canvas.readInset()+container.clientWidth-w-12)-next.x,y:clamp(next.y+current.offset.y,container.scrollTop+12,container.scrollTop+container.clientHeight-h-12)-next.y});
        }
      }
      // A restored card may already be under a stationary pointer: there is no
      // fresh pointerenter event after reload. Recover hover along with geometry.
      setHovered(panel.current?.matches(':hover')??false);
      // Match comment notes: reserve a bounded margin beside the pages, never derive it from scrollWidth.
      const pages=[...container.querySelectorAll<HTMLElement>('.page, [data-page-index]')];
      const right=Math.max(container.clientWidth,...pages.map(p=>p.getBoundingClientRect().right-box.left+container.scrollLeft-canvas.readInset()));
      const bottom=Math.max(container.clientHeight,...pages.map(p=>p.getBoundingClientRect().bottom-box.top+container.scrollTop));
      const next={width:right+Math.max(520,container.clientWidth),height:bottom+300};
      setBounds(old=>old.width===next.width&&old.height===next.height?old:next);tick(n=>n+1);
    };
    measure();const stop=props.subscribeGeometry(measure),observer=new ResizeObserver(measure);
    observer.observe(container);if(container.firstElementChild)observer.observe(container.firstElementChild);
    const redraw=()=>tick(n=>n+1);
    container.addEventListener('scroll',redraw,{passive:true});window.addEventListener('resize',measure);
    return()=>{stop();observer.disconnect();container.removeEventListener('scroll',redraw);window.removeEventListener('resize',measure);};
  },[container,props.subscribeGeometry,uiScale,canvas.inset]);

  // Read the card after React has applied movement/collapse and streamed content has resized it.
  useLayoutEffect(()=>{
    setHovered(panel.current?.matches(':hover')??false);
    if(active)tick(n=>n+1);
  },[active,anchor.x,anchor.y,offset.x,offset.y,collapsed,initialized.current]);
  useEffect(()=>{
    const observer=new ResizeObserver(()=>tick(n=>n+1));if(panel.current)observer.observe(panel.current);
    return()=>observer.disconnect();
  },[]);

  const finish=(reveal=false)=>{
    const g=gesture.current;gesture.current=null;if(g)setDragging(false);cancelAnimationFrame(frame.current);
    if(g?.target.hasPointerCapture(g.id))g.target.releasePointerCapture(g.id);
    if(g?.moved)latest.current.props.onLayoutCommit?.();
    if(reveal&&g?.moved&&g.kind==='move'){
      const s=latest.current,p=panel.current;
      const l=s.anchor.x+s.offset.x+canvas.readInset(),r=l+(p?.offsetWidth??360);
      if(r>container.scrollLeft+container.clientWidth-16)container.scrollLeft=r-container.clientWidth+16;
      else if(l<container.scrollLeft+16)container.scrollLeft=Math.max(0,l-16);
    }
    setHovered(panel.current?.matches(':hover')??false);
  };
  useEffect(()=>{
    const stop=()=>finish();
    const up=(event:PointerEvent)=>{if(event.pointerId===gesture.current?.id)finish(event.type==='pointerup');};
    window.addEventListener('pointerup',up);window.addEventListener('pointercancel',up);window.addEventListener('blur',stop);
    return()=>{cancelAnimationFrame(frame.current);gesture.current=null;window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',up);window.removeEventListener('blur',stop);};
  },[container]);
  const update=()=>{
    const g=gesture.current;if(!g)return;
    const s=latest.current,dx=g.px-g.x+container.scrollLeft-g.scrollX-(canvas.readInset()-g.inset),dy=g.py-g.y+container.scrollTop-g.scrollY;
    if(Math.abs(dx)+Math.abs(dy)>3)g.moved=true;
    if(!g.moved)return;
    if(g.kind==='resize'){
      changeLayout(s.offset,{width:clamp((g.size.width+dx)/uiScale,220,Math.min(520,(container.clientWidth-24)/uiScale)),height:clamp((g.size.height+dy)/uiScale,140,Math.min(520,(container.clientHeight-48)/uiScale))});
      return;
    }
    changeLayout({x:clamp(g.start.x+dx,-Math.max(520,container.clientWidth),s.bounds.width-(panel.current?.offsetWidth??360))-s.anchor.x,y:clamp(g.start.y+dy,0,s.bounds.height-(panel.current?.offsetHeight??140))-s.anchor.y});
  };
  const pan=()=>{
    const g=gesture.current;if(!g)return;
    if(g.kind==='move'&&g.moved){
      const box=container.getBoundingClientRect();
      const speed=(p:number,start:number,end:number)=>p>end-40?Math.min(18,(p-end+40)/4):p<start+40?-Math.min(18,(start+40-p)/4):0;
      container.scrollLeft+=speed(g.px,box.left,box.right);container.scrollTop+=speed(g.py,box.top,box.bottom);update();
    }
    frame.current=requestAnimationFrame(pan);
  };
  const begin=(kind:'move'|'resize')=>(event:ReactPointerEvent<HTMLElement>)=>{
      if(event.button!==0||!event.isPrimary||(event.target as Element).closest('button'))return;
      event.preventDefault();event.stopPropagation();finish();event.currentTarget.setPointerCapture(event.pointerId);
      gesture.current={kind,size:{width:panel.current?.offsetWidth??360,height:panel.current?.offsetHeight??140},id:event.pointerId,target:event.currentTarget,x:event.clientX,y:event.clientY,px:event.clientX,py:event.clientY,scrollX:container.scrollLeft,scrollY:container.scrollTop,inset:canvas.readInset(),start:{x:logicalLeft,y:top},moved:false};
      setDragging(true);if(kind==='move')frame.current=requestAnimationFrame(pan);
  };
  const drag={
    onPointerDown:begin('move'),
    onPointerMove:(event:ReactPointerEvent<HTMLElement>)=>{const g=gesture.current;if(!g||g.id!==event.pointerId)return;if(!(event.buttons&1)){finish();return;}g.px=event.clientX;g.py=event.clientY;update();},
    onPointerUp:()=>finish(true),onPointerCancel:()=>finish(),onLostPointerCapture:()=>{if(gesture.current)finish();},
  };
  const box=container.getBoundingClientRect(),note=panel.current?.getBoundingClientRect();
  const rects=active?props.sourceRects().flatMap(r=>{
    const left=Math.max(r.left,box.left),top=Math.max(r.top,box.top),right=Math.min(r.left+r.width,box.right),bottom=Math.min(r.top+r.height,box.bottom);
    return right>left&&bottom>top?[{left,top,width:right-left,height:bottom-top}]:[];
  }):[];
  let line:{x1:number;y1:number;x2:number;y2:number}|undefined;
  if(note&&rects.length){
    const cx=note.left+note.width/2,cy=note.top+note.height/2;
    const target=rects.map(r=>nearest(r,cx,cy)).reduce((a,b)=>Math.hypot(a.x-cx,a.y-cy)<Math.hypot(b.x-cx,b.y-cy)?a:b);
    const start=nearest(note,target.x,target.y);line={x1:start.x,y1:start.y,x2:target.x,y2:target.y};
  }
  return <>
    {createPortal(<div className="pp-notes-layer pp-passage-window-layer" data-pp-overlay="" style={{zIndex:props.stackOrder??3}}>
      {dragging&&<div aria-hidden="true" style={{position:'absolute',width:bounds.width+canvas.inset,height:bounds.height,pointerEvents:'none'}}/>}
      {line&&<svg className="pp-passage-window__connector" aria-hidden="true" width={Math.max(container.clientWidth,left+actualWidth)} height={Math.max(container.clientHeight,top+(panel.current?.offsetHeight??140))}>
        <g transform={`translate(${container.scrollLeft-box.left-container.clientLeft} ${container.scrollTop-box.top-container.clientTop})`}>
          {rects.map((r,i)=><rect key={i} x={r.left-2} y={r.top-1} width={r.width+4} height={r.height+2} rx={3} className="pp-note-connector__mark"/>)}
          <line {...line} className="pp-note-connector__line"/><circle cx={line.x2} cy={line.y2} r={2.5} className="pp-note-connector__end"/>
        </g>
      </svg>}
      <section ref={panel} className={`pp-glass pp-note pp-passage-window${collapsed?' pp-note--pill':''}`} data-tone="float" data-collapsed={collapsed} aria-label={props.label}
        style={{left,top,width,maxWidth:collapsed?Math.min(260*uiScale,Math.max(100,container.clientWidth-24)):undefined,height:collapsed?34*uiScale:size.height===undefined?undefined:size.height*uiScale,maxHeight:Math.max(140,container.clientHeight-48),visibility:initialized.current?undefined:'hidden'}}
        onPointerDownCapture={props.onActivate}
        onPointerEnter={()=>setHovered(true)} onPointerLeave={()=>setHovered(false)}
        onFocusCapture={()=>setFocused(true)}
        onBlurCapture={event=>{if(!event.currentTarget.contains(event.relatedTarget))setFocused(false);}}>
        {collapsed?<div className="pp-note__pill" {...drag}>{props.collapsedIcon??props.icon}<span className="pp-note__pill-title">{props.collapsedTitle}</span>
          <IconButton icon="openExternal" label={`展开${props.label}`} size="md" shape="pill" onClick={()=>setCollapsed(false)}/>
          <IconButton icon="close" label={`关闭${props.label}`} size="md" shape="pill" onClick={props.onClose}/>
        </div>:<><header className="pp-note__head" {...drag}>{props.icon}<span className="pp-note__quote" aria-hidden="true"/><IconButton icon="region" label="定位到原文" size="md" shape="pill" onClick={props.onLocate}/>{props.actions}
          <IconButton icon="minus" label={`最小化${props.label}`} size="md" shape="pill" onClick={()=>{props.onCollapse?.();setCollapsed(true);}}/>
          <IconButton icon="close" label={`关闭${props.label}`} size="md" shape="pill" onClick={props.onClose}/>
        </header>{props.children}<span className="pp-note__resize" title="拖动调整窗口大小" aria-hidden="true" {...drag} onPointerDown={begin('resize')}/></>}
      </section>
    </div>,container)}
  </>;
}
