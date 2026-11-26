const FIREBASE_RUNTIME_ENDPOINT="/__/firebase/init.json";
const FIREBASE_RUNTIME_FALLBACK="https://p708-room-manager.web.app/firebase-config.runtime.json";
const IS_LOCAL=["localhost","127.0.0.1","[::1]"].includes(location.hostname);
const LOADER_RELEASE="20261127-14";
const boot=globalThis.P708Boot;

const coreParts=[
  "../core/app-core1.js",
  "../core/app-core2.js",
  "../features/app-actions1.js",
  "../features/app-actions2.js",
  "../features/cleaning-delete-fix.js",
  "../features/app-dashboard.js",
  "../features/app-render.js",
  "../features/app-integrity-fixes.js",
  "../features/inactive-mapping-dedup-fix.js",
  "../features/canonical-identity-repair.js",
  "../features/billing-membership-exclusion.js",
  "../features/billing-cycle-history.js",
  "../features/billing-canonical-repair.js",
  "../features/today-calendar.js",
  "../features/room-resources.js",
  "./app-start.js"
];
const optionalParts=[
  "../features/cleaning-pet-streak.js",
  "../features/home-enhancements.js",
  "../features/home-pet-garden.js",
  "../features/ui-icon-polish.js",
  "../features/notification-enhancements.js",
  "../features/mobile-install-bridge.js",
  "../features/mobile-install-guide.js"
];

function bootError(bootCode){return Object.assign(new Error(bootCode),{bootCode});}
function validFirebaseConfig(config){
  return !!config&&typeof config==="object"
    &&typeof config.apiKey==="string"&&config.apiKey.length>10
    &&typeof config.authDomain==="string"&&config.authDomain.length>3
    &&typeof config.projectId==="string"&&config.projectId.length>2
    &&typeof config.appId==="string"&&config.appId.length>5;
}

async function fetchFirebaseConfig(url,{sameOrigin=false}={}){
  const controller=typeof AbortController==="function"?new AbortController():null;
  const timeout=controller?setTimeout(()=>controller.abort(),6000):null;
  try{
    const response=await fetch(url,{cache:"no-store",signal:controller?.signal,
      credentials:sameOrigin?"same-origin":"omit",mode:sameOrigin?"same-origin":"cors",headers:{Accept:"application/json"}});
    if(!response.ok)throw bootError("config-http");
    if(!response.headers.get("content-type")?.includes("json"))throw bootError("config-mime");
    const config=await response.json();
    if(!validFirebaseConfig(config))throw bootError("config-invalid");
    if(config.projectId!=="p708-room-manager")throw bootError("config-project");
    return Object.freeze({...config});
  }finally{if(timeout)clearTimeout(timeout);}
}

async function loadFirebaseRuntimeConfig(){
  const override=globalThis.P708_FIREBASE_CONFIG_OVERRIDE;
  if(validFirebaseConfig(override))return Object.freeze({...override});
  if(IS_LOCAL)return Object.freeze({
    projectId:"demo-p708-production-audit",apiKey:"demo-p708-emulator-key",authDomain:"localhost",appId:"demo-p708-app"
  });
  const isFirebaseHosting=["p708-room-manager.web.app","p708-room-manager.firebaseapp.com"].includes(location.hostname);
  if(isFirebaseHosting){
    try{return await fetchFirebaseConfig(FIREBASE_RUNTIME_ENDPOINT,{sameOrigin:true});}
    catch{return fetchFirebaseConfig("./firebase-config.runtime.json",{sameOrigin:true});}
  }
  return fetchFirebaseConfig(FIREBASE_RUNTIME_FALLBACK);
}

async function loadDependencies(){
  const [engine,auth,repair,mapping,billing,fairness,streak,expense,schedules]=await Promise.all([
    import("../core/p708-secure-sync-engine.js?v=20261127-14"),
    import("../core/mobile-auth-policy.js?v=20261127-14"),
    import("../core/p708-authoritative-repair.js?v=20261127-14"),
    import("../core/p708-canonical-mapping-repair.js?v=20261127-14"),
    import("../core/billing-cycle-period.js?v=20261127-14"),
    import("../core/cleaning-fairness.js?v=20261127-14"),
    import("../core/cleaning-streak.js?v=20261127-14"),
    import("../core/expense-split.js?v=20261127-14"),
    import("../core/cleaning-schedule-store.js?v=20261127-14")
  ]);
  let externalWrites=0;
  const trackExternal=operation=>async(...args)=>{
    externalWrites++;
    try{return await operation(...args);}
    finally{externalWrites--;}
  };
  Object.assign(globalThis,{
    createP708SecureEngine:engine.createP708SecureEngine,P708MobileAuth:auth,
    P708HasExternalWrites:()=>externalWrites>0,
    createP708AuthoritativeRepair(options){
      const service=repair.createP708AuthoritativeRepair(options);
      return {...service,commit:trackExternal(service.commit)};
    },
    createP708CanonicalMappingRepair(options){
      const service=mapping.createP708CanonicalMappingRepair(options);
      return {...service,repair:trackExternal(service.repair)};
    },
    P708BillingCycle:billing,P708CleaningFairness:fairness,P708CleaningStreak:streak,
    splitVnd:expense.splitVnd,deleteScheduleAuthoritatively:trackExternal(schedules.deleteScheduleAuthoritatively)
  });
}

async function loadParts(parts,{optional=false}={}){
  const urls=parts.map(path=>new URL(`${path}?v=${LOADER_RELEASE}`,import.meta.url).href);
  let loadedParts=0;
  const crashed=new Set();
  const onError=event=>{if(urls.includes(event.filename))crashed.add(event.filename);};
  window.addEventListener("error",onError);
  try{
    const results=await Promise.all(urls.map(url=>new Promise(resolve=>{
      const script=document.createElement("script");
      script.src=url;
      // Classic dependencies download in parallel and execute in insertion order.
      script.async = false;
      const timeout=setTimeout(()=>finish(false),optional?6000:12000);
      function finish(ok){
        clearTimeout(timeout);
        script.onload=script.onerror=null;
        if(!ok)script.remove();
        resolve(ok);
      }
      script.onload=()=>{
        const ok=!crashed.has(url);
        if(ok&&!optional){
          loadedParts++;
          globalThis.P708SetBootProgress?.("Đang nạp giao diện…",`Đã tải ${loadedParts}/${urls.length} thành phần.`);
        }
        finish(ok);
      };
      script.onerror=()=>finish(false);
      document.head.appendChild(script);
    })));
    return results.every(Boolean);
  }finally{window.removeEventListener("error",onError);}
}

export async function startApplication(){
  if(globalThis.P708_RELEASE!==LOADER_RELEASE)throw bootError("release-mismatch");
  globalThis.P708Debug?.("loader",LOADER_RELEASE);
  if(/^p708-room-manager--[^.]+\.web\.app$/.test(location.hostname)){
    const gate=document.querySelector("#authGateContent");
    gate.innerHTML='<h2>Bản kiểm tra P708</h2><p><a href="./ios-diagnostics.html">Kiểm tra thiết bị</a></p>';
    globalThis.P708Debug?.("firebase","preview-disabled");
    boot?.mark("APP_READY","INFO","preview-shell");
    window.dispatchEvent(new Event("p708:boot-ready"));
    try{
      void navigator.serviceWorker?.register(new URL("../../sw.js",import.meta.url),{updateViaCache:"none"})
        .catch(()=>globalThis.P708Debug?.("registration","failed"));
    }catch{globalThis.P708Debug?.("registration","failed");}
    return;
  }

  boot?.mark("CONFIG_FETCHED","START");
  globalThis.P708SetBootProgress?.("Đang kết nối dữ liệu…","Đang lấy cấu hình phòng P708.");
  globalThis.P708Debug?.("firebase","config-loading");
  try{globalThis.P708_FIREBASE_CONFIG=await loadFirebaseRuntimeConfig();}
  catch(error){throw bootError(error?.bootCode||"config-fetch");}
  boot?.mark("CONFIG_FETCHED");
  globalThis.P708Debug?.("firebase","config-ready");

  boot?.mark("FIREBASE_READY","START");
  try{await loadDependencies();}
  catch{throw bootError("sdk-dependencies");}
  boot?.mark("CORE_READY","START");
  globalThis.P708SetBootProgress?.("Đang nạp giao diện…","Đang chuẩn bị lịch trực và điện nước.");
  if(!await loadParts(coreParts)||typeof globalThis.P708StartApplication!=="function")throw bootError("core-script");
  boot?.mark("CORE_READY");
  try{await globalThis.P708StartApplication();}
  catch{throw bootError("core-start");}

  boot?.mark("FEATURES_READY","INFO","optional-loading");
  const ok=await loadParts(optionalParts,{optional:true});
  globalThis.P708FinishOptionalFeatures();
  boot?.mark("FEATURES_READY","INFO",ok?"optional-ready":"optional-unavailable");
}
