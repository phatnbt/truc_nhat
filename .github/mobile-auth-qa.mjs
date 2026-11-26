import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFile} from "node:fs/promises";
import {chromium,firefox,webkit,devices,expect} from "@playwright/test";
import {initializeTestEnvironment} from "@firebase/rules-unit-testing";
import {doc,setDoc,updateDoc,deleteDoc} from "firebase/firestore";
import {authEnvironment,signInMethod} from "../src/core/mobile-auth-policy.js";

const base="http://127.0.0.1:5178/";
const projectId="demo-p708-production-audit",room="rooms/P708",password="test-emulator-password";
const engines={chromium,firefox,webkit};
const names=process.argv.slice(2).length?process.argv.slice(2):Object.keys(engines);
for(const userAgent of ["Zalo","FBAN/FBIOS","FB_IAB/Messenger","Android; wv"]){
  assert.equal(authEnvironment({userAgent}).embedded,true);
}
assert.deepEqual(authEnvironment({userAgent:"Android SamsungBrowser/28.0"}),{embedded:false,mobile:true,standalone:false});
assert.deepEqual(authEnvironment({userAgent:"iPhone CriOS/133.0",standalone:true}),{embedded:false,mobile:true,standalone:true});
assert.equal(signInMethod({standalone:true,sameOrigin:true,sessionStorage:true}),"redirect");
assert.equal(signInMethod({standalone:true,sameOrigin:false,sessionStorage:true}),"popup");
assert.equal(signInMethod({standalone:true,sameOrigin:true,sessionStorage:false}),"popup");
assert.match(process.env.FIREBASE_AUTH_EMULATOR_HOST||"",/^127\.0\.0\.1:9099$/);
assert.ok(process.env.FIRESTORE_EMULATOR_HOST);
const env=await initializeTestEnvironment({projectId,firestore:{rules:await readFile("firestore-secure.rules","utf8")}});

async function testUser(){
  const email=`mobile-auth-${randomUUID()}@example.test`;
  const response=await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-p708-emulator-key",{
    method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,password,returnSecureToken:true})
  });
  const data=await response.json();
  assert.ok(data.localId);
  return {uid:data.localId,email};
}
async function signIn(page,account){
  await page.evaluate(async ({email,password})=>{
    const {getApp}=await import("https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js");
    const {getAuth,signInWithEmailAndPassword}=await import("https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js");
    await signInWithEmailAndPassword(getAuth(getApp("p708-secure-manager-v5")),email,password);
  },{email:account.email,password});
}

async function exercise(name){
  const engine=engines[name];
  const browser=await engine.launch();
  try{
    const page=await browser.newPage({...devices["iPhone 13"],defaultBrowserType:undefined,
      userAgent:devices["iPhone 13"].userAgent+" FBAN/FBIOS FBAV/500.0",serviceWorkers:"block"});
    let providerRequests=0;
    page.on("request",request=>{if(new URL(request.url()).hostname==="accounts.google.com")providerRequests++;});
    await page.goto(base,{waitUntil:"domcontentloaded"});
    await page.locator("#copyAuthLink").waitFor({timeout:15000});
    assert.equal(await page.locator("#googleLoginButton").count(),0);
    assert.equal(providerRequests,0);
    await page.evaluate(()=>Object.defineProperty(navigator,"clipboard",{value:undefined}));
    await page.locator("#copyAuthLink").click();
    await expect(page.getByRole("textbox",{name:"Link P708 để sao chép"})).toHaveValue("https://p708-room-manager.firebaseapp.com/");
    await page.close();

    const popup=await browser.newPage({serviceWorkers:"block",viewport:{width:390,height:844}});
    const authUrl="https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
    await popup.route(authUrl,route=>route.fulfill({contentType:"text/javascript",body:`
      export * from "${authUrl}?auth-original";
      export async function signInWithPopup(){
        window.testPopupCalls=(window.testPopupCalls||0)+1;
        throw {code:window.testPopupCode||"auth/popup-blocked"};
      }
      export async function signInWithRedirect(){
        window.testRedirectCalls=(window.testRedirectCalls||0)+1;
        throw {code:"auth/network-request-failed"};
      }
      export async function getRedirectResult(){
        window.testRedirectReads=(window.testRedirectReads||0)+1;
        await new Promise(resolve=>{window.retryRedirectProbe=resolve;});
        throw {code:"auth/invalid-credential"};
      }
    `}));
    await popup.goto(base);
    await popup.waitForFunction(()=>typeof window.retryRedirectProbe==="function");
    await expect(popup.locator("#googleLoginButton")).toHaveCount(0);
    await expect(popup.locator("#authGateContent")).toContainText("Đang khôi phục phiên");
    await popup.evaluate(()=>window.retryRedirectProbe());
    await expect(popup.getByRole("alert")).toContainText("Không xác nhận được phiên Google");
    await popup.locator("#googleLoginButton").click();
    await expect(popup.getByRole("alert")).toContainText("Mất kết nối");
    assert.deepEqual(await popup.evaluate(()=>[testPopupCalls,testRedirectCalls,testRedirectReads]),[1,1,1]);
    await popup.evaluate(()=>{window.testPopupCode="auth/popup-closed-by-user";});
    await popup.locator("#googleLoginButton").click();
    await expect(popup.getByRole("alert")).toContainText("Bạn đã đóng");
    await expect(popup.locator("#googleLoginButton")).toBeEnabled();
    assert.equal(await popup.evaluate(()=>testRedirectCalls),1);
    await popup.close();

    if(name==="chromium"){
      const redirect=await browser.newPage({serviceWorkers:"block"});
      await redirect.addInitScript(()=>Object.defineProperty(navigator,"standalone",{value:true}));
      await redirect.route(authUrl,route=>route.fulfill({contentType:"text/javascript",body:`
        export * from "${authUrl}?auth-original";
        export async function signInWithPopup(){throw new Error("Standalone same-origin sign-in must use redirect");}
      `}));
      await redirect.goto(base);
      await redirect.locator("#googleLoginButton").click();
      await redirect.getByText("Sign-in with Google.com",{exact:true}).waitFor({timeout:12000});
      await redirect.getByRole("button",{name:"Add new account"}).click();
      await redirect.locator("#email-input").fill(`p708-redirect-${randomUUID()}@example.test`);
      await redirect.locator("#display-name-input").fill("P708 Redirect");
      await redirect.getByRole("button",{name:"Sign in with Google.com"}).click();
      await expect(redirect.locator("#requestDisplayName")).toHaveValue("P708 Redirect",{timeout:15000});
      await redirect.reload();
      await expect(redirect.locator("#requestDisplayName")).toHaveValue("P708 Redirect",{timeout:15000});
      await redirect.close();
    }

    const account=await testUser(),another=await testUser();
    await env.withSecurityRulesDisabled(async context=>{
      const db=context.firestore();
      await setDoc(doc(db,room),{revision:1,payload:{members:{a:{id:"a",name:"An"},b:{id:"b",name:"Bình"}},schedules:{},presence:{},billingMonths:{},settings:{}}});
      await setDoc(doc(db,room,"access",account.uid),{active:true,role:"member",memberId:"a",displayName:"An",email:account.email});
      await setDoc(doc(db,room,"access",another.uid),{active:false,role:"member",memberId:"b",displayName:"Bình",email:another.email});
    });
    const user=await browser.newPage({serviceWorkers:"block",viewport:{width:390,height:844}});
    const firestore="https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
    await user.route(firestore,route=>route.fulfill({contentType:"text/javascript",body:`
      export * from "${firestore}?auth-original";
      import {onSnapshot as subscribe,getDocFromServer as read} from "${firestore}?auth-original";
      export function getDocFromServer(ref){
        if(ref.path==="rooms/P708")window.p708ServerReads=(window.p708ServerReads||0)+1;
        return read(ref);
      }
      export function onSnapshot(ref,...args){
        if(ref.path==="rooms/P708"&&window.testRoomFailure){
          queueMicrotask(()=>args[2]({code:"permission-denied"}));
          return ()=>{};
        }
        return subscribe(ref,...args);
      }
    `}));
    await user.goto(base);
    await user.locator("#googleLoginButton").waitFor();
    await user.evaluate(()=>{window.testRoomFailure=true;});
    await signIn(user,account);
    await expect(user.getByRole("heading",{name:"Chưa tải được dữ liệu phòng"})).toBeVisible();
    assert.ok(await user.locator("main").evaluate(main=>main.inert));
    await user.evaluate(()=>{window.testRoomFailure=false;});
    await user.locator("#retryAccessButton").click();
    await expect(user.locator("#authGate")).toBeHidden({timeout:15000});
    await expect(user.locator("#homeGreeting")).toHaveText("P708 · An");
    await user.reload();
    await expect(user.locator("#authGate")).toBeHidden({timeout:15000});
    await expect(user.locator("#homeGreeting")).toHaveText("P708 · An");
    await user.evaluate(()=>{
      window.p708ServerReads=0;
      window.dispatchEvent(new PageTransitionEvent("pagehide",{persisted:true}));
      window.dispatchEvent(new PageTransitionEvent("pageshow",{persisted:true}));
    });
    await expect.poll(()=>user.evaluate(()=>window.p708ServerReads),{timeout:5000}).toBe(1);
    await user.context().setOffline(true);
    await expect(user.locator("#googleLoginButton")).toHaveCount(0);
    await user.context().setOffline(false);
    await expect(user.locator("#homeSyncText")).toContainText("Đã đồng bộ",{timeout:15000});
    if(name==="chromium"){
      const fallback=await browser.newPage({serviceWorkers:"block"});
      await fallback.addInitScript(()=>Object.defineProperty(window,"localStorage",{get(){throw new DOMException("Blocked","SecurityError");}}));
      await fallback.goto(base);
      await fallback.locator("#googleLoginButton").waitFor();
      await signIn(fallback,account);
      await expect(fallback.locator("#authGate")).toBeHidden({timeout:15000});
      await fallback.reload();
      await expect(fallback.locator("#authGate")).toBeHidden({timeout:15000});
      await expect(fallback.locator("#homeGreeting")).toHaveText("P708 · An");
      await fallback.close();
    }
    await env.withSecurityRulesDisabled(async context=>{
      await updateDoc(doc(context.firestore(),room,"access",account.uid),{memberId:"b",displayName:"Bình"});
    });
    await expect(user.locator("#homeGreeting")).toHaveText("P708 · Bình");
    await expect(user.locator("#authGate")).toBeHidden({timeout:15000});
    assert.equal(await user.evaluate(()=>myMemberId()),"b");
    await env.withSecurityRulesDisabled(async context=>{
      await updateDoc(doc(context.firestore(),room,"access",account.uid),{active:false});
    });
    await expect(user.getByRole("heading",{name:"Chưa được phép vào phòng"})).toBeVisible({timeout:15000});
    await user.locator("#gateSignOutButton").click();
    await expect(user.locator("#googleLoginButton")).toBeEnabled();
    await signIn(user,another);
    await expect(user.getByRole("heading",{name:"Chưa được phép vào phòng"})).toBeVisible({timeout:15000});
    await expect(user.locator("#homeGreeting")).toHaveText("Phòng P708");
    assert.equal(await user.evaluate(()=>localStorage.getItem(CACHE_KEY)),null);
    await env.withSecurityRulesDisabled(async context=>{
      const db=context.firestore();
      await setDoc(doc(db,room,"accessRequests",another.uid),{uid:another.uid,email:another.email,displayName:"Bình",status:"pending"});
      await deleteDoc(doc(db,room,"access",another.uid));
    });
    await expect(user.getByRole("heading",{name:"Đang chờ trưởng phòng duyệt"})).toBeVisible();
    console.log(name,"mobile auth QA passed (WebView, popup/redirect, room failure, session restore, offline, revoke and account switch)");
  }finally{await browser.close();}
}

try{
  for(const name of names)await exercise(name);
}finally{
  await env.cleanup();
}
