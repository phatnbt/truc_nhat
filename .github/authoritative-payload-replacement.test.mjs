import fs from "node:fs";
import assert from "node:assert/strict";

const repairSource=fs.readFileSync("src/core/p708-authoritative-repair.js","utf8");
const migrationSource=fs.readFileSync(".github/production-data-repair.mjs","utf8");

assert.match(
  repairSource,
  /if\(roomSnap\.exists\(\)\)tx\.update\(roomRef,roomWrite\);/,
  "authoritative repair must replace the top-level payload field with update(), not recursively merge stale nested map keys"
);
assert.doesNotMatch(
  repairSource,
  /payload:desired[\s\S]{0,240}\{merge:true\}/,
  "authoritative payload writes must never use merge:true because omitted member:/person: keys must be deleted"
);
assert.match(
  migrationSource,
  /canonicalRowKey=person=>`person:/,
  "production repair must canonicalize billing rows to person:<personId> keys"
);
assert.match(
  migrationSource,
  /excludedMemberIds/,
  "production repair must respect per-month excluded member tombstones"
);
assert.match(
  migrationSource,
  /excludedMemberKeys/,
  "production repair must respect name-based month exclusions for legacy rows"
);

console.log("Authoritative payload replacement regression QA PASSED");
