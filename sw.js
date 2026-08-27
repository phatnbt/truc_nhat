const CACHE_NAME="p708-manager-v5-production-audit-20260827-3";
const APP_SHELL=[
  "./",
  "./index.html",
  "./styles.css",
  "./landing-ui.css",
  "./utility-chart.css",
  "./mobile-notification-ui.css",
  "./kpi-polish.css",
  "./app.js",
  "./app-loader.js",
  "./app-core1.js",
  "./app-core2.js",
  "./app-actions1.js",
  "./app-actions2.js",
  "./app-dashboard.js",
  "./app-render.js",
  "./app-integrity-fixes.js",
  "./home-enhancements.js",
  "./app-start.js",
  "./notification-enhancements.js",
  "./today-calendar.js",
  "./mobile-install-bridge.js",
  "./mobile-install-guide.js",
  "./p708-secure-sync-engine.js",
  "./manifest.webmanifest",
  "./offline.html",
  "./icons/icon-32.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png"
];

self.addEventListener("install",event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE_NAME);
  await cache.addAll(APP_SHELL);
  await self.skipWaiting();
})()));

self.addEventListener("activate",event=>event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(key=>key!==CACHE_NAME).map(key=>caches.delete(key)));
  await self.clients.claim();
})()));

self.addEventListener("message",event=>{
  if(event.data?.type==="SKIP_WAITING")self.skipWaiting();
});

self.addEventListener("notificationclick",event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const clientsList=await clients.matchAll({type:"window",includeUncontrolled:true});
    const target=event.notification?.data?.url||"./";
    const existing=clientsList.find(client=>client.url.startsWith(self.location.origin));
    if(existing){await existing.focus();if("navigate" in existing)await existing.navigate(target).catch(()=>{});return;}
    await clients.openWindow(target);
  })());
});

async function networkFirst(request,fallback){
  try{
    const response=await fetch(request,{cache:"no-store"});
    if(response?.ok){
      const cache=await caches.open(CACHE_NAME);
      await cache.put(request,response.clone());
      return response;
    }
    const cached=await caches.match(request);
    if(cached)return cached;
    if(fallback){const backup=await caches.match(fallback);if(backup)return backup;}
    return response;
  }catch{
    return (await caches.match(request))||(fallback?await caches.match(fallback):null)||Response.error();
  }
}

self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET")return;
  const url=new URL(event.request.url);
  if(event.request.mode==="navigate"){
    event.respondWith(networkFirst(event.request,"./offline.html"));
    return;
  }
  if(url.origin!==self.location.origin)return;
  const runtimeAsset=/\.(?:js|css|html|webmanifest)$/i.test(url.pathname);
  if(runtimeAsset){event.respondWith(networkFirst(event.request));return;}
  event.respondWith((async()=>{
    const cached=await caches.match(event.request);
    if(cached)return cached;
    try{
      const response=await fetch(event.request);
      if(response?.ok){const cache=await caches.open(CACHE_NAME);await cache.put(event.request,response.clone());}
      return response;
    }catch{return Response.error();}
  })());
});
