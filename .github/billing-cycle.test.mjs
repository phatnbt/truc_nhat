import assert from "node:assert/strict";
import fs from "node:fs";
import {
  BILLING_CYCLE_CUTOVER_MONTH,
  BILLING_CYCLE_START_DAY,
  BILLING_CYCLE_END_DAY,
  cycleBounds,
  currentPeriodMonth,
  isCycleMonth,
  periodDateKeys,
  shiftMonth
} from "../src/core/billing-cycle-period.js";

assert.equal(BILLING_CYCLE_CUTOVER_MONTH,"2026-09");
assert.equal(BILLING_CYCLE_START_DAY,30);
assert.equal(BILLING_CYCLE_END_DAY,29);
assert.equal(isCycleMonth("2026-08"),false);
assert.equal(isCycleMonth("2026-09"),true);
assert.deepEqual(cycleBounds("2026-09"),{
  month:"2026-09",
  start:"2026-08-30",
  end:"2026-09-29",
  endExclusive:"2026-09-30"
});

const september=periodDateKeys("2026-09");
assert.equal(september[0],"2026-08-30");
assert.equal(september.at(-1),"2026-09-29");
assert.equal(september.length,31);
assert.equal(new Set(september).size,september.length);

const october=periodDateKeys("2026-10");
assert.equal(october[0],"2026-09-30");
assert.equal(october.at(-1),"2026-10-29");
assert.equal(october.length,30);
assert.equal(september.at(-1),"2026-09-29");
assert.notEqual(september.at(-1),october[0]);

// Tháng 2 không có ngày 30: kỳ sau bắt đầu ngày 01/03 để không trùng/thiếu ngày.
const february2027=periodDateKeys("2027-02");
assert.equal(february2027[0],"2027-01-30");
assert.equal(february2027.at(-1),"2027-02-28");
assert.equal(february2027.length,30);

const march2027=periodDateKeys("2027-03");
assert.equal(march2027[0],"2027-03-01");
assert.equal(march2027.at(-1),"2027-03-29");
assert.equal(march2027.length,29);
assert.equal(new Set([...february2027,...march2027]).size,february2027.length+march2027.length);

const leapFebruary=periodDateKeys("2028-02");
assert.equal(leapFebruary[0],"2028-01-30");
assert.equal(leapFebruary.at(-1),"2028-02-29");
assert.equal(leapFebruary.length,31);

const leapMarch=periodDateKeys("2028-03");
assert.equal(leapMarch[0],"2028-03-01");
assert.equal(leapMarch.at(-1),"2028-03-29");
assert.equal(leapMarch.length,29);
assert.equal(new Set([...leapFebruary,...leapMarch]).size,leapFebruary.length+leapMarch.length);

assert.equal(shiftMonth("2026-12",1),"2027-01");
assert.equal(shiftMonth("2027-01",-1),"2026-12");
assert.equal(currentPeriodMonth(new Date(2026,7,29,12)),"2026-08");
assert.equal(currentPeriodMonth(new Date(2026,7,30,12)),"2026-09");

const feature=fs.readFileSync(new URL("../src/features/billing-cycle-history.js",import.meta.url),"utf8");
for(const required of [
  "Period.periodDateKeys",
  "billingPeriodPrev",
  "billingPeriodNext",
  "billingPeriodCurrent",
  "touchstart",
  "touchend",
  "Vuốt ngang",
  "data-billing-date",
  "Kỳ điện nước"
])assert.ok(feature.includes(required),`Missing billing cycle UI behavior: ${required}`);

console.log("Billing cycle 30→29 and swipe history regression tests passed");
