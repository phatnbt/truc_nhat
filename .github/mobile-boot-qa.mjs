import assert from "node:assert/strict";
import {createServer} from "node:http";
import {webkit,devices,expect} from "@playwright/test";

const origin="http://127.0.0.1:5178";
const browser=await webkit.launch();
try{
  const page=await browser.newPage(devices["iPhone 13"]);
  await page.addInitScript(()=>{
    const original=IDBFactory.prototype.deleteDatabase;
    IDBFactory.prototype.deleteDatabase=function(name){
      return name.includes("firestore")?new EventTarget():original.call(this,name);
    };
  });
  await page.goto(origin,{waitUntil:"domcontentloaded"});
  await page.locator("#googleLoginButton").waitFor({state:"visible",timeout:8500});
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller,null,{timeout:15000});
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
  const output=debug.locator("#pwaDebugOutput");
  await expect(output).not.toBeEmpty();
  const report=JSON.parse(await output.textContent());
  assert.equal(report.display,"standalone");
  assert.equal(report.localStorage,false);
  assert.equal(report.release,report.loader);
  assert.equal(report.firebase,"initialized");
  assert.equal(report.auth,"signedOut");
  assert.equal(JSON.stringify(report).includes("private-placeholder"),false);
  console.log("Standalone diagnostics report storage failure and strip OAuth parameters.");

  const optional=await browser.newPage({...devices["iPhone 13"],serviceWorkers:"block"});
  await optional.addInitScript(()=>{Array.prototype.at=undefined;Object.hasOwn=undefined;});
  let petBlocked=false;
  await optional.route("**/src/features/home-pet-garden.js?*",route=>{petBlocked=true;return route.abort();});
  await optional.goto(origin+"/index.html#billing");
  await expect(optional.locator("#googleLoginButton")).toBeVisible({timeout:12000});
  assert.equal(await optional.locator("#bootRetryButton").count(),0);
  await expect.poll(()=>optional.evaluate(()=>P708Boot.report().find(item=>item.code==="optional-unavailable")?.stage)).toBe("FEATURES_READY");
  assert.equal(petBlocked,true);
  const stages=await optional.evaluate(()=>P708Boot.report().map(item=>item.stage));
  for(const stage of ["HTML_READY","SCRIPT_START","COMPAT_CHECK","CONFIG_FETCHED","CORE_READY","STORAGE_READY","FIREBASE_READY","AUTH_READY","UI_RENDERED","APP_READY"])
    assert.ok(stages.includes(stage),`Missing boot trace stage ${stage}`);
  console.log("WebKit boot works without service workers, an optional script and Safari 15.4 built-ins.");

  const sdkFailure=await browser.newPage({...devices["iPhone 13"],serviceWorkers:"block"});
  await sdkFailure.route("**/firebase-app.js",route=>route.abort());
  await sdkFailure.goto(origin);
  await expect(sdkFailure.locator("#bootFailureDetail")).toContainText("sdk-dependencies");
  await expect(sdkFailure.locator("#bootTraceCopy")).toBeVisible();
  await expect(sdkFailure.locator("#authGateContent a")).toHaveAttribute("href","./ios-diagnostics.html");
  console.log("Blocked Firebase SDK produces an independent recovery report.");

  const server=createServer(async(req,res)=>{
    if(new URL(req.url,origin).pathname==="/sw.js"){
      res.writeHead(200,{"Content-Type":"text/javascript","Cache-Control":"no-store"});
      res.end("self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));");
      return;
    }
    try{
      const reply=await fetch(origin+req.url);
      res.writeHead(reply.status,{"Content-Type":reply.headers.get("content-type")||"application/octet-stream"});
      res.end(Buffer.from(await reply.arrayBuffer()));
    }catch{res.writeHead(502);res.end();}
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  try{
    const minimal=await browser.newPage(devices["iPhone 13"]);
    await minimal.goto(`http://127.0.0.1:${server.address().port}/index.html`);
    await expect(minimal.locator("#googleLoginButton")).toBeVisible({timeout:15000});
    await minimal.waitForFunction(()=>!!navigator.serviceWorker.controller,null,{timeout:15000});
    await minimal.close();
    console.log("WebKit boots with a minimal pass-through service worker.");
  }finally{server.close();}

  const stalled=await browser.newPage({...devices["iPhone 13"],serviceWorkers:"block"});
  await stalled.route("**/app.js?*",route=>route.abort());
  let navigations=0;
  stalled.on("framenavigated",frame=>{if(frame===stalled.mainFrame())navigations++;});
  await stalled.goto(origin,{waitUntil:"domcontentloaded"});
  await stalled.locator("#bootRetryButton").waitFor({state:"visible",timeout:17000});
  assert.equal(navigations,1);
  console.log("A failed mobile boot offers retry without automatic reload.");
}finally{await browser.close();}
