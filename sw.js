const CACHE_SCOPE=`p708-manager-${encodeURIComponent(self.registration.scope)}-`;
const APP_RELEASE="20261127-9";
const CACHE_NAME=CACHE_SCOPE+`runtime-fallback-${APP_RELEASE}`;
const APP_SHELL=[
  "./index.html","./src/boot/pwa-diagnostics.js","./styles.css","./landing-ui.css","./utility-chart.css","./mobile-notification-ui.css","./kpi-polish.css","./billing-cycle.css","./cleaning-pet.css","./icon-polish.css","./app.js","./src/boot/app-loader.js","./src/boot/app-start.js","./src/core/mobile-auth-policy.js","./src/core/app-core1.js","./src/core/app-core2.js","./src/core/p708-secure-sync-engine.js","./src/core/p708-authoritative-repair.js","./src/core/p708-identity-plan.js","./src/core/p708-canonical-mapping-repair.js","./src/core/billing-cycle-period.js","./src/core/cleaning-fairness.js","./src/core/cleaning-streak.js","./src/core/expense-split.js","./src/core/cleaning-schedule-store.js","./src/features/app-actions1.js","./src/features/app-actions2.js","./src/features/cleaning-delete-fix.js","./src/features/app-dashboard.js","./src/features/app-render.js","./src/features/cleaning-pet-streak.js","./src/features/app-integrity-fixes.js","./src/features/inactive-mapping-dedup-fix.js","./src/features/canonical-identity-repair.js","./src/features/billing-canonical-repair.js","./src/features/billing-stable-repair.js","./src/features/billing-membership-exclusion.js","./src/features/billing-cycle-history.js","./src/features/home-enhancements.js","./src/features/home-pet-garden.js","./src/features/ui-icon-polish.js","./src/features/notification-enhancements.js","./src/features/today-calendar.js","./src/features/room-resources.js","./src/features/mobile-install-bridge.js","./src/features/mobile-install-guide.js","./manifest.webmanifest","./offline.html","./icons/icon-32.png","./icons/icon-192.png","./icons/icon-512.png","./icons/icon-maskable-512.png","./icons/pets/cloud-egg.svg","./icons/pets/cloud-sprout.svg","./icons/pets/cloud-cat.svg","./icons/pets/cloud-guardian.svg","./icons/pets/cloud-celestial.svg"
];
const shell=new Map(APP_SHELL.map(path=>{
  const url=new URL(path,self.registration.scope);
  if(/\.(js|css)$/.test(url.pathname))url.searchParams.set("v",APP_RELEASE);
  return [url.pathname,url];
}));
const indexUrl=new URL("./index.html",self.registration.scope);
const offlineUrl=new URL("./offline.html",self.registration.scope);
const validHtmlRelease=async response=>(await response.clone().text()).includes(`src="./app.js?v=${APP_RELEASE}"`);

function isValidRuntimeResponse(request,response){
  if(!response?.ok)return false;
  const url=new URL(typeof request==="string"?request:request.url,self.registration.scope);
  const type=String(response.headers.get("content-type")||"").toLowerCase();
  if(url.pathname.endsWith(".js"))return type.includes("javascript");
  if(url.pathname.endsWith(".css"))return type.includes("text/css");
  if(url.pathname.endsWith(".html"))return type.includes("text/html");
  if(url.pathname.endsWith(".webmanifest"))return type.includes("json")||type.includes("manifest");
  if(/\.(?:png|svg)$/.test(url.pathname))return type.startsWith("image/");
  return true;
}
async function precacheAppShell(){
  const cache=await caches.open(CACHE_NAME);
  await Promise.all([...shell.values()].map(async url=>{
    const request=new Request(url.href,{cache:"reload"});
    const response=await fetch(request);
    if(!isValidRuntimeResponse(request,response)||url.href===indexUrl.href&&!await validHtmlRelease(response))
      throw new Error("Invalid P708 release asset");
    await cache.put(request,response);
  }));
}
self.addEventListener("install",event=>event.waitUntil(precacheAppShell()));
self.addEventListener("activate",event=>event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(key=>key.startsWith(CACHE_SCOPE)&&key!==CACHE_NAME).map(key=>caches.delete(key)));
  await self.clients.claim();
})()));
self.addEventListener("message",event=>{
  const reply=value=>event.ports?.[0]?.postMessage(value);
  if(event.data?.type==="GET_RELEASE"){reply({release:APP_RELEASE});return;}
  if(event.data?.type!=="SKIP_WAITING"||!event.source?.id)return;
  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:"window",includeUncontrolled:true});
    if(windows.some(client=>client.id!==event.source.id&&client.url.startsWith(self.registration.scope))){
      reply({accepted:false});return;
    }
    reply({accepted:true});
    await self.skipWaiting();
  })());
});
self.addEventListener("notificationclick",event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const url=new URL(event.notification.data?.url||"./",self.registration.scope);
    if(!url.href.startsWith(self.registration.scope))return;
    const windows=await clients.matchAll({type:"window",includeUncontrolled:true});
    const existing=windows.find(client=>client.url.startsWith(self.registration.scope));
    if(existing){await existing.focus();existing.postMessage({type:"P708_OPEN_PAGE",hash:url.hash});}
    else await clients.openWindow(url.href);
  })());
});

async function cachedResponse(url){
  const cache=await caches.open(CACHE_NAME);
  const response=await cache.match(url.href);
  return isValidRuntimeResponse(url.href,response)?response:null;
}
async function navigateApp(request){
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),8000);
  try{
    const response=await fetch(request,{cache:"no-store",signal:controller.signal});
    if(isValidRuntimeResponse(indexUrl.href,response)){
      if(await validHtmlRelease(response))return response;
      return (await cachedResponse(indexUrl))||response;
    }
  }catch{}finally{clearTimeout(timeout);}
  return (await cachedResponse(offlineUrl))||Response.error();
}
async function releaseAsset(request,url){
  const cached=await cachedResponse(url).catch(()=>null);
  if(cached)return cached;
  try{
    const response=await fetch(request,{cache:"no-store"});
    if(isValidRuntimeResponse(request,response))return response;
  }catch{}
  return Response.error();
}
self.addEventListener("fetch",event=>{
  const request=event.request;
  if(request.method!=="GET")return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin||url.pathname.startsWith("/__/"))return;
  const asset=shell.get(url.pathname);
  if(request.mode==="navigate"){
    const launch=url.pathname===indexUrl.pathname||url.pathname===new URL(self.registration.scope).pathname;
    const ordinaryQuery=[...url.searchParams.keys()].every(key=>key==="debug");
    if(launch&&ordinaryQuery)event.respondWith(navigateApp(request));
    return;
  }
  if(asset&&url.search===asset.search)event.respondWith(releaseAsset(request,asset));
});
