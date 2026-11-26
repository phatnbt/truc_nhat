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

  const stalled=await browser.newPage({...devices["iPhone 13"],serviceWorkers:"block"});
  await stalled.route("**/app.js?*",route=>route.abort());
  let navigations=0;
  stalled.on("framenavigated",frame=>{if(frame===stalled.mainFrame())navigations++;});
  await stalled.goto("http://127.0.0.1:5178/",{waitUntil:"domcontentloaded"});
  await stalled.locator("#bootRetryButton").waitFor({state:"visible",timeout:17000});
  assert.equal(navigations,1);
  console.log("A failed mobile boot offers retry without automatic reload.");
}finally{await browser.close();}
