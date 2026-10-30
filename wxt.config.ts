import { defineConfig } from 'wxt';
import { extensionDevHmr } from './build/extension-dev-hmr';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const ortDirectory=dirname(createRequire(import.meta.url).resolve('onnxruntime-web/wasm'));

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  imports: false,
  manifestVersion: 3,
  manifest: {
    name: 'Paperpane（纸窗）',
    description: 'Paperpane 论文阅读工具',
    permissions: ['unlimitedStorage', 'alarms', 'clipboardWrite', 'storage', 'webRequest', 'scripting', 'tabs'],
    content_security_policy: {extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';"},
    host_permissions: ['https://*/*', 'http://*/*'],
  },
  vite: () => ({worker: {format: 'es'},resolve:{conditions:['onnxruntime-web-use-extern-wasm','module','browser','development|production']},plugins:[extensionDevHmr()]}),
  hooks:{'build:publicAssets':(_wxt,files)=>{for(const name of ['ort-wasm-simd-threaded.mjs','ort-wasm-simd-threaded.wasm'])files.push({absoluteSrc:join(ortDirectory,name),relativeDest:'runtime/'+name});}},
  // Each contributor loads their own output directory in their own browser.
  webExt: { disabled: true },
});
