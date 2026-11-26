import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const index=fs.readFileSync(new URL("../index.html",import.meta.url),"utf8");
const start=fs.readFileSync(new URL("../src/boot/app-start.js",import.meta.url),"utf8");
const worker=fs.readFileSync(new URL("../sw.js",import.meta.url),"utf8");
const app=fs.readFileSync(new URL("../app.js",import.meta.url),"utf8");

const release="20261127-7";

assert.ok(index.includes("setTimeout(showRecovery,15000)"),"stalled boots must show recovery");
assert.ok(index.includes('id="bootRetryButton"'),"recovery should offer an explicit retry");
assert.ok(!index.includes("wasRepaired"),"boot recovery must not automatically reload");
assert.ok(index.includes('item.scope===baseUrl'),"recovery must only unregister this app scope");
assert.ok(index.includes('key.startsWith(cachePrefix)'),"recovery must only clear this app cache family");
assert.ok(start.includes('window.dispatchEvent(new Event("p708:boot-ready"))'),"auth startup must cancel the watchdog");
assert.ok(start.includes('reg.waiting.postMessage({type:"SKIP_WAITING"})'),"update activation must follow a user action");
assert.ok(worker.includes("key.startsWith(CACHE_SCOPE)"),"activation must preserve other app caches");
assert.ok(index.includes(`app.js?v=${release}`),"HTML must load the current app release");
assert.ok(app.includes(`BOOT_VERSION = "${release}"`),"app loader must use the current release");
assert.ok(start.includes(`sw.js?v=${release}`),"service worker registration must use the current release");
assert.ok(worker.includes(`runtime-fallback-${release}`),"service worker cache must use the current release");
assert.ok(worker.includes("async function cachedResponse"),"runtime assets need an offline cache fallback");
assert.ok(worker.includes("url.search"),"versioned asset requests must fall back to the precached unversioned asset");
assert.ok(worker.includes("isValidRuntimeResponse"),"runtime responses must be MIME-validated before caching");
assert.ok(worker.includes("content-type"),"runtime MIME validation must inspect Content-Type");

const workerListeners={};
const workerContext={
  URL,Request,Response,AbortController,setTimeout,clearTimeout,fetch:async()=>new Response("export {};",{status:200,headers:{"content-type":"text/javascript"}}),
  caches:{open:async()=>({put:async()=>{},match:async()=>null}),keys:async()=>[],delete:async()=>true,match:async()=>null},
  clients:{matchAll:async()=>[],openWindow:async()=>{}},
  self:{registration:{scope:"https://p708-room-manager.web.app/"},location:{href:"https://p708-room-manager.web.app/sw.js",origin:"https://p708-room-manager.web.app"},addEventListener:(type,listener)=>{workerListeners[type]=listener;},skipWaiting:async()=>{},clients:{claim:async()=>{}}}
};
vm.runInNewContext(worker,workerContext);
const jsRequest=new Request("https://p708-room-manager.web.app/app.js");
assert.equal(workerContext.isValidRuntimeResponse(jsRequest,new Response("<html></html>",{status:200,headers:{"content-type":"text/html"}})),false,"HTML must never be cached as JavaScript");
assert.equal(workerContext.isValidRuntimeResponse(jsRequest,new Response("export {};",{status:200,headers:{"content-type":"text/javascript"}})),true,"valid JavaScript responses must remain cacheable");
function intercepted(path){
  let used=false;
  workerListeners.fetch({request:new Request(new URL(path,jsRequest.url)),respondWith:()=>{used=true;}});
  return used;
}
assert.equal(intercepted("/__/auth/handler"),false);
assert.equal(intercepted("/__/firebase/init.json"),false);
assert.equal(intercepted("/app.js?v=old-auth-release"),false);
assert.equal(intercepted(`/app.js?v=${release}`),true);

const loader=fs.readFileSync(new URL("../src/boot/app-loader.js",import.meta.url),"utf8");
assert.ok(loader.includes("await Promise.all(parts.map"),"classic scripts must download in parallel");
assert.ok(loader.includes("script.async = false"),"parallel downloads must preserve execution order");
assert.ok(loader.includes("isFirebaseHosting"),"GitHub Pages must skip the guaranteed Firebase init 404");
assert.ok(loader.includes("loadedParts"),"startup must show real loading progress");
assert.ok(!loader.includes("authDomain:location.hostname"),"Keep the OAuth domain registered by the Firebase project");

console.log("Boot watchdog and stale-cache recovery QA PASSED");
