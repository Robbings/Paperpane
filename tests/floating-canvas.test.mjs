import test from 'node:test';
import assert from 'node:assert/strict';
import { FloatingCanvas, floatingMargin, floatingInsetLimit, floatingLeft, floatingPaperBounds } from '../src/ui/reader/windows/floating-canvas.ts';

class Style {
  values = new Map();
  getPropertyValue(k) { return this.values.get(k) ?? ''; }
  getPropertyPriority() { return ''; }
  setProperty(k, v) { this.values.set(k, v); }
  removeProperty(k) { this.values.delete(k); }
}
class PaperViewport extends EventTarget {
  clientWidth = 800; clientHeight = 600; clientLeft = 0; clientTop = 0;
  scrollLeft = 0; scrollTop = 0; pageWidth = 768;
  surface = { style: new Style() };
  children = [];
  ownerDocument = {createElement: () => {
    const element = {style:{},setAttribute(){},remove:()=>{this.children=this.children.filter(n=>n!==element);}};
    return element;
  }};
  appendChild(element) { this.children.push(element); }
  getBoundingClientRect() { return {left:0,top:0}; }
  querySelector() { return this.surface; }
  querySelectorAll() {
    return [{getBoundingClientRect:() => {
      const left = Math.max(16,(this.clientWidth-this.pageWidth)/2) + Number.parseFloat(this.surface.style.getPropertyValue('margin-left') || '0') - this.scrollLeft;
      return {left,right:left+this.pageWidth,top:80-this.scrollTop,bottom:1080-this.scrollTop,width:this.pageWidth,height:1000};
    }}];
  }
}

test('wide PDF leaves room for a complete 360px passage window on either side', () => {
  const el = new PaperViewport();
  el.clientWidth = 600; el.pageWidth = 568;
  const paper = floatingPaperBounds(el), margin = floatingMargin(el,360);
  assert.equal(margin,504);
  const left = floatingLeft(el,-1e6,360,paper.left), right = paper.right+margin-360;
  assert(left+360 < paper.left);
  assert(right > paper.right);
});

test('side room uses rendered card width, is finite, and keeps a strip of paper visible', () => {
  for (const viewport of [152,320,600,960,1600]) for (const width of [180,260,360,520,780]) {
    const el = new PaperViewport(); el.clientWidth=viewport; el.pageWidth=Math.max(100,viewport-32);
    const paper=floatingPaperBounds(el), left=floatingLeft(el,-1e8,width,paper.left), canvas=new FloatingCanvas(el);
    const id=Symbol();canvas.set(id,left);el.scrollLeft=0;
    const shown=el.querySelectorAll()[0].getBoundingClientRect();
    assert(Number.isFinite(canvas.getSnapshot()));
    assert(canvas.getSnapshot()<=floatingInsetLimit(el));
    assert(shown.left<=Math.max(paper.left,viewport-96)+1);
    assert(Number.isFinite(floatingLeft(el,NaN,width,paper.left)));
    canvas.remove(id);
  }
});

test('existing page gutters count toward the room rather than becoming extra blank space', () => {
  const el=new PaperViewport();el.clientWidth=1000;el.pageWidth=400;
  const paper=floatingPaperBounds(el),left=floatingLeft(el,-1e8,360,paper.left),canvas=new FloatingCanvas(el),id=Symbol();
  assert.equal(paper.left,300);
  canvas.set(id,left);
  assert.equal(canvas.getSnapshot(),366);
  canvas.remove(id);
  assert.equal(el.surface.style.getPropertyValue('margin-left'),'');
  assert.equal(el.surface.style.getPropertyValue('width'),'');
});

test('repeated extreme updates stay bounded and moving back or closing recovers the gutter', () => {
  const el=new PaperViewport(),canvas=new FloatingCanvas(el),a=Symbol(),b=Symbol();
  for(let i=0;i<5000;i++) {
    const paper=floatingPaperBounds(el,canvas.getSnapshot());
    canvas.set(a,floatingLeft(el,-1e9,520,paper.left));
    assert(canvas.getSnapshot()<=floatingInsetLimit(el));
  }
  const atEdge=canvas.getSnapshot();assert(atEdge>320);
  canvas.set(b,-40);canvas.set(a,30);
  assert.equal(canvas.getSnapshot(),52);
  canvas.remove(b);assert.equal(canvas.getSnapshot(),0);
  assert.equal(el.surface.style.getPropertyValue('margin-left'),'');
  canvas.remove(a);assert.equal(canvas.getSnapshot(),0);
});


test('right scroll extent leaves 16px for window controls and disappears on return', () => {
  const el=new PaperViewport(),canvas=new FloatingCanvas(el),id=Symbol(),paper=floatingPaperBounds(el);
  const left=paper.right+24;
  canvas.set(id,left,left+360);
  assert.equal(el.children.length,1);
  assert.equal(el.children[0].style.width,`${left+360+16}px`);
  canvas.set(id,paper.left+20,paper.left+380);
  assert.equal(el.children.length,0);
  assert.equal(canvas.getSnapshot(),0);
});

test('multiple windows share bounded extents without using the scroll extent as paper bounds', () => {
  const el=new PaperViewport(),canvas=new FloatingCanvas(el),a=Symbol(),b=Symbol();
  const paper=floatingPaperBounds(el),left=floatingLeft(el,-1e6,360,paper.left),right=paper.right+24;
  for(let i=0;i<1000;i++){canvas.set(a,left,left+360);canvas.set(b,right,right+360);}
  assert.equal(el.children.length,1);
  assert.equal(canvas.getSnapshot(),517);
  assert.equal(floatingPaperBounds(el,canvas.getSnapshot()).right,paper.right);
  canvas.remove(b);assert.equal(el.children.length,0);
  canvas.remove(a);assert.equal(canvas.getSnapshot(),0);
});

test('fractional page offsets and CSS margin rounding converge instead of recursively publishing', () => {
  for (const fraction of [0.001,0.003,0.008,0.015,0.0317,1/3]) {
    class FractionalViewport extends PaperViewport {
      querySelectorAll() {
        return [{getBoundingClientRect:() => {
          const applied = Number.parseFloat(this.surface.style.getPropertyValue('margin-left') || '0');
          const left = 16 + fraction + Math.round(applied * 64) / 64 - this.scrollLeft;
          return {left,right:left+530,top:80,bottom:1080,width:530,height:1000};
        }}];
      }
    }
    const el=new FractionalViewport();el.clientWidth=574;
    const canvas=new FloatingCanvas(el),id=Symbol();let publications=0;
    canvas.subscribe(()=>publications++);
    for(let i=0;i<100;i++) {
      const paper=floatingPaperBounds(el,canvas.getSnapshot());
      const left=floatingLeft(el,-1e6,520,paper.left);
      canvas.set(id,left,left+520);
      assert(Number.isInteger(canvas.getSnapshot()));
    }
    assert.equal(publications,1,`fraction ${fraction} must settle after the first layout`);
    canvas.remove(id);
    assert.equal(canvas.getSnapshot(),0);
  }
});

test('subpixel measurement noise cannot repeatedly resize either outer edge', () => {
  const el=new PaperViewport(),canvas=new FloatingCanvas(el),left=Symbol(),right=Symbol();
  let publications=0;canvas.subscribe(()=>publications++);
  for(let i=0;i<100;i++) {
    const noise=i%2?0.000001:-0.000001;
    canvas.set(left,-100+noise,260+noise);
    canvas.set(right,784+noise,1144+noise);
  }
  assert.equal(publications,2);
  canvas.remove(left);canvas.remove(right);
  assert.equal(canvas.getSnapshot(),0);assert.equal(el.children.length,0);
});

test('collapsed and expanded windows both retain generous side room', () => {
  const el=new PaperViewport();el.clientWidth=1200;
  assert.equal(floatingMargin(el,132),800);
  assert.equal(floatingMargin(el,360),800);
  el.clientWidth=600;
  assert.equal(floatingMargin(el,132),504);
  assert.equal(floatingMargin(el,360),504);
});
