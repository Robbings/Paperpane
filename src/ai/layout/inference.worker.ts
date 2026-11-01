/// <reference lib="webworker" />
import * as ort from 'onnxruntime-web/wasm';
import { ENGINES,decodeLayout,type LayoutEngineId } from './engines';
export function installLayoutWorker(){
const scope=self as unknown as SharedWorkerGlobalScope;
ort.env.wasm.numThreads=1;ort.env.wasm.wasmPaths={mjs:new URL('/runtime/ort-wasm-simd-threaded.mjs',self.location.href).href,wasm:new URL('/runtime/ort-wasm-simd-threaded.wasm',self.location.href).href};ort.env.logLevel='error';
let selected:LayoutEngineId|undefined;
let session:ort.InferenceSession|undefined,tail=Promise.resolve(),timer:ReturnType<typeof setTimeout>;
const ports=new Set<MessagePort>(),cancelled=new Set<string>();let tasks=0;
function idle(){clearTimeout(timer);timer=setTimeout(()=>{if(tasks)return;for(const port of ports){port.postMessage({idle:true});port.close();}scope.close();},60000);}
scope.onconnect=(event:MessageEvent)=>{const port=event.ports[0]!;ports.add(port);port.start();port.onmessage=(e:MessageEvent)=>{
 const {id,blob,width,height,cancel,engine='picodet17'}=e.data;
 if(cancel){cancelled.add(id);return;}
 tasks++;clearTimeout(timer);
 tail=tail.then(async()=>{try{
  if(cancelled.has(id))return;
  const spec=ENGINES[engine as LayoutEngineId];if(!spec)throw new Error('未知版面识别引擎');
  if(!session||selected!==engine){if(session)await session.release();session=undefined;const response=await fetch(new URL(spec.asset,self.location.href));if(!response.ok)throw new Error('此识别引擎的模型尚未安装');const data=await response.arrayBuffer();
   const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(n=>n.toString(16).padStart(2,'0')).join('');
   if(digest!==spec.sha256)throw new Error('版面模型校验失败');
   session=await ort.InferenceSession.create(data,{executionProviders:['wasm'],graphOptimizationLevel:'all'});selected=engine;
  }
  if(cancelled.has(id))return;
  const bitmap=await createImageBitmap(blob),canvas=new OffscreenCanvas(width,height),ctx=canvas.getContext('2d',{willReadFrequently:true})!;ctx.drawImage(bitmap,0,0);bitmap.close();const data=ctx.getImageData(0,0,width,height).data;
  const side=spec.side,values=new Float32Array(3*side*side),mean=[.485,.456,.406],std=[.229,.224,.225];
  // OpenCV half-pixel bilinear (without browser-specific canvas downsampling).
  for(let y=0;y<side;y++)for(let x=0;x<side;x++){
   const sx=Math.max(0,(x+.5)*width/side-.5),sy=Math.max(0,(y+.5)*height/side-.5),x0=Math.floor(sx),y0=Math.floor(sy),x1=Math.min(width-1,x0+1),y1=Math.min(height-1,y0+1),fx=sx-x0,fy=sy-y0;
   for(let c=0;c<3;c++){const v=Math.round((data[(y0*width+x0)*4+c]!*(1-fx)+data[(y0*width+x1)*4+c]!*fx)*(1-fy)+(data[(y1*width+x0)*4+c]!*(1-fx)+data[(y1*width+x1)*4+c]!*fx)*fy);values[c*side*side+y*side+x]=spec.normalization==='rgb'?Math.fround(v/255):Math.fround(Math.fround(Math.fround(v/255)-Math.fround(mean[c]!))/Math.fround(std[c]!));}
  }
  const tensor=new ort.Tensor('float32',values,[1,3,side,side]);
  const input:Record<string,ort.Tensor>=engine==='picodet17'?{image:tensor,scale_factor:new ort.Tensor('float32',Float32Array.from([side/height,side/width]),[1,2])}:{pixel_values:tensor};
  const out=await session!.run(input),regions=decodeLayout(engine,out as unknown as Parameters<typeof decodeLayout>[1],width,height);
  for(const t of Object.values(out))t.dispose();for(const t of Object.values(input))t.dispose();canvas.width=canvas.height=0;
  if(!cancelled.has(id))port.postMessage({id,regions});
 }catch(e){port.postMessage({id,error:e instanceof Error?e.message:String(e)});}finally{cancelled.delete(id);tasks--;idle();}});
};idle();};

}
