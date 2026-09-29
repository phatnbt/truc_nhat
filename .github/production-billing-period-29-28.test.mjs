import assert from "node:assert/strict";
import { migrateBillingPeriods } from "./production-billing-period-migration-lib.mjs";

const original={billingMonths:{
  "2026-08":{month:"2026-08",people:{}},
  "2026-09":{month:"2026-09",cycleMode:"28-27",cycleStart:"2026-08-30",cycleEnd:"2026-09-29",cycleCustomized:false,people:{
    "person:p1":{id:"p1",days:{"29":true,"30":true,"2026-09-10":true}}
  }},
  "2026-10":{month:"2026-10",cycleMode:"28-27",cycleStart:"2026-09-30",cycleEnd:"2026-10-29",people:{}}
}};
const migrated=migrateBillingPeriods(original,{updatedAt:"2026-09-29T00:00:00.000Z"});

assert.deepEqual(migrated.changedMonths,["2026-09","2026-10"]);
assert.equal(migrated.payload.billingMonths["2026-08"].cycleStart,undefined,"legacy months before cutover must stay untouched");
assert.equal(migrated.payload.billingMonths["2026-09"].cycleStart,"2026-08-29");
assert.equal(migrated.payload.billingMonths["2026-09"].cycleEnd,"2026-09-28");
assert.equal(migrated.payload.billingMonths["2026-10"].cycleStart,"2026-09-29");
assert.equal(migrated.payload.billingMonths["2026-10"].cycleEnd,"2026-10-28");
assert.equal(migrated.payload.billingMonths["2026-09"].people["person:p1"].days["2026-08-29"],true,"legacy true days must be preserved");
assert.equal(migrated.payload.billingMonths["2026-09"].people["person:p1"].days["2026-09-10"],true,"date-keyed stay data must be preserved");
assert.ok(migrated.beforeMonths["2026-09"],"the previous billing record must be available for backup");
assert.deepEqual(migrateBillingPeriods(migrated.payload).changedMonths,[],"the production migration must be idempotent");
assert.equal(original.billingMonths["2026-09"].cycleStart,"2026-08-30","the migration must not mutate its input");

console.log("Production billing period 29→28 migration tests passed");
