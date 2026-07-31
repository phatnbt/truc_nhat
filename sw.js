const CACHE_NAME="p708-app-v1";
const APP_SHELL=[
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./offline.html",
  "./icons/icon-32.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png"
];

self.addEventListener("install",event=>{
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(APP_SHELL)));
});

self.addEventListener("activate",event=>{
  event.waitUntil(Promise.all([
    caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE_NAME).map(key=>caches.delete(key)))),
    self.clients.claim()
  ]));
});

self.addEventListener("message",event=>{
  if(event.data?.type==="SKIP_WAITING")self.skipWaiting();
});

self.addEventListener("fetch",event=>{
  const request=event.request;
  if(request.method!=="GET")return;
  const url=new URL(request.url);

  if(request.mode==="navigate"){
    event.respondWith((async()=>{
      try{
        const response=await fetch(request);
        if(response?.ok){const cache=await caches.open(CACHE_NAME);cache.put("./index.html",response.clone())}
        return response;
      }catch{
        return (await caches.match("./index.html"))||(await caches.match("./offline.html"));
      }
    })());
    return;
  }

  if(url.origin===self.location.origin){
    event.respondWith((async()=>{
      const cached=await caches.match(request);
      const network=fetch(request).then(async response=>{
        if(response?.ok){const cache=await caches.open(CACHE_NAME);cache.put(request,response.clone())}
        return response;
      }).catch(()=>null);
      return cached||(await network)||Response.error();
    })());
  }
});
