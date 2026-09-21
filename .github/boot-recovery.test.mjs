import assert from "node:assert/strict";
import fs from "node:fs";

const index=fs.readFileSync(new URL("../index.html",import.meta.url),"utf8");
const start=fs.readFileSync(new URL("../src/boot/app-start.js",import.meta.url),"utf8");
const worker=fs.readFileSync(new URL("../sw.js",import.meta.url),"utf8");

assert.ok(index.includes("P708_BOOT_REPAIR_20260921_9"),"boot watchdog marker is required");
assert.ok(index.includes("setTimeout(showRecovery,10000)"),"a stalled boot must recover instead of hanging forever");
assert.ok(index.includes("box.dataset.bootProgress"),"watchdog must cover a loader stalled after progress starts");
assert.ok(index.includes('item.scope===baseUrl'),"recovery must only unregister this app scope");
assert.ok(index.includes('key.startsWith("p708-manager-")'),"recovery must only clear this app cache family");
assert.ok(start.includes('window.dispatchEvent(new Event("p708:boot-ready"))'),"auth startup must cancel the watchdog");
assert.ok(start.includes('sw.js?v=20260921-9'),"service worker registration must use the current release");
assert.ok(worker.includes("async function cachedResponse"),"runtime assets need an offline cache fallback");
assert.ok(worker.includes("url.search"),"versioned asset requests must fall back to the precached unversioned asset");

const loader=fs.readFileSync(new URL("../src/boot/app-loader.js",import.meta.url),"utf8");
assert.ok(loader.includes("await Promise.all(parts.map"),"classic scripts must download in parallel");
assert.ok(loader.includes("script.async = false"),"parallel downloads must preserve execution order");
assert.ok(loader.includes("isFirebaseHosting"),"GitHub Pages must skip the guaranteed Firebase init 404");
assert.ok(loader.includes("loadedParts"),"startup must show real loading progress");

console.log("Boot watchdog and stale-cache recovery QA PASSED");
