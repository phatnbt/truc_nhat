import {execFileSync} from "node:child_process";
import {readFileSync,writeFileSync} from "node:fs";

const destination=process.argv[2]||"p708-build.json";
const commit=process.argv[3]||process.env.GITHUB_SHA||execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim();
const release=readFileSync("app.js","utf8").match(/const BOOT_VERSION = "(\d{8}-\d+)"/)?.[1];
if(!release||!/^[0-9a-f]{40}$/.test(commit))throw new Error("Invalid P708 build identity");
for(const [file,marker] of [
  ["index.html",`app.js?v=${release}`],
  ["src/boot/app-loader.js",`LOADER_RELEASE="${release}"`],
  ["sw.js",`APP_RELEASE="${release}"`]
]){
  if(!readFileSync(file,"utf8").includes(marker))throw new Error(`Incompatible P708 release in ${file}`);
}
writeFileSync(destination,`${JSON.stringify({release,commit})}\n`);
