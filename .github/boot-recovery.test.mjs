import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const index=fs.readFileSync(new URL("../index.html",import.meta.url),"utf8");
const start=fs.readFileSync(new URL("../src/boot/app-start.js",import.meta.url),"utf8");
const worker=fs.readFileSync(new URL("../sw.js",import.meta.url),"utf8");
const app=fs.readFileSync(new URL("../app.js",import.meta.url),"utf8");

const release="20261127-14";

assert.ok(index.includes("setTimeout(showRecovery,15000)"),"stalled boots must show recovery");
assert.ok(index.includes('id="bootRetryButton"'),"recovery should offer an explicit retry");
assert.ok(!index.includes("wasRepaired"),"boot recovery must not automatically reload");
assert.ok(!index.includes(".unregister("),"recovery must preserve the controlling registration for all open clients");
assert.ok(!index.includes("caches.delete("),"recovery must preserve cached assets other tabs are using");
assert.ok(start.includes('window.dispatchEvent(new Event("p708:boot-ready"))'),"auth startup must cancel the watchdog");
assert.ok(start.includes('reg.waiting.postMessage({type:"SKIP_WAITING"},'),"update activation must follow a user action");
assert.ok(worker.includes("key.startsWith(CACHE_SCOPE)"),"activation must preserve other app caches");
assert.ok(index.includes(`app.js?v=${release}`),"HTML must load the current app release");
assert.ok(app.includes(`BOOT_VERSION = "${release}"`),"app loader must use the current release");
assert.ok(start.includes('register("./sw.js"'),"service worker registration must use a stable URL");
assert.ok(worker.includes(`APP_RELEASE="${release}"`),"service worker cache must use the current release");
assert.ok(worker.includes("async function cachedResponse"),"runtime assets need an offline cache fallback");
assert.ok(worker.includes("url.search===asset.search"),"versioned assets must match the exact precache key");
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
function intercepted(path,mode="cors"){
  let used=false;
  workerListeners.fetch({request:{url:new URL(path,jsRequest.url).href,method:"GET",mode},respondWith:promise=>{used=true;void promise;}});
  return used;
}
assert.equal(intercepted("/__/auth/handler"),false);
assert.equal(intercepted("/__/firebase/init.json"),false);
assert.equal(intercepted("/app.js?v=old-auth-release"),false);
assert.equal(intercepted(`/app.js?v=${release}`),true);
assert.equal(intercepted("/firebase-config.runtime.json"),false,"runtime config must bypass the worker");
assert.equal(intercepted("/src/features/app-actions2.js?v=stale-release"),false,"an old request for any app module must not receive the active release's cached file");
assert.equal(intercepted("/index.html?code=placeholder&state=placeholder","navigate"),false,"OAuth navigation must bypass app fallback");
assert.equal(intercepted("/?refresh=42","navigate"),false,"the explicit recovery button must reach the network");
assert.equal(intercepted("/api/unknown","navigate"),false,"API navigations must retain their server response");
assert.equal(intercepted("/index.html?debug=1","navigate"),true);
const htmlFor=release=>new Response(`<script type="module" src="./app.js?v=${release}"></script>`,{headers:{"Content-Type":"text/html"}});
workerContext.fetch=async()=>htmlFor("20261127-15");
workerContext.caches.match=async url=>url.endsWith("/index.html")?htmlFor(release):null;
assert.match(await (await workerContext.navigateApp(new Request("https://p708-room-manager.web.app/index.html"))).text(),
  new RegExp(`app.js\\?v=${release}`),"a controlled launch must pair an older worker with its own HTML until it can update");
const missingAsset=new URL(`/src/features/app-actions2.js?v=${release}`,jsRequest.url);
workerContext.fetch=async request=>{
  if(new URL(typeof request==="string"?request:request.url).pathname.endsWith(".js")){
    return new Response('console.log("newer feature");',{headers:{"Content-Type":"text/javascript"}});
  }
  return htmlFor("20261127-15");
};
assert.equal((await workerContext.releaseAsset(new Request(missingAsset),missingAsset)).type,"error",
  "an evicted entry must not be reloaded from a different server release");
const previous="20261127-13",previousAsset=new URL(`/src/features/app-actions2.js?v=${previous}`,jsRequest.url);
workerContext.caches.match=async(url,{cacheName})=>url===previousAsset.href&&cacheName.endsWith(`runtime-fallback-${previous}`)
  ?new Response("previous feature",{headers:{"Content-Type":"text/javascript"}}):null;
assert.equal(await (await workerContext.releaseAsset(new Request(previousAsset),previousAsset,previous)).text(),"previous feature",
  "a newly activated worker can still finish serving a navigation that started under its predecessor");

const loader=fs.readFileSync(new URL("../src/boot/app-loader.js",import.meta.url),"utf8");
assert.ok(loader.includes("await Promise.all(urls.map"),"classic scripts must download in parallel");
assert.ok(loader.includes("script.async = false"),"parallel downloads must preserve execution order");
assert.ok(loader.includes("isFirebaseHosting"),"GitHub Pages must skip the guaranteed Firebase init 404");
assert.ok(loader.includes("loadedParts"),"startup must show real loading progress");
assert.ok(!loader.includes("authDomain:location.hostname"),"Keep the OAuth domain registered by the Firebase project");

console.log("Boot watchdog and stale-cache recovery QA PASSED");
