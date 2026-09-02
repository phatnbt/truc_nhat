import assert from "node:assert/strict";
import fs from "node:fs";

const store=fs.readFileSync("src/core/cleaning-schedule-store.js","utf8");
const fix=fs.readFileSync("src/features/cleaning-delete-fix.js","utf8");

// Regression root cause: omitting a nested key from a map written with merge:true
// does NOT express a Firestore delete. The store must use deleteField on an exact path.
assert.match(store,/deleteField/);
assert.match(store,/new FieldPath\("payload","schedules",weekStart\), deleteField\(\)/);
assert.doesNotMatch(store,/delete payload\.schedules\[weekStart\][\s\S]*tx\.set\([\s\S]*\{merge:true\}/);

// A server-side tombstone must exist so stale devices/snapshots cannot resurrect a week.
assert.match(store,/"payload","_sync","deletedSchedules",weekStart/);
assert.match(fix,/deletedSchedules/);
assert.match(fix,/for\(const weekStart of Object\.keys\(deleted\)\)delete clean\.schedules\[weekStart\]/);

// Explicit recreation is the only path that clears the tombstone.
assert.match(store,/restoreScheduleWeek/);
assert.match(fix,/restoreScheduleWeek/);

// Pure behavioral model: stale schedule + tombstone => no visible schedule.
const serverShape={
  schedules:{
    "2026-09-01":{id:"schedule-old",weekStart:"2026-09-01"},
    "2026-09-08":{id:"schedule-next",weekStart:"2026-09-08"}
  },
  _sync:{deletedSchedules:{"2026-09-01":{deletedAt:"2026-09-02T00:00:00.000Z"}}}
};
const visible=structuredClone(serverShape);
for(const week of Object.keys(visible._sync.deletedSchedules))delete visible.schedules[week];
assert.deepEqual(Object.keys(visible.schedules),["2026-09-08"]);

console.log("Cleaning schedule deletion/tombstone regression tests passed.");
