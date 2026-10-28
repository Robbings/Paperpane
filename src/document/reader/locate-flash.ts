interface Rect { left:number;top:number;width:number;height:number }
const SVG_NS='http://www.w3.org/2000/svg';

/** Transient positioning feedback, deliberately separate from saved PDF annotations. */
export class LocateFlash {
  private layer?:SVGSVGElement;
  private path?:SVGPathElement;
  private readRects?:()=>readonly Rect[];
  private timer?:ReturnType<typeof setTimeout>;
  constructor(private container:HTMLElement){}
  show(readRects:()=>readonly Rect[]){
    this.clear();this.readRects=readRects;
    const layer=document.createElementNS(SVG_NS,'svg');
    layer.classList.add('pp-pdf-locate-feedback');layer.setAttribute('aria-hidden','true');layer.setAttribute('data-pp-overlay','');
    this.layer=layer;this.path=document.createElementNS(SVG_NS,'path');layer.append(this.path);
    this.container.append(layer);this.paint();
    this.timer=setTimeout(()=>this.clear(),1900);
  }
  paint(){
    const layer=this.layer,path=this.path;if(!layer||!path||!this.readRects)return;
    const el=this.container,box=el.getBoundingClientRect(),width=el.clientWidth,height=el.clientHeight;
    layer.style.left=`${el.scrollLeft}px`;layer.style.top=`${el.scrollTop}px`;
    layer.setAttribute('width',String(width));layer.setAttribute('height',String(height));
    // One filled path: overlapping line boxes do not darken each other.
    const parts=this.readRects().flatMap(r=>{
      if(![r.left,r.top,r.width,r.height].every(Number.isFinite)||r.width<=0||r.height<=0)return [];
      const x=r.left-box.left-el.clientLeft,y=r.top-box.top-el.clientTop;
      if(x+r.width<0||x>width||y+r.height<0||y>height)return [];
      const l=x-2,t=y-1,w=r.width+4,h=r.height+2;
      return [`M${l+2},${t}h${w-4}q2,0 2,2v${Math.max(0,h-4)}q0,2 -2,2h${-(w-4)}q-2,0 -2,-2v${-Math.max(0,h-4)}q0,-2 2,-2Z`];
    });
    path.setAttribute('d',parts.join(' '));
  }
  clear(){
    clearTimeout(this.timer);this.timer=undefined;this.layer?.remove();this.layer=undefined;this.path=undefined;this.readRects=undefined;
  }
}
