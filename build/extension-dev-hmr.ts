/** Vite's reconnect SharedWorker is not needed in an extension page.
 * Chrome can terminate the whole extension renderer on a cross-origin worker
 * request before JavaScript receives an error. Keep Vite's existing page-thread
 * reconnect fallback, without changing application workers or production code.
 */
export function extensionDevHmr(){
  return {
    name:'paperpane-extension-dev-hmr',apply:'serve' as const,enforce:'post' as const,
    transform(code:string,id:string){
      if(!/\/vite\/dist\/client\/client\.(?:m?js)(?:\?|$)/.test(id.replaceAll('\\','/')))return;
      const guard='if (typeof SharedWorker === "undefined") {';
      if(!code.includes(guard))return;
      return {code:code.replace(guard,'if (typeof SharedWorker === "undefined" || globalThis.location?.protocol === "chrome-extension:") {'),map:null};
    },
  };
}
