import { createP708SecureEngine } from "../core/p708-secure-sync-engine.js?v=20261127-10";
import * as P708MobileAuth from "../core/mobile-auth-policy.js?v=20261127-10";
import { createP708AuthoritativeRepair } from "../core/p708-authoritative-repair.js?v=20261127-10";
import { createP708CanonicalMappingRepair } from "../core/p708-canonical-mapping-repair.js?v=20261127-10";
import * as P708BillingCycle from "../core/billing-cycle-period.js?v=20261127-10";
import * as P708CleaningFairness from "../core/cleaning-fairness.js?v=20261127-10";
import * as P708CleaningStreak from "../core/cleaning-streak.js?v=20261127-10";
import { splitVnd } from "../core/expense-split.js?v=20261127-10";
import { deleteScheduleAuthoritatively } from "../core/cleaning-schedule-store.js?v=20261127-10";

const FIREBASE_RUNTIME_ENDPOINT="/__/firebase/init.json";
const FIREBASE_RUNTIME_FALLBACK="https://p708-room-manager.web.app/firebase-config.runtime.json";
const IS_LOCAL=["localhost","127.0.0.1","[::1]"].includes(location.hostname);
const LOADER_RELEASE="20261127-10";
if(globalThis.P708_RELEASE!==LOADER_RELEASE)throw new Error("release-mismatch");
globalThis.P708Debug?.("loader",LOADER_RELEASE);

function validFirebaseConfig(config){
  return !!config
    && typeof config==="object"
    && typeof config.apiKey==="string"
    && config.apiKey.length>10
    && typeof config.authDomain==="string"
    && config.authDomain.length>3
    && typeof config.projectId==="string"
    && config.projectId.length>2
    && typeof config.appId==="string"
    && config.appId.length>5;
}

async function fetchFirebaseConfig(url,{sameOrigin=false}={}){
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),6000);
  try{
    const response=await fetch(url,{
      cache:"no-store",
      signal:controller.signal,
      credentials:sameOrigin?"same-origin":"omit",
      mode:sameOrigin?"same-origin":"cors",
      headers:{Accept:"application/json"}
    });
    if(!response.ok)throw new Error(`${response.status}`);
    const config=await response.json();
    if(!validFirebaseConfig(config))throw new Error("invalid-config");
    return Object.freeze({...config});
  }finally{clearTimeout(timeout);}
}

async function loadFirebaseRuntimeConfig(){
  const override=globalThis.P708_FIREBASE_CONFIG_OVERRIDE;
  if(validFirebaseConfig(override))return Object.freeze({...override});
  if(IS_LOCAL)return Object.freeze({
    projectId:"demo-p708-production-audit",apiKey:"demo-p708-emulator-key",
    authDomain:"localhost",appId:"demo-p708-app"
  });

  const isFirebaseHosting=["p708-room-manager.web.app","p708-room-manager.firebaseapp.com"].includes(location.hostname);
  if(isFirebaseHosting){
    try{
      return await fetchFirebaseConfig(FIREBASE_RUNTIME_ENDPOINT,{sameOrigin:true});
    }catch{
      return fetchFirebaseConfig("./firebase-config.runtime.json",{sameOrigin:true});
    }
  }

  return fetchFirebaseConfig(FIREBASE_RUNTIME_FALLBACK);
}

if(/^p708-room-manager--[^.]+\.web\.app$/.test(location.hostname)){
  const gate=document.querySelector("#authGateContent");
  gate.replaceChildren(Object.assign(document.createElement("h2"),{textContent:"Bản kiểm tra P708"}),
    Object.assign(document.createElement("p"),{textContent:"Hosting xem trước chỉ dùng để kiểm tra phiên bản và tài nguyên."}));
  globalThis.P708Debug?.("firebase","preview-disabled");
  window.dispatchEvent(new Event("p708:boot-ready"));
  navigator.serviceWorker?.register(new URL("../../sw.js",import.meta.url),{updateViaCache:"none"})
    .catch(()=>globalThis.P708Debug?.("registration","failed"));
}else{
globalThis.P708SetBootProgress?.("Đang kết nối dữ liệu…","Đang xác nhận cấu hình an toàn của phòng P708.");
globalThis.P708Debug?.("firebase","config-loading");
globalThis.P708_FIREBASE_CONFIG=await loadFirebaseRuntimeConfig();
globalThis.P708Debug?.("firebase","config-ready");
globalThis.createP708SecureEngine = createP708SecureEngine;
globalThis.P708MobileAuth=P708MobileAuth;
let externalWrites=0;
const trackExternal=operation=>async(...args)=>{
  externalWrites++;
  try{return await operation(...args);}
  finally{externalWrites--;}
};
globalThis.P708HasExternalWrites=()=>externalWrites>0;
globalThis.createP708AuthoritativeRepair = options=>{
  const service=createP708AuthoritativeRepair(options);
  return {...service,commit:trackExternal(service.commit)};
};
globalThis.createP708CanonicalMappingRepair = options=>{
  const service=createP708CanonicalMappingRepair(options);
  return {...service,repair:trackExternal(service.repair)};
};
globalThis.P708BillingCycle = P708BillingCycle;
globalThis.P708CleaningFairness = P708CleaningFairness;
globalThis.P708CleaningStreak = P708CleaningStreak;
globalThis.splitVnd = splitVnd;
globalThis.deleteScheduleAuthoritatively = trackExternal(deleteScheduleAuthoritatively);

const parts = [
  "../core/app-core1.js?v=20261127-10",
  "../core/app-core2.js?v=20261127-10",
  "../features/app-actions1.js?v=20261127-10",
  "../features/app-actions2.js?v=20261127-10",
  "../features/cleaning-delete-fix.js?v=20261127-10",
  "../features/app-dashboard.js?v=20261127-10",
  "../features/app-render.js?v=20261127-10",
  "../features/cleaning-pet-streak.js?v=20261127-10",
  "../features/app-integrity-fixes.js?v=20261127-10",
  "../features/inactive-mapping-dedup-fix.js?v=20261127-10",
  "../features/canonical-identity-repair.js?v=20261127-10",
  "../features/billing-membership-exclusion.js?v=20261127-10",
  "../features/billing-cycle-history.js?v=20261127-10",
  "../features/billing-canonical-repair.js?v=20261127-10",
  "../features/home-enhancements.js?v=20261127-10",
  "../features/home-pet-garden.js?v=20261127-10",
  "../features/ui-icon-polish.js?v=20261127-10",
  "../features/today-calendar.js?v=20261127-10",
  "../features/room-resources.js?v=20261127-10",
  "../features/notification-enhancements.js?v=20261127-10",
  "./app-start.js?v=20261127-10",
  "../features/mobile-install-bridge.js?v=20261127-10",
  "../features/mobile-install-guide.js?v=20261127-10"
];

let loadedParts=0;
globalThis.P708SetBootProgress?.("Đang nạp giao diện…",`Đã tải 0/${parts.length} thành phần.`);
  const partUrls=parts.map(src=>new URL(src,import.meta.url).href);
let partCrashed=false;
const watchPartErrors=event=>{if(partUrls.includes(event.filename))partCrashed=true;};
window.addEventListener("error",watchPartErrors);
try{await Promise.all(partUrls.map(src=>new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    // Dynamic classic scripts with async=false download concurrently but execute
    // in insertion order, preserving the existing dependency chain.
    script.async = false;
    script.onload = ()=>{loadedParts++;globalThis.P708SetBootProgress?.("Đang nạp giao diện…",`Đã tải ${loadedParts}/${parts.length} thành phần.`);resolve();};
    script.onerror = () => reject(new Error(`Không thể tải ${src}`));
    document.head.appendChild(script);
  })));}finally{window.removeEventListener("error",watchPartErrors);}
  if(partCrashed||typeof globalThis.P708StartApplication!=="function")throw new Error("Classic startup component failed");
  globalThis.P708StartApplication();
}
