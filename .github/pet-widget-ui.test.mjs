import assert from "node:assert/strict";
import fs from "node:fs";

const widget=fs.readFileSync("src/features/cleaning-pet-streak.js","utf8");
const garden=fs.readFileSync("src/features/home-pet-garden.js","utf8");
const css=fs.readFileSync("cleaning-pet.css","utf8");
const loader=fs.readFileSync("src/boot/app-loader.js","utf8");
const sw=fs.readFileSync("sw.js","utf8");

assert.match(widget,/floatingPetHost/);
assert.match(widget,/pointerdown/);
assert.match(widget,/pointermove/);
assert.match(widget,/localStorage\.setItem/);
assert.match(widget,/snap:true/);
assert.match(widget,/P708PetWidget/);
assert.match(widget,/document\.querySelector\("#cleaningPetPanel"\)\?\.remove\(\)/);

assert.match(garden,/homePetGarden/);
assert.match(garden,/Vườn pet P708/);
assert.match(garden,/data-garden-member/);
assert.match(garden,/P708PetWidget\?\.selectMember/);

assert.match(css,/\.floating-pet-host/);
assert.match(css,/\.home-pet-garden/);
assert.match(css,/\.pet-garden-grid/);
assert.match(css,/touch-action:none/);
assert.match(css,/env\(safe-area-inset-bottom\)|--pet-safe-bottom/);

assert.match(loader,/home-pet-garden\.js\?v=20260907-2/);
assert.match(loader,/cleaning-pet-streak\.js\?v=20260907-2/);
assert.match(sw,/home-pet-garden\.js/);
assert.match(sw,/cleaning-pet\.css/);

console.log("Floating pet widget and home garden UI regression tests passed.");
