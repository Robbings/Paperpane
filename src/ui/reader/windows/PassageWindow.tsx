import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useUiScale } from '@/ui/use-ui-scale';
import { createPortal } from 'react-dom';
import { IconButton } from '@/ui/components';
import type { NoteLayout } from '../types';
import { floatingLeft, floatingMargin, floatingPaperBounds, floatingPaperOriginX, useFloatingCanvas } from './floating-canvas';
import { keyboardFocus } from '../notes/CommentNotes';
import '../notes/notes.css';
import './passage-window.css';

export interface PassageRect { left:number; top:number; width:number; height:number }
interface Point { x:number; y:number }
/** Use the same passage-relative layout fields as comment notes. */
export type PassageWindowLayout = Pick<NoteLayout,'dx'|'dy'|'width'|'height'|'zoom'>;
interface Props {
  layout?:PassageWindowLayout;
  /** The PDF zoom. Without it the window follows the measured paper width instead. */
  zoomPercent?:number;
  onLayoutChange?:(layout:PassageWindowLayout)=>void;
  onLayoutCommit?:()=>void;
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
/** The widest single page; stays the same when pages are shown one or two across. */
const pageWidth=(container:HTMLElement)=>Math.max(1,...[...container.querySelectorAll<HTMLElement>('.page, [data-page-index]')].map(page=>page.getBoundingClientRect().width));

/**
 * Shared passage window for translation/explanation. Uses comment-note visuals and drag/pan behavior.
 *
 * Like comment notes it belongs to the paper: its offset from the passage and its size are kept in
 * the paper's units at the zoom it was placed at, and it is drawn scaled by (zoom now / that zoom),
 * so zooming, docking the translation pane or resizing the window never moves it relative to the
 * passage. The interface scale sets its design size; the reading font size only changes its text.
 */
export function PassageWindow(props:Props){
  const {container}=props;
  const uiScale=useUiScale();
  const [dragging,setDragging]=useState(false);
  const [internalCollapsed,setInternalCollapsed]=useState(false),[hovered,setHovered]=useState(false),[focused,setFocused]=useState(false);
  const collapsed=props.collapsed??internalCollapsed;
  const setCollapsed=(value:boolean)=>{setInternalCollapsed(value);props.onCollapsedChange?.(value);};
  const [anchor,setAnchor]=useState<Point>({x:container.scrollLeft+24,y:container.scrollTop+80});
  const [localLayout,setLocalLayout]=useState<{dx:number;dy:number;width:number;height?:number}>({dx:0,dy:0,width:360,height:props.initialHeight});
  const [bounds,setBounds]=useState({left:0,width:container.clientWidth,height:container.clientHeight});
  const [,tick]=useState(0);
  const panel=useRef<HTMLElement>(null),initialized=useRef(false),frame=useRef(0),placedAt=useRef<number|undefined>(undefined);
  const gesture=useRef<{kind:'move'|'resize';size:{width:number;height:number};id:number;target:HTMLElement;x:number;y:number;px:number;py:number;scrollX:number;scrollY:number;inset:number;start:Point;moved:boolean}|null>(null);
  const paper=floatingPaperBounds(container);
  // Anything proportional to the paper's size works as a zoom: only its ratio to the placing zoom is used.
  // One page's width, not the whole spread: switching to two pages side by side is not a zoom.
  const zoom=props.zoomPercent??pageWidth(container);
  const saved=props.layout&&props.zoomPercent!==undefined?props.layout.zoom:undefined;
  const layout={...(props.layout??localLayout),zoom:saved??(placedAt.current??=zoom)};
  const scale=layout.zoom>0&&zoom>0?zoom/layout.zoom:1;
  const offset={x:layout.dx*scale,y:layout.dy*scale};
  const size:{width:number;height?:number}={width:layout.width,height:layout.height};
  const latest=useRef({props,anchor,offset,size,bounds,collapsed,scale,layout,paper});latest.current={props,anchor,offset,size,bounds,collapsed,scale,layout,paper};
  /** Offsets arrive in screen pixels at the current zoom and are kept in the layout's own zoom. */
  const changeLayout=(nextOffset:Point,nextSize:{width:number;height?:number}=latest.current.size)=>{
    const {scale,layout}=latest.current,next={dx:nextOffset.x/scale,dy:nextOffset.y/scale,width:nextSize.width,height:nextSize.height};
    setLocalLayout(next);latest.current.offset=nextOffset;latest.current.size=nextSize;
    latest.current.props.onLayoutChange?.({...next,height:next.height??props.initialHeight??180,zoom:layout.zoom});
  };
  // Sizes below are layout pixels inside the card, which is drawn scaled by `scale` from its top-left.
  const width=collapsed?undefined:Math.min(size.width*uiScale,Math.max(140,(container.clientWidth-24)/scale));
  const actualWidth=(collapsed?(panel.current?.offsetWidth??130*uiScale):width!)*scale;
  const logicalLeft=floatingLeft(paper,anchor.x+offset.x,actualWidth),top=anchor.y+offset.y;
  const canvas=useFloatingCanvas(container,initialized.current?logicalLeft:null,initialized.current?logicalLeft+actualWidth:null);
  const left=logicalLeft+canvas.inset;
  const active=hovered||focused;

  useLayoutEffect(()=>{
    const measure=()=>{
      const current=latest.current,box=container.getBoundingClientRect(),point=current.props.anchorPoint();
      if(point){
        const next={x:point.x-floatingPaperOriginX(container),y:point.y-box.top-container.clientTop+container.scrollTop};
        setAnchor(old=>same(old,next)?old:next);
        if(!initialized.current){
          initialized.current=true;
          if(!current.props.layout){
            const w=Math.min(360*uiScale,container.clientWidth-24);
            changeLayout({x:clamp(next.x+(props.initialOffset?.x??0),container.scrollLeft-canvas.readInset()+12,container.scrollLeft-canvas.readInset()+container.clientWidth-w-12)-next.x,y:clamp(next.y+(props.initialOffset?.y??0),container.scrollTop+64,container.scrollTop+container.clientHeight-(props.initialHeight===undefined?180:props.initialHeight*uiScale+12))-next.y});
          }
        }
      }
      // A restored card may already be under a stationary pointer: there is no
      // fresh pointerenter event after reload. Recover hover along with geometry.
      setHovered(panel.current?.matches(':hover')??false);
      const paper=floatingPaperBounds(container);
      const next={left:paper.left,width:paper.right,height:paper.bottom+300};
      setBounds(old=>old.left===next.left&&old.width===next.width&&old.height===next.height?old:next);tick(n=>n+1);
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
      const s=latest.current,w=(panel.current?.offsetWidth??360)*s.scale;
      const l=floatingLeft(s.paper,s.anchor.x+s.offset.x,w)+canvas.readInset(),r=l+w;
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
      // The pointer moves in screen pixels; the size is kept in design units before both scales.
      const k=uiScale*s.scale;
      // Height may use the whole visible paper area; the style's maxHeight applies the same bound.
      changeLayout(s.offset,{width:clamp((g.size.width+dx)/k,220,Math.min(900,(container.clientWidth-24)/k)),height:clamp((g.size.height+dy)/k,140,(container.clientHeight-48)/k)});
      return;
    }
    const cardWidth=(panel.current?.offsetWidth??360)*s.scale,margin=floatingMargin(s.paper,cardWidth);
    changeLayout({x:clamp(g.start.x+dx,s.bounds.left+12-margin,s.bounds.width+margin-cardWidth)-s.anchor.x,y:clamp(g.start.y+dy,0,s.bounds.height-(panel.current?.offsetHeight??140)*s.scale)-s.anchor.y});
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
      gesture.current={kind,size:{width:(panel.current?.offsetWidth??360)*scale,height:(panel.current?.offsetHeight??140)*scale},id:event.pointerId,target:event.currentTarget,x:event.clientX,y:event.clientY,px:event.clientX,py:event.clientY,scrollX:container.scrollLeft,scrollY:container.scrollTop,inset:canvas.readInset(),start:{x:logicalLeft,y:top},moved:false};
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
      {dragging&&<div aria-hidden="true" style={{position:'absolute',width:bounds.width+floatingMargin(paper,actualWidth)+canvas.inset,height:bounds.height,pointerEvents:'none'}}/>}
      {line&&<svg className="pp-passage-window__connector" aria-hidden="true" width={Math.max(container.clientWidth,left+actualWidth)} height={Math.max(container.clientHeight,top+(panel.current?.offsetHeight??140)*scale)}>
        <g transform={`translate(${container.scrollLeft-box.left-container.clientLeft} ${container.scrollTop-box.top-container.clientTop})`}>
          {rects.map((r,i)=><rect key={i} x={r.left-2} y={r.top-1} width={r.width+4} height={r.height+2} rx={3} className="pp-note-connector__mark"/>)}
          <line {...line} className="pp-note-connector__line"/><circle cx={line.x2} cy={line.y2} r={2.5} className="pp-note-connector__end"/>
        </g>
      </svg>}
      <section ref={panel} className={`pp-glass pp-note pp-passage-window${collapsed?' pp-note--pill':''}`} data-tone="float" data-collapsed={collapsed} aria-label={props.label}
        style={{left,top,width,maxWidth:collapsed?Math.min(260*uiScale,Math.max(100,(container.clientWidth-24)/scale)):undefined,height:collapsed?34*uiScale:size.height===undefined?undefined:size.height*uiScale,maxHeight:Math.max(140,(container.clientHeight-48)/scale),transform:scale===1?undefined:`scale(${scale})`,transformOrigin:'top left',visibility:initialized.current?undefined:'hidden'}}
        onPointerDownCapture={props.onActivate}
        onPointerEnter={()=>setHovered(true)} onPointerLeave={()=>setHovered(false)}
        onFocusCapture={event=>setFocused(keyboardFocus(event.target))}
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
