import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import vm from "node:vm";

const root=process.cwd();
const failures=[];
const warnings=[];
const fail=message=>failures.push(message);
const warn=message=>warnings.push(message);
const exists=relative=>fs.existsSync(path.join(root,relative));
const read=relative=>fs.readFileSync(path.join(root,relative),"utf8");

const required=[
  "index.html","styles.css","landing-ui.css","app.js",
  "src/boot/app-loader.js","src/boot/app-start.js",
  "src/core/app-core1.js","src/core/app-core2.js","src/core/p708-secure-sync-engine.js","src/core/p708-authoritative-repair.js",
  "src/core/p708-identity-plan.js","src/core/p708-canonical-mapping-repair.js",
  "src/features/app-actions1.js","src/features/app-actions2.js","src/features/app-dashboard.js",
  "src/features/app-render.js","src/features/app-integrity-fixes.js","src/features/inactive-mapping-dedup-fix.js",
  "src/features/canonical-identity-repair.js","src/features/billing-stable-repair.js","src/features/billing-canonical-repair.js","src/features/home-enhancements.js",
  "src/features/notification-enhancements.js","src/features/today-calendar.js",
  "src/features/mobile-install-bridge.js","src/features/mobile-install-guide.js","sw.js",
  "manifest.webmanifest","firebase.json","firestore-secure.rules","offline.html",
  "icons/icon-32.png","icons/icon-192.png","icons/icon-512.png","icons/icon-maskable-512.png",
  "docs/VALIDATION.json","docs/README_FREE_EDITION.md","docs/README_P708_SECURE.md",
  "functions/index.js","functions/package.json"
];
for(const file of required)if(!exists(file))fail(`Thiếu file bắt buộc: ${file}`);

for(const file of ["firebase.json","manifest.webmanifest","docs/VALIDATION.json","functions/package.json"]){
  if(!exists(file))continue;
  try{JSON.parse(read(file));}catch(error){fail(`JSON lỗi ${file}: ${error.message}`);}
}

const classicJs=[
  "src/core/app-core1.js","src/core/app-core2.js",
  "src/features/app-actions1.js","src/features/app-actions2.js","src/features/app-dashboard.js",
  "src/features/app-render.js","src/features/app-integrity-fixes.js","src/features/inactive-mapping-dedup-fix.js",
  "src/features/canonical-identity-repair.js","src/features/billing-stable-repair.js","src/features/billing-canonical-repair.js","src/features/home-enhancements.js",
  "src/boot/app-start.js","src/features/notification-enhancements.js","src/features/today-calendar.js",
  "src/features/mobile-install-bridge.js","src/features/mobile-install-guide.js","sw.js"
];
for(const file of classicJs){
  if(!exists(file))continue;
  try{new vm.Script(read(file),{filename:file});}catch(error){fail(`JavaScript syntax lỗi ${file}: ${error.message}`);}
}
const moduleJs=[
  "app.js","src/boot/app-loader.js","src/core/p708-secure-sync-engine.js","src/core/p708-authoritative-repair.js",
  "src/core/p708-identity-plan.js","src/core/p708-canonical-mapping-repair.js"
];
for(const file of moduleJs){
  if(!exists(file))continue;
  const temp=path.join(os.tmpdir(),`p708-${path.basename(file,".js")}-${process.pid}.mjs`);
  fs.writeFileSync(temp,read(file));
  const result=spawnSync(process.execPath,["--check",temp],{encoding:"utf8"});
  fs.rmSync(temp,{force:true});
  if(result.status!==0)fail(`Module syntax lỗi ${file}: ${(result.stderr||result.stdout).trim()}`);
}
if(exists("functions/index.js")){
  const result=spawnSync(process.execPath,["--check",path.join(root,"functions/index.js")],{encoding:"utf8"});
  if(result.status!==0)fail(`Functions syntax lỗi: ${(result.stderr||result.stdout).trim()}`);
}

const textFiles=required.filter(file=>exists(file)&&/\.(?:js|html|css|json|webmanifest|rules)$/.test(file));
for(const file of textFiles){
  const source=read(file);
  if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(source)||/"private_key"\s*:/.test(source))fail(`Phát hiện private key/service-account trong source: ${file}`);
  if(/\beval\s*\(|\bnew\s+Function\s*\(|document\.write\s*\(/.test(source))warn(`API động cần review thủ công trong ${file}`);
}

if(exists("index.html")){
  const html=read("index.html"),ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]),seen=new Set();
  for(const id of ids){if(seen.has(id))fail(`Trùng DOM id trong index.html: ${id}`);seen.add(id);}
  for(const button of html.matchAll(/<button\b[^>]*>/gi)){if(!/\btype="(?:button|submit|reset)"/i.test(button[0]))fail(`Button thiếu type: ${button[0].slice(0,100)}`);}
  for(const match of html.matchAll(/\b(?:src|href)="(\.\/[^"#?]+)(?:[?#][^"]*)?"/g)){
    const relative=match[1].replace(/^\.\//,"");if(!exists(relative))fail(`index.html tham chiếu file không tồn tại: ${relative}`);
  }
}

const loaderPath="src/boot/app-loader.js";
if(exists(loaderPath)){
  const loaderDir=path.dirname(loaderPath);
  for(const match of read(loaderPath).matchAll(/["'`](\.\.?\/[^"'`?]+\.js)(?:\?[^"'`]*)?["'`]/g)){
    const relative=path.normalize(path.join(loaderDir,match[1]));
    if(!exists(relative))fail(`${loaderPath} tham chiếu file không tồn tại: ${relative}`);
  }
}

if(exists("sw.js")){
  const source=read("sw.js"),shellMatch=source.match(/const APP_SHELL=\[([\s\S]*?)\];/);
  if(!shellMatch)fail("Không tìm thấy APP_SHELL trong sw.js");
  else for(const match of shellMatch[1].matchAll(/["']\.\/([^"']+)["']/g)){
    const relative=match[1];if(relative&&relative!==""&&!exists(relative)&&relative!==".")fail(`Service worker cache file không tồn tại: ${relative}`);
  }
}

for(const file of ["styles.css","landing-ui.css","utility-chart.css","mobile-notification-ui.css","kpi-polish.css"]){
  if(!exists(file))continue;
  const source=read(file).replace(/\/\*[\s\S]*?\*\//g,"");
  const opens=(source.match(/{/g)||[]).length,closes=(source.match(/}/g)||[]).length;
  if(opens!==closes)fail(`CSS ngoặc không cân bằng ${file}: ${opens} { / ${closes} }`);
}

const forbiddenRootSources=[
  "app-loader.js","app-core1.js","app-core2.js","app-actions1.js","app-actions2.js","app-dashboard.js",
  "app-render.js","home-enhancements.js","app-start.js","notification-enhancements.js",
  "today-calendar.js","mobile-install-bridge.js","mobile-install-guide.js","p708-secure-sync-engine.js",
  "README_FREE_EDITION.md","README_P708_SECURE.md","VALIDATION.json"
];
for(const file of forbiddenRootSources)if(exists(file))fail(`File đã được tổ chức vào thư mục nhưng vẫn còn ở root: ${file}`);

if(exists("firebase.json")){
  const config=JSON.parse(read("firebase.json")),ignore=config.hosting?.ignore||[];
  if(!ignore.includes("functions/**"))fail("firebase.json phải ignore functions/** ở bản Free");
  if(!ignore.includes(".github/**"))fail("firebase.json phải ignore .github/**");
  if(!ignore.includes("docs/**"))fail("firebase.json phải ignore docs/**");
  if(config.firestore?.rules!=="firestore-secure.rules")fail("firebase.json chưa trỏ đúng firestore-secure.rules");
}

if(exists("manifest.webmanifest")){
  const manifest=JSON.parse(read("manifest.webmanifest"));
  if(manifest.display!=="standalone")warn("PWA manifest không dùng display=standalone");
  for(const icon of manifest.icons||[]){const relative=String(icon.src||"").replace(/^\.\//,"");if(relative&&!exists(relative))fail(`Manifest icon không tồn tại: ${relative}`);}
}

console.log(`Static QA: ${required.length} file bắt buộc, ${classicJs.length+moduleJs.length} frontend JS/module, JSON/HTML/CSS/assets.`);
for(const message of warnings)console.warn(`WARN: ${message}`);
if(failures.length){for(const message of failures)console.error(`FAIL: ${message}`);process.exit(1);}
console.log("Static QA PASSED");
