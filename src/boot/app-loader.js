import { createP708SecureEngine } from "../core/p708-secure-sync-engine.js?v=20260913-1";
import { createP708AuthoritativeRepair } from "../core/p708-authoritative-repair.js?v=20260913-1";
import { createP708CanonicalMappingRepair } from "../core/p708-canonical-mapping-repair.js?v=20260913-1";
import * as P708BillingCycle from "../core/billing-cycle-period.js?v=20260913-1";
import * as P708CleaningFairness from "../core/cleaning-fairness.js?v=20260921-1";
import * as P708CleaningStreak from "../core/cleaning-streak.js?v=20260921-3";
import { deleteScheduleAuthoritatively, restoreScheduleWeek } from "../core/cleaning-schedule-store.js?v=20260913-1";

const FIREBASE_RUNTIME_ENDPOINT="/__/firebase/init.json";
const FIREBASE_RUNTIME_FALLBACK="https://p708-room-manager.web.app/firebase-config.runtime.json";

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
  const response=await fetch(url,{
    cache:"no-store",
    credentials:sameOrigin?"same-origin":"omit",
    mode:sameOrigin?"same-origin":"cors",
    headers:{Accept:"application/json"}
  });
  if(!response.ok)throw new Error(`${response.status}`);
  const config=await response.json();
  if(!validFirebaseConfig(config))throw new Error("invalid-config");
  return Object.freeze({...config});
}

async function loadFirebaseRuntimeConfig(){
  const override=globalThis.P708_FIREBASE_CONFIG_OVERRIDE;
  if(validFirebaseConfig(override))return Object.freeze({...override});

  const errors=[];
  try{
    return await fetchFirebaseConfig(FIREBASE_RUNTIME_ENDPOINT,{sameOrigin:true});
  }catch(error){
    errors.push(`same-origin:${error?.message||"error"}`);
  }

  try{
    return await fetchFirebaseConfig(FIREBASE_RUNTIME_FALLBACK);
  }catch(error){
    errors.push(`firebase-hosting:${error?.message||"error"}`);
  }

  throw new Error(`Không tải được cấu hình Firebase runtime (${errors.join(", ")}).`);
}

globalThis.P708_FIREBASE_CONFIG=await loadFirebaseRuntimeConfig();
globalThis.createP708SecureEngine = createP708SecureEngine;
globalThis.createP708AuthoritativeRepair = createP708AuthoritativeRepair;
globalThis.createP708CanonicalMappingRepair = createP708CanonicalMappingRepair;
globalThis.P708BillingCycle = P708BillingCycle;
globalThis.P708CleaningFairness = P708CleaningFairness;
globalThis.P708CleaningStreak = P708CleaningStreak;
globalThis.deleteScheduleAuthoritatively = deleteScheduleAuthoritatively;
globalThis.restoreScheduleWeek = restoreScheduleWeek;

const parts = [
  "../core/app-core1.js?v=20260921-1",
  "../core/app-core2.js?v=20260913-1",
  "../features/app-actions1.js?v=20260921-2",
  "../features/cleaning-fairness-upgrade.js?v=20260921-1",
  "../features/app-actions2.js?v=20260921-1",
  "../features/cleaning-delete-fix.js?v=20260913-1",
  "../features/app-dashboard.js?v=20260913-1",
  "../features/app-render.js?v=20260921-2",
  "../features/cleaning-pet-streak.js?v=20260921-3",
  "../features/app-integrity-fixes.js?v=20260913-1",
  "../features/inactive-mapping-dedup-fix.js?v=20260913-1",
  "../features/canonical-identity-repair.js?v=20260913-1",
  "../features/billing-membership-exclusion.js?v=20260913-1",
  "../features/billing-cycle-history.js?v=20260913-1",
  "../features/billing-canonical-repair.js?v=20260913-1",
  "../features/home-enhancements.js?v=20260913-1",
  "../features/home-pet-garden.js?v=20260921-3",
  "../features/ui-icon-polish.js?v=20260913-2",
  "./app-start.js?v=20260921-1",
  "../features/notification-enhancements.js?v=20260913-1",
  "../features/today-calendar.js?v=20260913-1",
  "../features/mobile-install-bridge.js?v=20260913-1",
  "../features/mobile-install-guide.js?v=20260913-1"
];

for (const src of parts) {
  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = new URL(src, import.meta.url).href;
    script.async = false;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Không thể tải ${src}`));
    document.head.appendChild(script);
  });
}
