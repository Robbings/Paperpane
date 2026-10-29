import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  imports: false,
  manifestVersion: 3,
  manifest: {
    name: 'Paperpane（纸窗）',
    description: 'Paperpane 论文阅读工具',
    permissions: ['unlimitedStorage', 'storage', 'webRequest', 'scripting', 'tabs'],
    host_permissions: ['https://*/*', 'http://*/*'],
    optional_host_permissions: ['https://*/*', 'http://*/*'],
  },
  // Each contributor loads their own output directory in their own browser.
  webExt: { disabled: true },
});
