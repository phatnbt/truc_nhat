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
assert.match(widget,/document\.querySelector\("#cleaningPetPanel"\)\?\.remove\(\)/);
assert.match(widget,/document\.querySelector\("#petFloatCard"\)\?\.remove\(\)/);
assert.doesNotMatch(widget,/class="pet-float-card"/);
assert.match(widget,/pet-hop/);
assert.match(widget,/pet-wiggle/);
assert.match(widget,/pet-twirl/);
assert.match(widget,/pet-nuzzle/);
assert.match(widget,/function ownMemberId\(\)/);
assert.match(widget,/if\(!mine\|\|memberId!==mine\)return false/);
assert.match(widget,/canCallMember:memberId=>!!ownMemberId\(\)&&memberId===ownMemberId\(\)/);
assert.doesNotMatch(widget,/mine\|\|state\.members\[0\]/);

assert.match(garden,/homePetGarden/);
assert.match(garden,/Pet của thành viên/);
assert.match(garden,/data-garden-member/);
assert.match(garden,/data-garden-locked/);
assert.doesNotMatch(garden,/garden-pet-lock/);
assert.doesNotMatch(garden,/🔒 Pet riêng/);
assert.match(garden,/P708PetWidget\?\.selectMember/);
assert.match(garden,/const tag=isMine\?"button":"div"/);
assert.doesNotMatch(garden,/pet-garden-summary/);
assert.doesNotMatch(garden,/openMyPetButton/);

assert.match(css,/\.floating-pet-host/);
assert.match(css,/translate3d/);
assert.match(css,/\.home-pet-garden/);
assert.match(css,/\.pet-garden-grid/);
assert.match(css,/touch-action:none/);
assert.match(css,/--pet-safe-bottom/);
assert.match(css,/@keyframes pet-idle/);
assert.match(css,/@keyframes pet-blink/);
assert.match(css,/width:52px;height:52px/);
assert.doesNotMatch(css,/\.pet-float-card\{/);

// Runtime version may advance for unrelated UI/security fixes. Verify the features
// are still part of the boot graph and PWA shell instead of pinning an old version.
assert.match(loader,/home-pet-garden\.js\?v=\d{8}-\d+/);
assert.match(loader,/cleaning-pet-streak\.js\?v=\d{8}-\d+/);
assert.match(sw,/home-pet-garden\.js/);
assert.match(sw,/cleaning-pet-streak\.js/);
assert.match(sw,/cleaning-pet\.css/);

console.log("Pet ownership isolation and compact pet UI regression tests passed.");
