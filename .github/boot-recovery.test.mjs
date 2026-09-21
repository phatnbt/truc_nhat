import assert from "node:assert/strict";
import fs from "node:fs";

const index=fs.readFileSync(new URL("../index.html",import.meta.url),"utf8");
const start=fs.readFileSync(new URL("../src/boot/app-start.js",import.meta.url),"utf8");
const worker=fs.readFileSync(new URL("../sw.js",import.meta.url),"utf8");

assert.ok(index.includes("P708_BOOT_REPAIR_20260921_8"),"boot watchdog marker is required");
assert.ok(index.includes("setTimeout(showRecovery,10000)"),"a stalled boot must recover instead of hanging forever");
assert.ok(index.includes('item.scope===baseUrl'),"recovery must only unregister this app scope");
assert.ok(index.includes('key.startsWith("p708-manager-")'),"recovery must only clear this app cache family");
assert.ok(start.includes('window.dispatchEvent(new Event("p708:boot-ready"))'),"auth startup must cancel the watchdog");
assert.ok(start.includes('sw.js?v=20260921-8'),"service worker registration must use the current release");
assert.ok(worker.includes("async function cachedResponse"),"runtime assets need an offline cache fallback");
assert.ok(worker.includes("url.search"),"versioned asset requests must fall back to the precached unversioned asset");

console.log("Boot watchdog and stale-cache recovery QA PASSED");
