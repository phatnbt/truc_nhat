(()=>{
  if(new URLSearchParams(location.search).get("debug")!=="1")return;
  const fields={},timeline=[];
  const safe=value=>typeof value==="boolean"||Number.isFinite(value)?value:
    typeof value==="string"&&/^[a-z0-9][a-z0-9/_.-]{0,79}$/i.test(value)?value:"unavailable";
  const allowed=new Set([
    "release","serverRelease","build","loader","sdk","display","controllerRelease","cache","registration",
    "firebase","auth","authFlow","persistence","indexedDB","localStorage","sessionStorage","cacheStorage",
    "network","visibility","listener","pendingWrites","snapshot","lastSync","authError","firestoreError","runtimeError"
  ]);
  const panel=document.querySelector("#pwaDebugPanel"),output=document.querySelector("#pwaDebugOutput");
  const appPath=new URL("../../index.html",document.currentScript.src).pathname;
  const report=()=>JSON.stringify({
    url:`${location.origin}${appPath}?debug=1`,origin:location.origin,...fields,events:timeline
  },null,2);
  const track=(key,value)=>{
    if(!allowed.has(key))return;
    const clean=safe(value);
    if(fields[key]===clean)return;
    fields[key]=clean;
    timeline.push({at:new Date().toISOString(),field:key,value:clean});
    if(timeline.length>60)timeline.shift();
    if(panel.open)output.textContent=report();
  };
  globalThis.P708Debug=track;
  panel.hidden=false;
  panel.addEventListener("toggle",()=>{if(panel.open)output.textContent=report();});
  document.querySelector("#pwaDebugCopy").addEventListener("click",async()=>{
    try{await navigator.clipboard.writeText(report());document.querySelector("#pwaDebugCopyStatus").textContent="Đã sao chép";}
    catch{
      output.textContent=report();
      const range=document.createRange();
      range.selectNodeContents(output);
      const selection=getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      document.querySelector("#pwaDebugCopyStatus").textContent="Chọn Sao chép để gửi báo cáo.";
    }
  });
  const classify=error=>{
    const known=["Error","TypeError","ReferenceError","SyntaxError","SecurityError","InvalidStateError","QuotaExceededError","AbortError"];
    return known.includes(error?.name)?error.name:"unknown";
  };
  window.addEventListener("error",event=>track("runtimeError",event.error?classify(event.error):
    event.target?.tagName==="SCRIPT"?"script-load":"resource-load"),true);
  window.addEventListener("unhandledrejection",event=>track("runtimeError",classify(event.reason)));
  const display=()=>navigator.standalone===true||matchMedia("(display-mode: standalone)").matches?"standalone":"browser";
  const life=()=>{
    track("display",display());track("visibility",document.visibilityState);track("network",navigator.onLine?"online":"offline");
  };
  for(const event of ["pageshow","online","offline"])window.addEventListener(event,life);
  document.addEventListener("visibilitychange",life);
  life();
  for(const key of ["localStorage","sessionStorage"]){
    try{
      const store=window[key],probe="p708-debug-probe";
      store.setItem(probe,"1");
      const available=store.getItem(probe)==="1";
      store.removeItem(probe);
      track(key,available);
    }catch{track(key,false);}
  }
  try{
    track("indexedDB","checking");
    const probe=indexedDB.open("p708-debug-probe",1);
    const timeout=setTimeout(()=>track("indexedDB","timeout"),2000);
    probe.onblocked=()=>track("indexedDB","blocked");
    probe.onerror=()=>{clearTimeout(timeout);track("indexedDB",false);};
    probe.onupgradeneeded=()=>probe.result.createObjectStore("probe");
    probe.onsuccess=()=>{
      try{
        const db=probe.result,tx=db.transaction("probe","readwrite"),store=tx.objectStore("probe");
        store.put("1","probe");store.get("probe");
        const finish=value=>{clearTimeout(timeout);db.close();track("indexedDB",value);};
        tx.oncomplete=()=>finish(true);tx.onabort=()=>finish(false);
      }catch{clearTimeout(timeout);probe.result.close();track("indexedDB",false);}
    };
  }catch{track("indexedDB",false);}
  navigator.serviceWorker?.getRegistration().then(reg=>{
    track("registration",reg?"registered":"none");
  }).catch(()=>track("registration","unavailable"));
  const controller=()=>{
    const worker=navigator.serviceWorker?.controller;
    if(!worker){track("controllerRelease","none");return;}
    const channel=new MessageChannel();
    channel.port1.onmessage=event=>{
      const release=event.data?.release;
      if(/^\d{8}-\d+$/.test(release||"")){
        track("controllerRelease",release);
        track("cache",`runtime-fallback-${release}`);
      }
      channel.port1.close();
    };
    const release=new URL(worker.scriptURL).searchParams.get("v");
    track("controllerRelease",/^\d{8}-\d+$/.test(release||"")?release:"unknown");
    worker.postMessage({type:"GET_RELEASE"},[channel.port2]);
    setTimeout(()=>channel.port1.close(),1500);
  };
  navigator.serviceWorker?.addEventListener("controllerchange",controller);
  controller();
  if("caches" in window){
    const name=`p708-debug-probe-${Math.random().toString(36).slice(2)}`;
    const path=new URL("./p708-debug-probe",location.href);
    caches.open(name).then(async cache=>{
      await cache.put(path.href,new Response("1"));
      track("cacheStorage",(await (await cache.match(path.href))?.text())==="1");
    }).catch(()=>track("cacheStorage",false)).finally(()=>caches.delete(name).catch(()=>{}));
  }else track("cacheStorage",false);
  fetch("./p708-build.json",{cache:"no-store",credentials:"omit"}).then(async response=>{
    if(!response.ok||!response.headers.get("content-type")?.includes("json"))return;
    const info=await response.json();
    if(/^\d{8}-\d+$/.test(info.release||""))track("serverRelease",info.release);
    if(/^[0-9a-f]{7,40}$/.test(info.commit||""))track("build",info.commit);
  }).catch(()=>{});
})();
