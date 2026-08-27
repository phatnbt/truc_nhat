import assert from "node:assert/strict";
import fs from "node:fs";
import {
  BILLING_CYCLE_CUTOVER_MONTH,
  cycleBounds,
  currentPeriodMonth,
  isCycleMonth,
  periodDateKeys,
  shiftMonth
} from "../src/core/billing-cycle-period.js";

assert.equal(BILLING_CYCLE_CUTOVER_MONTH,"2026-09");
assert.equal(isCycleMonth("2026-08"),false);
assert.equal(isCycleMonth("2026-09"),true);
assert.deepEqual(cycleBounds("2026-09"),{
  month:"2026-09",
  start:"2026-08-28",
  end:"2026-09-27",
  endExclusive:"2026-09-28"
});

const september=periodDateKeys("2026-09");
assert.equal(september[0],"2026-08-28");
assert.equal(september.at(-1),"2026-09-27");
assert.equal(september.length,31);
assert.equal(new Set(september).size,september.length);

const october=periodDateKeys("2026-10");
assert.equal(october[0],"2026-09-28");
assert.equal(october.at(-1),"2026-10-27");
assert.equal(september.at(-1),"2026-09-27");
assert.notEqual(september.at(-1),october[0]);

const march2027=periodDateKeys("2027-03");
assert.equal(march2027[0],"2027-02-28");
assert.equal(march2027.at(-1),"2027-03-27");
assert.equal(march2027.length,28);

const leapMarch=periodDateKeys("2028-03");
assert.equal(leapMarch[0],"2028-02-28");
assert.equal(leapMarch.includes("2028-02-29"),true);
assert.equal(leapMarch.at(-1),"2028-03-27");
assert.equal(leapMarch.length,29);

assert.equal(shiftMonth("2026-12",1),"2027-01");
assert.equal(shiftMonth("2027-01",-1),"2026-12");
assert.equal(currentPeriodMonth(new Date(2026,7,27,12)),"2026-08");
assert.equal(currentPeriodMonth(new Date(2026,7,28,12)),"2026-09");

const feature=fs.readFileSync(new URL("../src/features/billing-cycle-history.js",import.meta.url),"utf8");
for(const required of [
  "cycleMode:\"28-27\"",
  "billingPeriodPrev",
  "billingPeriodNext",
  "billingPeriodCurrent",
  "touchstart",
  "touchend",
  "Vuốt ngang",
  "data-billing-date",
  "Kỳ điện nước"
])assert.ok(feature.includes(required),`Missing billing cycle UI behavior: ${required}`);

console.log("Billing cycle 28→27 and swipe history regression tests passed");
