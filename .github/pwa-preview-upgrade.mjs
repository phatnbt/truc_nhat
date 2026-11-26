import assert from "node:assert/strict";
import {chromium,expect} from "@playwright/test";

const [preview,initial,target]=process.argv.slice(2);
const staging=new URL(preview);
assert.match(staging.origin,/^https:\/\/p708-room-manager--[a-z0-9-]+\.web\.app$/);
for(const release of [initial,target])assert.match(release,/^\d{8}-\d+$/);
assert.notEqual(initial,target);
const browser=await chromium.launch();
try{
  const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true});
  await page.addInitScript(()=>Object.defineProperty(navigator,"standalone",{value:true}));
  let dataRequests=0;
  page.on("request",request=>{
    if(/(?:firestore|identitytoolkit|securetoken)\.googleapis\.com$/.test(new URL(request.url()).hostname))dataRequests++;
  });
  await page.goto(new URL("/index.html?debug=1",staging).href);
  const openDiagnostics=()=>page.locator("#pwaDebugPanel summary").click();
  const debug=async()=>JSON.parse(await page.locator("#pwaDebugOutput").textContent());
  await openDiagnostics();
  await expect.poll(async()=>(await debug()).controllerRelease,{timeout:30000}).toBe(initial);
  assert.equal((await debug()).release,initial);
  assert.equal((await debug()).firebase,"preview-disabled");
  console.log(`READY: preview ${initial} controls the standalone-mode test page. Publish ${target} to the same preview.`);

  await expect.poll(async()=>{
    const response=await page.request.get(new URL("/p708-build.json",staging).href);
    return (await response.json()).release;
  },{timeout:180000,intervals:[3000]}).toBe(target);
  await page.evaluate(async()=>{const reg=await navigator.serviceWorker.ready;await reg.update();});
  await page.waitForFunction(async()=>!!(await navigator.serviceWorker.getRegistration()).waiting);
  await page.reload();
  await openDiagnostics();
  assert.equal((await debug()).release,initial,"the old worker keeps its own HTML while the next worker waits");
  const reply=await page.evaluate(async()=>{
    const reg=await navigator.serviceWorker.getRegistration(),channel=new MessageChannel();
    return new Promise(resolve=>{
      channel.port1.onmessage=event=>resolve(event.data);
      reg.waiting.postMessage({type:"SKIP_WAITING"},[channel.port2]);
    });
  });
  assert.equal(reply?.accepted,true);
  await expect.poll(async()=>(await debug()).controllerRelease,{timeout:20000}).toBe(target);
  await page.reload();
  await openDiagnostics();
  await expect.poll(async()=>(await debug()).serverRelease).toBe(target);
  assert.equal((await debug()).release,target);
  assert.equal((await debug()).display,"standalone");
  assert.equal((await debug()).firebase,"preview-disabled");
  assert.equal(dataRequests,0);
  console.log(`PREVIEW UPGRADE PASS: ${initial} -> ${target}. Worker, app and server agree. No Auth or Firestore requests.`);
}finally{await browser.close();}
