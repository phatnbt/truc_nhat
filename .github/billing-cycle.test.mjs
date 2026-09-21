import assert from "node:assert/strict";
import fs from "node:fs";
import {
  BILLING_CYCLE_CUTOVER_MONTH,
  BILLING_CYCLE_START_DAY,
  BILLING_CYCLE_END_DAY,
  MAX_CUSTOM_PERIOD_DAYS,
  assertBillingPeriodUpdate,
  cycleBounds,
  currentPeriodMonth,
  dateRangeKeys,
  formatDateRange,
  isCycleMonth,
  periodDateKeys,
  rangesOverlap,
  resolveCycleBounds,
  shiftMonth
} from "../src/core/billing-cycle-period.js";

assert.equal(BILLING_CYCLE_CUTOVER_MONTH,"2026-09");
assert.equal(BILLING_CYCLE_START_DAY,30);
assert.equal(BILLING_CYCLE_END_DAY,29);
assert.equal(MAX_CUSTOM_PERIOD_DAYS,62);
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

// Trưởng phòng có thể chỉnh riêng từng kỳ mà không làm đổi quy ước mặc định.
const custom=resolveCycleBounds("2026-10","2026-10-03","2026-11-01");
assert.deepEqual(custom,{month:"2026-10",start:"2026-10-03",end:"2026-11-01",endExclusive:"2026-11-02"});
const customDates=periodDateKeys("2026-10",custom);
assert.equal(customDates[0],"2026-10-03");
assert.equal(customDates.at(-1),"2026-11-01");
assert.equal(customDates.length,30);
assert.equal(cycleBounds("2026-10").start,"2026-09-30","custom range must not mutate the default rule");
assert.equal(dateRangeKeys("2026-02-30","2026-03-01").length,0,"invalid calendar dates must be rejected");
assert.equal(dateRangeKeys("2026-10-05","2026-10-04").length,0,"reversed ranges must be rejected");
assert.equal(dateRangeKeys("2026-01-01","2026-03-03").length,62);
assert.equal(dateRangeKeys("2026-01-01","2026-03-04").length,0,"ranges over the safety limit must be rejected");
assert.equal(rangesOverlap("2026-09-30","2026-10-29","2026-10-29","2026-11-29"),true,"shared boundary dates overlap");
assert.equal(rangesOverlap("2026-09-30","2026-10-28","2026-10-29","2026-11-29"),false);
assert.equal(formatDateRange("2026-10-03","2026-11-01"),"03/10/2026 – 01/11/2026");

const baseBill={month:"2026-10",cycleMode:"28-27",cycleStart:"2026-09-30",cycleEnd:"2026-10-29",closed:false,people:{}};
const updatedBill={...baseBill,cycleStart:"2026-10-01",cycleEnd:"2026-10-28"};
const updateAudit={action:"UPDATE_BILLING_PERIOD",periodMonth:"2026-10",expectedPeriodExists:true,expectedPeriodStart:"2026-09-30",expectedPeriodEnd:"2026-10-29"};
assert.equal(assertBillingPeriodUpdate({billingMonths:{"2026-10":baseBill}},{billingMonths:{"2026-10":updatedBill}},updateAudit),true);
assert.throws(()=>assertBillingPeriodUpdate(
  {billingMonths:{"2026-10":{...baseBill,cycleStart:"2026-10-02"}}},
  {billingMonths:{"2026-10":updatedBill}},updateAudit
),/thiết bị khác/,"a concurrent edit must not be overwritten");
assert.throws(()=>assertBillingPeriodUpdate(
  {billingMonths:{"2026-10":{...baseBill,closed:true}}},
  {billingMonths:{"2026-10":updatedBill}},updateAudit
),/đã được chốt/);
assert.throws(()=>assertBillingPeriodUpdate(
  {billingMonths:{"2026-10":{...baseBill,people:{p1:{paid:true,paidAmount:1000}}}}},
  {billingMonths:{"2026-10":updatedBill}},updateAudit
),/đã có thanh toán/);
assert.throws(()=>assertBillingPeriodUpdate(
  {billingMonths:{"2026-10":baseBill}},
  {billingMonths:{"2026-10":{...updatedBill,cycleEnd:"2026-10-30"},"2026-11":{month:"2026-11",cycleMode:"28-27",cycleStart:"2026-10-30",cycleEnd:"2026-11-29",people:{}}}},updateAudit
),/bị trùng/);

const feature=fs.readFileSync(new URL("../src/features/billing-cycle-history.js",import.meta.url),"utf8");
const secureEngine=fs.readFileSync(new URL("../src/core/p708-secure-sync-engine.js",import.meta.url),"utf8");
assert.ok(secureEngine.includes("assertBillingPeriodUpdate(serverPayload,mergedShape,audit)"),"period guard must run inside the Firestore transaction");
for(const required of [
  "Period.periodDateKeys",
  "billingPeriodPrev",
  "billingPeriodNext",
  "billingPeriodCurrent",
  "billingPeriodEdit",
  "UPDATE_BILLING_PERIOD",
  "overlappingCycleBill",
  "billHasPaymentRecords",
  "Keep valid historical date keys",
  "touchstart",
  "touchend",
  "Vuốt ngang",
  "data-billing-date",
  "Kỳ điện nước"
])assert.ok(feature.includes(required),`Missing billing cycle UI behavior: ${required}`);

console.log("Billing cycle 30→29 and swipe history regression tests passed");
