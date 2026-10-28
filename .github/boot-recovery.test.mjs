import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const index=fs.readFileSync(new URL("../index.html",import.meta.url),"utf8");
const start=fs.readFileSync(new URL("../src/boot/app-start.js",import.meta.url),"utf8");
const worker=fs.readFileSync(new URL("../sw.js",import.meta.url),"utf8");
const app=fs.readFileSync(new URL("../app.js",import.meta.url),"utf8");

const release="20261029-2";

assert.ok(index.includes(`P708_BOOT_REPAIR_${release.replaceAll("-","_")}`),"boot watchdog marker is required");
assert.ok(index.includes("setTimeout(showRecovery,10000)"),"a stalled boot must recover instead of hanging forever");
assert.ok(index.includes("box.dataset.bootProgress"),"watchdog must cover a loader stalled after progress starts");
assert.ok(index.includes('item.scope===baseUrl'),"recovery must only unregister this app scope");
assert.ok(index.includes('key.startsWith("p708-manager-")'),"recovery must only clear this app cache family");
assert.ok(start.includes('window.dispatchEvent(new Event("p708:boot-ready"))'),"auth startup must cancel the watchdog");
assert.ok(index.includes(`P708_BOOT_RELEASE_${release}`),"each release must proactively clear stale PWA caches once");
assert.ok(index.includes("P708_BOOT_PREPARE"),"the app module must wait for stale-cache cleanup");
assert.ok(index.includes(`app.js?v=${release}`),"HTML must load the current app release");
assert.ok(app.includes(`BOOT_VERSION = "${release}"`),"app loader must use the current release");
assert.ok(start.includes(`sw.js?v=${release}`),"service worker registration must use the current release");
assert.ok(worker.includes(`runtime-fallback-${release}`),"service worker cache must use the current release");
assert.ok(worker.includes("async function cachedResponse"),"runtime assets need an offline cache fallback");
assert.ok(worker.includes("url.search"),"versioned asset requests must fall back to the precached unversioned asset");
assert.ok(worker.includes("isValidRuntimeResponse"),"runtime responses must be MIME-validated before caching");
assert.ok(worker.includes("content-type"),"runtime MIME validation must inspect Content-Type");

const workerContext={
  URL,Request,Response,fetch:async()=>new Response("",{status:200}),
  caches:{open:async()=>({put:async()=>{}}),keys:async()=>[],delete:async()=>true,match:async()=>null},
  clients:{matchAll:async()=>[],openWindow:async()=>{}},
  self:{location:{href:"https://p708-room-manager.web.app/sw.js",origin:"https://p708-room-manager.web.app"},addEventListener:()=>{},skipWaiting:async()=>{},clients:{claim:async()=>{}}}
};
vm.runInNewContext(worker,workerContext);
const jsRequest=new Request("https://p708-room-manager.web.app/app.js");
assert.equal(workerContext.isValidRuntimeResponse(jsRequest,new Response("<html></html>",{status:200,headers:{"content-type":"text/html"}})),false,"HTML must never be cached as JavaScript");
assert.equal(workerContext.isValidRuntimeResponse(jsRequest,new Response("export {};",{status:200,headers:{"content-type":"text/javascript"}})),true,"valid JavaScript responses must remain cacheable");

const loader=fs.readFileSync(new URL("../src/boot/app-loader.js",import.meta.url),"utf8");
assert.ok(loader.includes("await Promise.all(parts.map"),"classic scripts must download in parallel");
assert.ok(loader.includes("script.async = false"),"parallel downloads must preserve execution order");
assert.ok(loader.includes("isFirebaseHosting"),"GitHub Pages must skip the guaranteed Firebase init 404");
assert.ok(loader.includes("loadedParts"),"startup must show real loading progress");

console.log("Boot watchdog and stale-cache recovery QA PASSED");
