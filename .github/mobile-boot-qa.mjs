import assert from "node:assert/strict";
import {webkit,devices} from "playwright";

const browser=await webkit.launch();
try{
  const page=await browser.newPage(devices["iPhone 13"]);
  await page.addInitScript(()=>{
    const original=IDBFactory.prototype.deleteDatabase;
    IDBFactory.prototype.deleteDatabase=function(name){
      return name.includes("firestore")?new EventTarget():original.call(this,name);
    };
  });
  await page.goto("http://127.0.0.1:5178/",{waitUntil:"domcontentloaded"});
  await page.locator("#googleLoginButton").waitFor({state:"visible",timeout:8500});
  assert.equal(new URL(page.url()).searchParams.has("refresh"),false);
  console.log("Mobile boot succeeds when old Firestore IndexedDB cannot be deleted.");

  const debug=await browser.newPage({...devices["iPhone 13"],serviceWorkers:"block"});
  await debug.addInitScript(()=>{
    Object.defineProperty(navigator,"standalone",{value:true});
    Object.defineProperty(window,"localStorage",{get(){throw new DOMException("Unavailable","SecurityError");}});
  });
  await debug.goto("http://127.0.0.1:5178/index.html?debug=1&code=private-placeholder&email=private-placeholder");
  await debug.locator("#googleLoginButton").waitFor({state:"visible"});
  await debug.locator("#pwaDebugPanel summary").click();
  const report=JSON.parse(await debug.locator("#pwaDebugOutput").textContent());
  assert.equal(report.display,"standalone");
  assert.equal(report.localStorage,false);
  assert.equal(report.release,report.loader);
  assert.equal(report.firebase,"initialized");
  assert.equal(report.auth,"signedOut");
  assert.equal(JSON.stringify(report).includes("private-placeholder"),false);
  console.log("Standalone diagnostics report storage failure and strip OAuth parameters.");

  const stalled=await browser.newPage({...devices["iPhone 13"],serviceWorkers:"block"});
  await stalled.route("**/app.js?*",route=>route.abort());
  let navigations=0;
  stalled.on("framenavigated",frame=>{if(frame===stalled.mainFrame())navigations++;});
  await stalled.goto("http://127.0.0.1:5178/",{waitUntil:"domcontentloaded"});
  await stalled.locator("#bootRetryButton").waitFor({state:"visible",timeout:17000});
  assert.equal(navigations,1);
  console.log("A failed mobile boot offers retry without automatic reload.");
}finally{await browser.close();}
