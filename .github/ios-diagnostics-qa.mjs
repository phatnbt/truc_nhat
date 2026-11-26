import assert from "node:assert/strict";
import {devices,expect,webkit} from "@playwright/test";
const external=process.argv[2];
const base=external?new URL(external):new URL("http://127.0.0.1:5178/");
if(external)assert.match(base.origin,/^https:\/\/p708-room-manager--[a-z0-9-]+\.web\.app$/);
const browser=await webkit.launch();
try{
  const page=await browser.newPage({...devices["iPhone 13"],serviceWorkers:"block"});
  await page.addInitScript(()=>Object.defineProperty(navigator,"clipboard",{value:undefined}));
  if(!external){
    await page.route("**/__/firebase/init.json",route=>route.fulfill({json:{
      projectId:"demo-p708-production-audit",apiKey:"demo-p708-emulator-key",
      authDomain:"localhost",appId:"demo-p708-app"
    }}));
  }
  const errors=[],paths=[];
  page.on("pageerror",error=>errors.push(error.message));
  page.on("request",request=>paths.push(new URL(request.url()).pathname));
  const response=await page.goto(new URL("ios-diagnostics.html?code=private-marker&email=private-marker",base).href);
  assert.ok(response.ok());
  for(const name of ["html","css","javascript","dom","promise","fetch","module","dynamic","local","session","indexed","cache","config","sdk","firebase","auth"])
    await expect(page.locator(`#${name}`)).toContainText("PASS",{timeout:18000});
  await expect(page.locator("#firestore")).toContainText(external?"preview-isolated":"permission-denied",{timeout:18000});
  await page.locator("#diag-copy").click();
  const copied=JSON.parse(await page.locator("#diag-report").inputValue());
  assert.ok(!JSON.stringify(copied).includes("private-marker"));
  assert.ok(!paths.some(path=>/\/rooms\/|\/app\.js$|app-loader/.test(path)));
  assert.deepEqual(errors,[]);
  console.log("WebKit independent iOS diagnostics passed. No room, app shell or OAuth credentials used.");
}finally{await browser.close();}
