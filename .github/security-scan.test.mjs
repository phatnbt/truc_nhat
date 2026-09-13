import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";

const root=process.cwd();
const textExt=/\.(?:js|mjs|cjs|ts|html|css|json|yml|yaml|md|rules|webmanifest|txt)$/i;
const explicitFiles=new Set([".gitignore",".firebaserc.example"]);
const findings=[];

const tracked=execFileSync("git",["ls-files","-z"],{cwd:root,encoding:"utf8"})
  .split("\0").filter(Boolean);

const patterns=[
  ["Google/Firebase API key",/AIza[0-9A-Za-z_-]{30,}/g],
  ["private key",/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ["service-account private_key",/"private_key"\s*:\s*"-----BEGIN/g],
  ["GitHub token",/(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/g],
  ["OpenAI-style secret",/sk-[A-Za-z0-9_-]{24,}/g],
  ["Slack token",/xox[baprs]-[A-Za-z0-9-]{20,}/g],
  ["AWS access key",/AKIA[0-9A-Z]{16}/g]
];

function scan(relative){
  if(!textExt.test(relative)&&!explicitFiles.has(relative))return;
  const full=path.join(root,relative);
  if(!fs.existsSync(full))return;
  const source=fs.readFileSync(full,"utf8");
  for(const [label,pattern] of patterns){
    pattern.lastIndex=0;
    if(pattern.test(source))findings.push(`${label}: ${relative}`);
  }
  if(/(?:client_secret|private_key_id)\s*["']?\s*[:=]\s*["'][^"'\n]{12,}["']/i.test(source)){
    findings.push(`Credential field with literal value: ${relative}`);
  }
}

tracked.forEach(scan);

const appCore=fs.readFileSync(path.join(root,"src/core/app-core1.js"),"utf8");
const loader=fs.readFileSync(path.join(root,"src/boot/app-loader.js"),"utf8");
const sw=fs.readFileSync(path.join(root,"sw.js"),"utf8");
const deploy=fs.readFileSync(path.join(root,".github/workflows/firebase-deploy.yml"),"utf8");
const hosting=JSON.parse(fs.readFileSync(path.join(root,"firebase.json"),"utf8"));
const gitignore=fs.readFileSync(path.join(root,".gitignore"),"utf8");

if(/apiKey\s*:\s*["'][^"']+["']/.test(appCore))findings.push("Firebase apiKey vẫn bị hardcode trong src/core/app-core1.js");
if(!loader.includes('/__/firebase/init.json'))findings.push("app-loader chưa dùng Firebase Hosting runtime config endpoint");
if(!sw.includes('url.pathname.startsWith("/__/"'))findings.push("service worker chưa bỏ qua Firebase reserved /__/ namespace");
if(!deploy.includes('secrets.FIREBASE_SERVICE_ACCOUNT_P708_ROOM_MANAGER'))findings.push("Firebase deploy workflow không dùng GitHub Secret cho service account");
if(/credentials_json:\s*['"]?\{/.test(deploy))findings.push("Service-account JSON có dấu hiệu bị inline trong workflow");

const requiredIgnores=[".git/**",".github/**",".env",".env.*","service-account*.json","*-firebase-adminsdk-*.json","credentials*.json","secrets*.json","gha-creds-*.json","functions/**","**/node_modules/**"];
const hostingIgnore=new Set(hosting.hosting?.ignore||[]);
for(const pattern of requiredIgnores){
  if(!hostingIgnore.has(pattern))findings.push(`Firebase Hosting chưa ignore credential path: ${pattern}`);
}
for(const pattern of [".env",".env.*","service-account*.json","*-firebase-adminsdk-*.json","credentials*.json","secrets*.json","gha-creds-*.json"]){
  if(!gitignore.split(/\r?\n/).includes(pattern))findings.push(`.gitignore chưa chặn credential path: ${pattern}`);
}

if(findings.length){
  for(const finding of [...new Set(findings)])console.error(`SECRET-SCAN FAIL: ${finding}`);
  process.exit(1);
}
console.log(`Repository secret exposure scan PASSED: ${tracked.length} tracked files checked; no hardcoded API/private credentials detected.`);
