import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {randomUUID} from "node:crypto";
import {chromium,firefox,webkit,expect} from "@playwright/test";
import {initializeTestEnvironment} from "@firebase/rules-unit-testing";
import {doc,setDoc,getDocFromServer,Timestamp} from "firebase/firestore";
import {roomDateKey,parseDateKey,dateKey,addUtcDays} from "../src/core/billing-cycle-period.js";

const base="http://127.0.0.1:5178",projectId="demo-p708-production-audit",room="rooms/P708";
assert.ok(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST,"Run against local Auth and Firestore emulators.");
const env=await initializeTestEnvironment({projectId,firestore:{rules:await fs.readFile("firestore-secure.rules","utf8")}});
const clock=parseDateKey(roomDateKey());
const monday=dateKey(addUtcDays(clock,-((clock.getUTCDay()+6)%7)));
const billMonth="2026-08";
const password="local-test-password";
const auth=process.env.FIREBASE_AUTH_EMULATOR_HOST;
const testRun=randomUUID();

async function dataFromServer(...path){
  let data;
  await env.withSecurityRulesDisabled(async context=>{
    const snapshot=await getDocFromServer(doc(context.firestore(),room,...path));
    data=snapshot.data();
  });
  return data;
}

const roomPayloadFromServer=async()=>(await dataFromServer()).payload;
const memberDataFromServer=uid=>dataFromServer("memberData",uid);

async function testAccount(kind, browser){
  const email=`${kind}-${browser}-${testRun}@example.test`;
  const response=await fetch(`http://${auth}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-p708-emulator-key`,{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({email,password,returnSecureToken:true})
  });
  const user=await response.json();
  assert.ok(user.localId,JSON.stringify(user.error));
  return {uid:user.localId,email};
}
async function login(page,account){
  const errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto(base);
  await expect(page.locator("#googleLoginButton")).toBeVisible({timeout:15000});
  await page.evaluate(()=>{
    const gate=document.querySelector("#authGateContent");
    window.p708SawUnexpectedAccessRequest=false;
    new MutationObserver(()=>{
      if(gate.querySelector("#requestDisplayName"))window.p708SawUnexpectedAccessRequest=true;
    }).observe(gate,{childList:true,subtree:true});
  });
  await page.evaluate(async ({email,password})=>{
    const {getApp}=await import("https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js");
    const {getAuth,signInWithEmailAndPassword}=await import("https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js");
    await signInWithEmailAndPassword(getAuth(getApp("p708-secure-manager-v5")),email,password);
  },{email:account.email,password});
  await expect(page.locator("#authGate")).toBeHidden({timeout:15000});
  await expect(page.locator("#kpiMembers")).toHaveText("2");
  assert.equal(await page.evaluate(()=>window.p708SawUnexpectedAccessRequest),false,"a pending permission lookup must not show the access-request form");
  return errors;
}
function assertBrowserErrors(name,errors){
  const emulatorWarnings=errors.filter(message=>name==="webkit"&&
    /127\.0\.0\.1:8080\/google\.firestore\.v1\.Firestore\/(Listen|Write)\/channel\?.*due to access control checks\./.test(message));
  if(emulatorWarnings.length)console.log(`WebKit reported ${emulatorWarnings.length} local emulator transport warnings.`);
  assert.deepEqual(errors.filter(message=>!emulatorWarnings.includes(message)),[]);
}

async function clickDuringSync(button,useTouch,changeOtherTask=true){
  await button.evaluate((element,changeTask)=>element.addEventListener("pointerdown",()=>{
    if(!changeTask){renderAll();return;}
    const [taskId]=element.closest("tr").dataset.taskKey.split(":");
    const otherTask=currentSchedule().assignments.find(assignment=>assignment.taskId!==taskId);
    const reassigned=otherTask.reassigned;
    otherTask.reassigned=!reassigned;
    renderAll();
    otherTask.reassigned=reassigned;
  },{once:true}),changeOtherTask);
  if(useTouch)await button.tap();
  else await button.click();
}

async function exercise(engine,name,width){
  await env.clearFirestore();
  const admin=await testAccount("admin",name),member=await testAccount("member",name);
  await env.withSecurityRulesDisabled(async context=>{
    const db=context.firestore(),stamp=Timestamp.now();
    await setDoc(doc(db,room,"security","config"),{roomCode:"P708",adminUid:admin.uid,createdAt:stamp});
    await setDoc(doc(db,room,"access",admin.uid),{active:true,role:"admin",memberId:"a",displayName:"An",email:admin.email});
    await setDoc(doc(db,room,"access",member.uid),{active:true,role:"member",memberId:"b",displayName:"Bình",email:member.email});
    await setDoc(doc(db,room),{schemaVersion:5,roomCode:"P708",revision:1,lastAdminUid:admin.uid,lastDeviceId:"fixture",updatedAt:stamp,payload:{
      members:{a:{id:"a",name:"An"},b:{id:"b",name:"Bình"}},presence:{a:true,b:true},schedules:{},settings:{},
      billingMonths:{[billMonth]:{id:"bill-1",month:billMonth,electricity:10000,water:2000,closed:false,people:{
        "person:a":{id:"a",memberId:"a",name:"An",days:{"1":true},paid:false,paidAmount:0},
        "person:b":{id:"b",memberId:"b",name:"Bình",days:{"1":true},paid:false,paidAmount:0}
      }}}
    }});
  });
  const browser=await engine.launch();
  const activate=target=>name==="webkit"?target.press("Enter"):target.click();
  try{
    const viewport={width,height:820};
    const hasTouch=name==="webkit";
    const manager=await browser.newPage({viewport,hasTouch,timezoneId:"America/Los_Angeles"});
    const resident=await browser.newPage({viewport,hasTouch,timezoneId:"Asia/Ho_Chi_Minh"});
    if(hasTouch){
      const firestore="https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
      await resident.route(firestore,route=>route.fulfill({
        contentType:"text/javascript",
        body:`export * from "${firestore}?p708-original";
          import {onSnapshot as subscribe} from "${firestore}?p708-original";
          export function onSnapshot(ref,...args){
            if(ref.path?.includes("/access/")){
              const index=typeof args[0]==="function"?0:1,receive=args[index];
              args[index]=snapshot=>setTimeout(()=>receive(snapshot),1000);
            }
            return subscribe(ref,...args);
          }`
      }));
    }
    const managerErrors=await login(manager,admin), residentErrors=await login(resident,member);
    await expect(resident.locator("#homeGreeting")).toHaveText("P708 · Bình");
    assert.ok(await manager.evaluate(async()=>{
      const first=realtimeEngine.forceSync(),second=realtimeEngine.forceSync();
      return first===second&&await first;
    }),"simultaneous sync calls should use the same server read");
    await expect(manager.locator("#homeDate")).toHaveText(await resident.locator("#homeDate").innerText());
    const overflow=await resident.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
    assert.equal(overflow,false,"dashboard fits the viewport");
    await resident.locator("#themeButton").click();
    await expect(resident.locator("html")).toHaveAttribute("data-theme","dark");
    await resident.locator("#notificationButton").click();
    await expect(resident.locator("#noticeModal")).toBeVisible();
    await resident.locator('[data-close=noticeModal]').click();
    await resident.screenshot({path:`test-results/p708-${name}-dashboard.png`});

    await manager.locator(".room-shortcuts [data-go=cleaning]").click();
    await manager.locator("#cleanWeek").fill(monday);
    await manager.locator("#createScheduleButton").click();
    await expect(manager.locator("#schedulePreviewModal")).toBeVisible();
    await manager.locator('[data-preview-task=lavabo]').selectOption("b");
    await manager.locator("#confirmScheduleButton").click();
    await expect(manager.locator("#manualScheduleButton")).toBeDisabled();
    await expect(resident.locator("#kpiTasks")).toHaveText("0/6");
    await resident.locator(".room-shortcuts [data-go=cleaning]").click();
    await expect(resident.locator("#createScheduleButton")).toBeHidden();
    const taskRow=resident.locator("#cleanScheduleBox tr").filter({hasText:"Lavabo"});
    await activate(taskRow.getByRole("button",{name:"Bắt đầu"}));
    await expect(taskRow).toContainText("Đang thực hiện");
    await clickDuringSync(taskRow.getByRole("button",{name:"Tôi đã làm"}),hasTouch);
    await expect(resident.locator("#taskChecklistModal")).toBeVisible();
    await resident.locator('#taskChecklistForm [value="task"]').check();
    await resident.locator('#taskChecklistForm [value="finish"]').check();
    await activate(resident.getByRole("button",{name:"Gửi xác nhận"}));
    await expect(taskRow).toContainText("Chờ xác nhận");
    const approval=manager.locator("#cleanScheduleBox tr").filter({hasText:"Lavabo"}).getByRole("button",{name:"Xác nhận",exact:true});
    await expect(approval).toBeEnabled();
    await clickDuringSync(approval,hasTouch);
    await expect(taskRow).toContainText("Đã xong");
    await resident.reload();
    await expect(resident.locator("#authGate")).toBeHidden();
    await expect(resident.locator("#cleanScheduleBox tr").filter({hasText:"Lavabo"})).toContainText("Đã xong");
    await expect(resident.locator('#homePetGarden [data-garden-member="b"]')).toContainText("10 EXP");
    await activate(resident.locator("[data-swap-task]").first());
    await expect(resident.locator("#swapTaskModal")).toBeVisible();
    await activate(resident.locator("#sendSwapButton"));
    await expect(resident.locator("#swapTaskModal")).toBeHidden();
    await activate(manager.locator("#taskSwapList").locator("..").locator("summary"));
    await activate(manager.locator("#taskSwapList").getByRole("button",{name:"Duyệt đổi"}));
    await expect(manager.locator("#taskSwapList")).toContainText("Đã đổi");
    await expect(resident.locator("#cleanScheduleBox")).toContainText("Đã đổi");
    const manualRow=manager.locator('#cleanScheduleBox tr[data-task-key^="san:"]');
    await clickDuringSync(manualRow.getByRole("button",{name:"Đánh dấu xong"}),hasTouch);
    await expect(manualRow).toContainText("Đã xong");

    if(name!=="webkit"){
      // Cover presence-first and billing-first independently on fresh member documents.
      assert.equal(await memberDataFromServer(member.uid),undefined);
      const presenceFirst=name==="firefox";
      if(presenceFirst){
        const presence=resident.locator('[data-presence="b"]');
        await expect(resident.locator('[data-presence="a"]')).toBeDisabled();
        resident.once("dialog",dialog=>dialog.accept());
        await clickDuringSync(presence,false,false);
        await expect.poll(async()=>(await memberDataFromServer(member.uid))?.presence).toBe(false);
        assert.deepEqual((await memberDataFromServer(member.uid)).billingMonths,{});
        await expect(manager.locator('[data-presence="b"]')).toHaveClass(/off/);
        await expect(resident.locator("#toast")).toHaveText("Đã đánh dấu vắng");
      }

      await resident.goto(base+"/#billing");
      await resident.locator("#billMonth").fill(billMonth);
      await resident.locator("#billMonth").dispatchEvent("change");
      const memberSecondDay=resident.locator(`[data-billing-date="${billMonth}-02"]`);
      await expect(memberSecondDay).toBeEnabled();
      await clickDuringSync(memberSecondDay,false,false);
      await expect.poll(async()=>(await memberDataFromServer(member.uid))?.billingMonths[billMonth]?.days["2"]).toBe(true);
      const personalData=await memberDataFromServer(member.uid);
      assert.equal(personalData.presence,!presenceFirst);
      assert.equal(personalData.billingMonths[billMonth].days["1"],true,"the pre-existing room day is preserved");
      await expect(resident.locator("#toast")).toHaveText("ngày 2: Có ở");
      await clickDuringSync(memberSecondDay,false,false);
      await expect.poll(async()=>(await memberDataFromServer(member.uid))?.billingMonths[billMonth]?.days["2"]).toBe(false);
    }

    await manager.goto(base+"/#billing");
    await manager.locator("#billMonth").fill(billMonth);
    await manager.locator("#billMonth").dispatchEvent("change");
    await expect(manager.locator("#billMonth")).toHaveValue(billMonth);
    await expect(manager.locator("#billingTable")).toContainText("6.000");
    const secondDay=manager.locator(`[data-billing-date="${billMonth}-02"]`);
    await activate(manager.locator("#billRangePanel summary"));
    await manager.locator("#stayFrom").fill(`${billMonth}-02`);
    await manager.locator("#stayTo").fill(`${billMonth}-02`);
    await activate(manager.locator("#markStayButton"));
    await expect(secondDay).toHaveAttribute("aria-pressed","true");
    await expect.poll(async()=>{
      const bill=(await roomPayloadFromServer()).billingMonths[billMonth];
      return bill.people["person:a"].days["2"];
    }).toBe(true);
    await activate(secondDay);
    await expect(secondDay).toHaveAttribute("aria-pressed","false");
    await expect.poll(async()=>{
      const bill=(await roomPayloadFromServer()).billingMonths[billMonth];
      return bill.people["person:a"].days["2"]===true;
    }).toBe(false);
    await manager.locator("#billCloseButton").evaluate(button=>button.scrollIntoView({block:"center",behavior:"instant"}));
    await manager.locator("#billCloseButton").press("Enter");
    await expect(manager.locator("#billingDecisionModal")).toBeVisible();
    await activate(manager.locator("#billingDecisionSave"));
    await expect.poll(async()=>{
      const payload=await roomPayloadFromServer();
      return payload.billingMonths[billMonth].closedDaysVersion;
    }).toBe(1);
    await manager.locator('[data-payment="b"]').evaluate(button=>button.scrollIntoView({block:"center",behavior:"instant"}));
    await manager.locator('[data-payment="b"]').press("Enter");
    await manager.locator("#billingDecisionAmount").fill("2500");
    await activate(manager.locator("#billingDecisionSave"));
    await expect(manager.locator("#billingTable")).toContainText("3.500");
    await expect.poll(async()=>{
      const payload=await roomPayloadFromServer();
      return payload.billingMonths[billMonth].people["person:b"].paidAmount;
    }).toBe(2500);

    await manager.goto(base+"/#resources");
    await expect(manager.locator("#authGate")).toBeHidden();
    await activate(manager.locator("#stockForm").locator("..").locator("summary"));
    await manager.locator("#stockForm [name=name]").fill("Nước giặt");
    await manager.locator("#stockForm [name=unit]").fill("chai");
    await manager.locator("#stockForm [name=quantity]").fill("0");
    await activate(manager.locator("#stockForm button[type=submit]"));
    await expect(manager.locator("#stockForm [name=name]")).toHaveValue("");
    await expect(manager.locator("#stockList")).toContainText("Nước giặt");
    await activate(manager.locator("#expenseForm").locator("..").locator("summary"));
    await manager.locator("#expenseForm [name=name]").fill("Mua nước giặt");
    await manager.locator("#expenseForm [name=amount]").fill("10001");
    await manager.locator("#expensePayer").selectOption("a");
    await manager.locator("#expenseStock").selectOption({label:"Nước giặt"});
    await manager.locator("#expenseForm [name=purchaseQuantity]").fill("2");
    await activate(manager.locator("#expenseForm button[type=submit]"));
    await expect(manager.locator("#expenseForm [name=name]")).toHaveValue("");
    await expect(manager.locator("#stockList")).toContainText("2 chai");
    await expect(manager.locator("#roomExpenses")).toContainText("Mua nước giặt");
    await env.withSecurityRulesDisabled(async context=>{
      const {resources}= (await getDocFromServer(doc(context.firestore(),room))).data().payload;
      assert.equal(Object.keys(resources.expenses).length,1);
      assert.equal(Object.values(Object.values(resources.expenses)[0].shares).reduce((a,b)=>a+b),10001);
    });
    if(name==="chromium"){
      await manager.evaluate(()=>navigator.serviceWorker.ready.then(()=>true));
      await manager.waitForFunction(()=>!!navigator.serviceWorker.controller);
      await manager.locator("#stockForm [name=name]").fill("Bản nháp");
      await manager.evaluate(async()=>{await navigator.serviceWorker.register("/sw.js?qa-build=2",{scope:"/"});});
      await expect(manager.locator("#pwaUpdateBanner")).toBeVisible();
      await manager.locator("#pwaUpdateButton").click();
      await expect(manager.locator("#stockForm [name=name]")).toHaveValue("Bản nháp");
      await manager.locator("#stockForm [name=name]").clear();
      await Promise.all([manager.waitForEvent("framenavigated"),manager.locator("#pwaUpdateButton").click()]);
      await expect(manager.locator("#authGate")).toBeHidden();
      await manager.context().setOffline(true);
      await manager.reload();
      await expect(manager.getByRole("heading",{name:"Chưa có kết nối mạng"})).toBeVisible();
      await manager.context().setOffline(false);
      await manager.reload();
      await expect(manager.locator("#stockList")).toContainText("2 chai");
    }
    await resident.locator("#accountButton").click();
    await resident.locator("#signOutButton").click();
    await expect(resident.locator("#googleLoginButton")).toBeVisible();
    await expect(resident.locator("#homeGreeting")).toHaveText("Phòng P708");
    assertBrowserErrors(name,managerErrors);
    assertBrowserErrors(name,residentErrors);
    console.log(`P708 browser QA passed: ${name} (${width}px)`);
  } catch(error) {
    for(const context of browser.contexts())for(const page of context.pages()){
      console.error(name,"toast:",await page.locator("#toast").textContent().catch(()=>null),
        "swap waiting:",await page.locator("#sendSwapButton").isDisabled().catch(()=>false));
    }
    await browser.contexts()[0]?.pages()[0]?.screenshot({path:`test-results/p708-${name}-failure.png`}).catch(()=>{});
    throw error;
  } finally {await browser.close();}
}

try {
  await fs.mkdir("test-results",{recursive:true});
  const browsers={chromium:[chromium,1280],firefox:[firefox,820],webkit:[webkit,390]};
  const failures=[];
  for(const name of process.argv.slice(2).length?process.argv.slice(2):Object.keys(browsers)){
    try{await exercise(browsers[name][0],name,browsers[name][1]);}
    catch(error){failures.push(error);console.error(`P708 browser QA failed: ${name}`,error.message);}
  }
  if(failures.length)process.exitCode=1;
} finally {await env.cleanup();}
