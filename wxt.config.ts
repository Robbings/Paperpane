import { defineConfig } from 'wxt';
import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  imports: false,
  manifestVersion: 3,
  manifest: {
    name: 'Paperpane（纸窗）',
    description: 'Paperpane 论文阅读工具',
    permissions: ['unlimitedStorage', 'clipboardWrite', 'storage', 'webRequest', 'scripting', 'tabs'],
    content_security_policy: {extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';"},
    host_permissions: ['https://*/*', 'http://*/*'],
  },
  hooks: {
    // Ship only the IR runtime we use. All scripts/fonts are local under MV3 CSP.
    'build:publicAssets': async (_wxt, files) => {
      const root = join(dirname(createRequire(import.meta.url).resolve('vditor/package.json')), 'dist');
      const add = async (relative: string) => {
        const entries = await readdir(join(root, relative), {withFileTypes: true});
        for (const entry of entries) {
          const path = relative + '/' + entry.name;
          if (entry.isDirectory()) await add(path);
          else files.push({absoluteSrc: join(root, path), relativeDest: 'vditor/dist/' + path});
        }
      };
      for (const path of ['js/lute', 'js/katex', 'js/icons', 'css/content-theme']) await add(path);
      files.push({absoluteSrc: join(root, 'js/i18n/zh_CN.js'), relativeDest: 'vditor/dist/js/i18n/zh_CN.js'});
    },
  },
  vite: () => ({worker: {format: 'es'}}),
  // Each contributor loads their own output directory in their own browser.
  webExt: { disabled: true },
});
