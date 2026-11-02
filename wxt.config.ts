import { defineConfig } from 'wxt';
import { extensionDevHmr } from './build/extension-dev-hmr';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { readdir } from 'node:fs/promises';
const require=createRequire(import.meta.url);
const ortDirectory=dirname(require.resolve('onnxruntime-web/wasm'));

export default defineConfig({
  srcDir:'src',modules:['@wxt-dev/module-react'],imports:false,manifestVersion:3,
  manifest:{
    name:'Paperpane（纸窗）',description:'Paperpane 论文阅读工具',
    permissions:['offscreen','unlimitedStorage','alarms','clipboardWrite','storage','webRequest','scripting','tabs'],
    content_security_policy:{extension_pages:"script-src 'self' 'wasm-unsafe-eval'; object-src 'self';"},
    host_permissions:['https://*/*','http://*/*'],
  },
  vite:()=>({worker:{format:'es'},resolve:{conditions:['onnxruntime-web-use-extern-wasm','module','browser','development|production']},plugins:[extensionDevHmr()]}),
  hooks:{'build:publicAssets':async(_wxt,files)=>{
    for(const name of ['ort-wasm-simd-threaded.mjs','ort-wasm-simd-threaded.wasm'])files.push({absoluteSrc:join(ortDirectory,name),relativeDest:'runtime/'+name});
    const root=join(dirname(require.resolve('vditor/package.json')),'dist');
    const add=async(relative:string)=>{
      for(const entry of await readdir(join(root,relative),{withFileTypes:true})){
        const path=relative+'/'+entry.name;
        if(entry.isDirectory())await add(path);
        else files.push({absoluteSrc:join(root,path),relativeDest:'vditor/dist/'+path});
      }
    };
    for(const path of ['js/lute','js/katex','js/icons','css/content-theme'])await add(path);
    files.push({absoluteSrc:join(root,'js/i18n/zh_CN.js'),relativeDest:'vditor/dist/js/i18n/zh_CN.js'});
  }},
  webExt:{disabled:true},
});
