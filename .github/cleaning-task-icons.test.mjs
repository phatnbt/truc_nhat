import assert from "node:assert/strict";
import fs from "node:fs";

const core=fs.readFileSync(new URL("../src/core/app-core1.js",import.meta.url),"utf8");
const polish=fs.readFileSync(new URL("../src/features/ui-icon-polish.js",import.meta.url),"utf8");
const taskEmojis=[...core.matchAll(/emoji:"([^"]+)"/g)].map(match=>match[1]);

assert.ok(taskEmojis.length,"cleaning tasks must define icons");
for(const emoji of taskEmojis){
  assert.ok(polish.includes(`["${emoji}",`),`cleaning icon ${emoji} must map to the shared Bootstrap Icons set`);
  assert.ok(polish.includes(emoji),`cleaning icon ${emoji} must be included in the replacement pattern`);
}
assert.ok(polish.includes('["🧱","bricks"]'),"Chà tường must use the Bootstrap Icons bricks glyph");

console.log("Cleaning task icon consistency tests passed.");
