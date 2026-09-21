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
assert.match(widget,/requestAnimationFrame/);
assert.match(widget,/localStorage\.setItem/);
assert.match(widget,/snap:true/);
assert.match(widget,/P708PetWidget/);
assert.match(widget,/petDashboard/);
assert.match(widget,/petCheckInButton/);
assert.match(widget,/petEvolutionGrid/);
assert.match(widget,/petNextPreview/);
assert.match(widget,/eligibleActivityId/);
assert.match(widget,/pet-hop/);
assert.match(widget,/pet-level-burst/);
assert.match(widget,/function ownMemberId\(\)/);
assert.match(widget,/S\.normalizePetStatus/);

assert.match(garden,/homePetGarden/);
assert.match(garden,/Bộ sưu tập tiến hóa/);
assert.match(garden,/stageCollection/);
assert.match(garden,/openMyPetButton/);
assert.match(garden,/P708PetWidget\?\.open/);

assert.match(css,/\.floating-pet-host/);
assert.match(css,/translate3d/);
assert.match(css,/\.home-pet-garden/);
assert.match(css,/\.pet-garden-grid/);
assert.match(css,/touch-action:none/);
assert.match(css,/--pet-safe-bottom/);
assert.match(css,/@keyframes pet-idle/);
assert.match(css,/@keyframes pet-level-burst/);
assert.match(css,/\.pet-dashboard/);
assert.match(css,/\.pet-evolution-grid/);
assert.match(css,/\.pet-next-preview/);

// Runtime version may advance for unrelated UI/security fixes. Verify the features
// are still part of the boot graph and PWA shell instead of pinning an old version.
assert.match(loader,/home-pet-garden\.js\?v=\d{8}-\d+/);
assert.match(loader,/cleaning-pet-streak\.js\?v=\d{8}-\d+/);
assert.match(sw,/home-pet-garden\.js/);
assert.match(sw,/cleaning-pet-streak\.js/);
assert.match(sw,/cleaning-pet\.css/);
for(const asset of ["cloud-sprout.svg","cloud-cat.svg","cloud-guardian.svg","cloud-celestial.svg"]){
  assert.ok(fs.existsSync(`icons/pets/${asset}`),`missing ${asset}`);
  assert.match(sw,new RegExp(asset.replace(".","\\.")));
}

console.log("Pet ownership isolation and compact pet UI regression tests passed.");
