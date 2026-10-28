import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconButton } from '@/ui/components';
import '../notes/notes.css';
import './passage-window.css';

export interface PassageRect { left:number; top:number; width:number; height:number }
interface Point { x:number; y:number }
interface Props {
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
  const [collapsed,setCollapsed]=useState(false),[hovered,setHovered]=useState(false),[focused,setFocused]=useState(false);
  const [anchor,setAnchor]=useState<Point>({x:container.scrollLeft+24,y:container.scrollTop+80});
  const [offset,setOffset]=useState<Point>({x:0,y:0});
  const [size,setSize]=useState<{width:number;height?:number}>({width:360});
  const [bounds,setBounds]=useState({width:container.clientWidth,height:container.clientHeight});
  const [,tick]=useState(0);
  const panel=useRef<HTMLElement>(null),initialized=useRef(false),frame=useRef(0);
  const gesture=useRef<{kind:'move'|'resize';size:{width:number;height:number};id:number;target:HTMLElement;x:number;y:number;px:number;py:number;scrollX:number;scrollY:number;start:Point;moved:boolean}|null>(null);
  const latest=useRef({props,anchor,offset,bounds,collapsed});latest.current={props,anchor,offset,bounds,collapsed};
  const width=Math.min(collapsed?260:size.width,Math.max(140,container.clientWidth-24));
  const left=anchor.x+offset.x,top=anchor.y+offset.y;
  const active=hovered||focused;

  useLayoutEffect(()=>{
    const measure=()=>{
      const current=latest.current,box=container.getBoundingClientRect(),point=current.props.anchorPoint();
      if(point){
        const next={x:point.x-box.left-container.clientLeft+container.scrollLeft,y:point.y-box.top-container.clientTop+container.scrollTop};
        setAnchor(old=>same(old,next)?old:next);
        if(!initialized.current){
          initialized.current=true;
          const w=Math.min(360,container.clientWidth-24);
          setOffset({x:clamp(next.x,container.scrollLeft+12,container.scrollLeft+container.clientWidth-w-12)-next.x,y:clamp(next.y,container.scrollTop+64,container.scrollTop+container.clientHeight-180)-next.y});
        }
      }
      // Match comment notes: reserve a bounded margin beside the pages, never derive it from scrollWidth.
      const pages=[...container.querySelectorAll<HTMLElement>('.page, [data-page-index]')];
      const right=Math.max(container.clientWidth,...pages.map(p=>p.getBoundingClientRect().right-box.left+container.scrollLeft));
      const bottom=Math.max(container.clientHeight,...pages.map(p=>p.getBoundingClientRect().bottom-box.top+container.scrollTop));
      const next={width:right+Math.max(520,container.clientWidth),height:bottom+300};
      setBounds(old=>old.width===next.width&&old.height===next.height?old:next);tick(n=>n+1);
    };
    measure();const stop=props.subscribeGeometry(measure),observer=new ResizeObserver(measure);
    observer.observe(container);if(container.firstElementChild)observer.observe(container.firstElementChild);
    const redraw=()=>tick(n=>n+1);
    container.addEventListener('scroll',redraw,{passive:true});window.addEventListener('resize',measure);
    return()=>{stop();observer.disconnect();container.removeEventListener('scroll',redraw);window.removeEventListener('resize',measure);};
  },[container,props.subscribeGeometry]);

  // Read the card after React has applied movement/collapse and streamed content has resized it.
  useLayoutEffect(()=>{if(active)tick(n=>n+1);},[active,anchor,offset,collapsed]);
  useEffect(()=>{
    const observer=new ResizeObserver(()=>tick(n=>n+1));if(panel.current)observer.observe(panel.current);
    return()=>observer.disconnect();
  },[]);

  const finish=(reveal=false)=>{
    const g=gesture.current;gesture.current=null;cancelAnimationFrame(frame.current);
    if(g?.target.hasPointerCapture(g.id))g.target.releasePointerCapture(g.id);
    if(reveal&&g?.moved&&g.kind==='move'){
      const s=latest.current,p=panel.current;
      const l=s.anchor.x+s.offset.x,r=l+(p?.offsetWidth??360);
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
    const s=latest.current,dx=g.px-g.x+container.scrollLeft-g.scrollX,dy=g.py-g.y+container.scrollTop-g.scrollY;
    if(Math.abs(dx)+Math.abs(dy)>3)g.moved=true;
    if(!g.moved)return;
    if(g.kind==='resize'){
      setSize({width:clamp(g.size.width+dx,220,Math.min(520,container.clientWidth-24)),height:clamp(g.size.height+dy,140,Math.min(520,container.clientHeight-48))});
      return;
    }
    setOffset({x:clamp(g.start.x+dx,0,s.bounds.width-(panel.current?.offsetWidth??360))-s.anchor.x,y:clamp(g.start.y+dy,0,s.bounds.height-(panel.current?.offsetHeight??140))-s.anchor.y});
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
      gesture.current={kind,size:{width:panel.current?.offsetWidth??360,height:panel.current?.offsetHeight??140},id:event.pointerId,target:event.currentTarget,x:event.clientX,y:event.clientY,px:event.clientX,py:event.clientY,scrollX:container.scrollLeft,scrollY:container.scrollTop,start:{x:left,y:top},moved:false};
      if(kind==='move')frame.current=requestAnimationFrame(pan);
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
    {createPortal(<div className="pp-notes-layer pp-passage-window-layer" data-pp-overlay="">
      <div aria-hidden="true" style={{position:'absolute',width:bounds.width,height:bounds.height,pointerEvents:'none'}}/>
      {line&&<svg className="pp-passage-window__connector" aria-hidden="true" width={bounds.width} height={bounds.height}>
        <g transform={`translate(${container.scrollLeft-box.left-container.clientLeft} ${container.scrollTop-box.top-container.clientTop})`}>
          {rects.map((r,i)=><rect key={i} x={r.left-2} y={r.top-1} width={r.width+4} height={r.height+2} rx={3} className="pp-note-connector__mark"/>)}
          <line {...line} className="pp-note-connector__line"/><circle cx={line.x2} cy={line.y2} r={2.5} className="pp-note-connector__end"/>
        </g>
      </svg>}
      <section ref={panel} className={`pp-glass pp-note pp-passage-window${collapsed?' pp-note--pill':''}`} data-tone="float" data-collapsed={collapsed} aria-label={props.label}
        style={{left,top,width,height:collapsed?34:size.height,maxHeight:Math.max(140,container.clientHeight-48)}}
        onPointerEnter={()=>setHovered(true)} onPointerLeave={()=>setHovered(false)}
        onFocusCapture={event=>setFocused(event.target.matches(':focus-visible'))}
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
