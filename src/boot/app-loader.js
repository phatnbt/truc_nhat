import { createP708SecureEngine } from "../core/p708-secure-sync-engine.js?v=20260907-7";
import { createP708AuthoritativeRepair } from "../core/p708-authoritative-repair.js?v=20260907-7";
import { createP708CanonicalMappingRepair } from "../core/p708-canonical-mapping-repair.js?v=20260907-7";
import * as P708BillingCycle from "../core/billing-cycle-period.js?v=20260907-7";
import * as P708CleaningFairness from "../core/cleaning-fairness.js?v=20260907-7";
import * as P708CleaningStreak from "../core/cleaning-streak.js?v=20260907-7";
import { deleteScheduleAuthoritatively, restoreScheduleWeek } from "../core/cleaning-schedule-store.js?v=20260907-7";

globalThis.createP708SecureEngine = createP708SecureEngine;
globalThis.createP708AuthoritativeRepair = createP708AuthoritativeRepair;
globalThis.createP708CanonicalMappingRepair = createP708CanonicalMappingRepair;
globalThis.P708BillingCycle = P708BillingCycle;
globalThis.P708CleaningFairness = P708CleaningFairness;
globalThis.P708CleaningStreak = P708CleaningStreak;
globalThis.deleteScheduleAuthoritatively = deleteScheduleAuthoritatively;
globalThis.restoreScheduleWeek = restoreScheduleWeek;

const parts = [
  "../core/app-core1.js?v=20260907-7",
  "../core/app-core2.js?v=20260907-7",
  "../features/app-actions1.js?v=20260907-7",
  "../features/cleaning-fairness-upgrade.js?v=20260907-7",
  "../features/app-actions2.js?v=20260907-7",
  "../features/cleaning-delete-fix.js?v=20260907-7",
  "../features/app-dashboard.js?v=20260907-7",
  "../features/app-render.js?v=20260907-7",
  "../features/cleaning-pet-streak.js?v=20260907-7",
  "../features/app-integrity-fixes.js?v=20260907-7",
  "../features/inactive-mapping-dedup-fix.js?v=20260907-7",
  "../features/canonical-identity-repair.js?v=20260907-7",
  "../features/billing-membership-exclusion.js?v=20260907-7",
  "../features/billing-cycle-history.js?v=20260907-7",
  "../features/billing-canonical-repair.js?v=20260907-7",
  "../features/home-enhancements.js?v=20260907-7",
  "../features/home-pet-garden.js?v=20260907-7",
  "../features/ui-icon-polish.js?v=20260907-7",
  "./app-start.js?v=20260907-7",
  "../features/notification-enhancements.js?v=20260907-7",
  "../features/today-calendar.js?v=20260907-7",
  "../features/mobile-install-bridge.js?v=20260907-7",
  "../features/mobile-install-guide.js?v=20260907-7"
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
