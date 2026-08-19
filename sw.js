const CACHE_NAME="p708-manager-v5-free-landing-20260819-6";
const APP_SHELL=[
  "./",
  "./index.html",
  "./styles.css",
  "./landing-ui.css",
  "./utility-chart.css",
  "./app.js",
  "./app-loader.js",
  "./app-core1.js",
  "./app-core2.js",
  "./app-actions1.js",
  "./app-actions2.js",
  "./app-dashboard.js",
  "./app-render.js",
  "./home-enhancements.js",
  "./app-start.js",
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

self.addEventListener("message",event=>{if(event.data?.type==="SKIP_WAITING")self.skipWaiting();});
self.addEventListener("notificationclick",event=>{event.notification.close();event.waitUntil((async()=>{const clientsList=await clients.matchAll({type:"window",includeUncontrolled:true});if(clientsList[0]){await clientsList[0].focus();return;}await clients.openWindow("./");})());});

async function networkFirst(request,fallback){
  try{
    const response=await fetch(request,{cache:"no-store"});
    if(response?.ok){const cache=await caches.open(CACHE_NAME);await cache.put(request,response.clone());}
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
  if(runtimeAsset){
    event.respondWith(networkFirst(event.request));
    return;
  }
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
