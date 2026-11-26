import {execFileSync} from "node:child_process";
import {mkdir} from "node:fs/promises";
import {chromium,webkit,firefox} from "playwright";
import {roomDateKey,addUtcDays,parseDateKey,dateKey} from "../src/core/billing-cycle-period.js";

const refs=process.argv.includes("--before")?["f99b4f0","6ef5469"]:["working"];
const engines=process.argv.includes("--all")?{chromium,webkit,firefox}:{chromium};
const widths=refs[0]==="working"?[320,375,390,430,768,1024,1440]:[390,1440];
const now=parseDateKey(roomDateKey());
const weekStart=dateKey(addUtcDays(now,-((now.getUTCDay()+6)%7)));
const month="2026-08";
const ids=["a","b","c","d"];
const names=["Tiến Phát","Minh Anh","Gia Bảo","Khánh Linh"];
const members=Object.fromEntries(ids.map((id,i)=>[id,{id,name:names[i]}]));
const tasks=["lavabo","san","quet","lau","tham","rac"];
const assignments=tasks.map((taskId,i)=>({taskId,personId:ids[i%ids.length],personName:names[i%ids.length],completed:i===1,cut:false}));
const payload={members,presence:{a:true,b:true,c:true,d:false},schedules:{[weekStart]:{id:"visual-week",weekStart,assignments}},settings:{},billingMonths:{
  [month]:{id:"visual-bill",month,electricity:348000,water:96000,closed:true,people:Object.fromEntries(ids.map((id,i)=>[
    `person:${id}`,{id,memberId:id,name:names[i],days:{"1":true,"2":true},paid:i===1,paidAmount:i===1?111000:0}
  ]))}
}};
const session={status:"active",user:{uid:"visual-admin",displayName:names[0]},access:{active:true,role:"admin",memberId:"a",displayName:"Phát"},adminExists:true};
const engineFixture=`export function createP708SecureEngine(handlers){return {
  async start(){handlers.onSession(${JSON.stringify(session)});handlers.onShape(${JSON.stringify(payload)});handlers.onStatus({mode:"online",text:"Đã đồng bộ"});},
  async forceSync(){return true;}, stop(){}
};}`;
const base="http://127.0.0.1:5178";
const out="test-results/visual";
const fileTypes={js:"text/javascript",html:"text/html",css:"text/css"};
const historical=new Map();
await mkdir(out,{recursive:true});

async function capture(browser,browserName,ref,width){
  const page=await browser.newPage({viewport:{width,height:width<700?844:960},serviceWorkers:"block",reducedMotion:"reduce"});
  const runtimeErrors=[];
  page.on("pageerror",error=>runtimeErrors.push(error.message));
  try{
    await page.addInitScript(({theme})=>{
      localStorage.setItem("P708_THEME",theme);
      window.P708_FIREBASE_CONFIG_OVERRIDE={projectId:"visual-only",apiKey:"visual-fixture-key",authDomain:"localhost",appId:"visual-fixture"};
    },{theme:"light"});
    await page.route(`${base}/**`,async route=>{
      const url=new URL(route.request().url()),path=url.pathname.slice(1)||"index.html";
      if(path==="src/core/p708-secure-sync-engine.js")return route.fulfill({contentType:"text/javascript",body:engineFixture});
      const mime=fileTypes[path.split(".").pop()];
      if(ref==="working"||!mime)return route.continue();
      const key=`${ref}:${path}`;
      if(!historical.has(key))historical.set(key,execFileSync("git",["show",key],{maxBuffer:5e6}));
      return route.fulfill({contentType:`${mime}; charset=utf-8`,body:historical.get(key)});
    });
    await page.goto(base+"/",{waitUntil:"domcontentloaded"});
    await page.locator("#authGate").waitFor({state:"hidden",timeout:25000});
    const views=ref==="f99b4f0"?["home","cleaning","billing","audit"]:["home","cleaning","billing","resources","audit"];
    const errors=[];
    for(const view of views){
      await page.evaluate(view=>showPage(view,{instant:true,replace:true}),view);
      if(view==="billing")await page.evaluate(month=>setBillMonth(month),month);
      for(const theme of ref==="working"?["light","dark"]:["light"]){
        await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
        const widthUsed=await page.evaluate(()=>document.documentElement.scrollWidth);
        if(widthUsed>width)errors.push(`${view} ${theme}: ${widthUsed} > ${width}`);
        if(ref==="working"&&theme==="dark"){
          const selector="#page-"+view+" h1";
          const contrastReady=await page.waitForFunction(selector=>{
            const heading=document.querySelector(selector);
            return heading&&getComputedStyle(heading).color==="rgb(240, 243, 255)";
          },selector,{timeout:1500}).then(()=>true,()=>false);
          if(!contrastReady){
            const color=await page.locator(selector).first().evaluate(node=>getComputedStyle(node).color);
            errors.push(`${view} dark heading: ${color}`);
          }
        }
        if([390,1440].includes(width))await page.screenshot({path:`${out}/${ref}-${browserName}-${width}-${theme}-${view}.png`});
      }
    }
    errors.push(...runtimeErrors);
    console.log(ref,browserName,width,errors.length?errors.join(", "):"layout and theme checks passed");
    if(ref==="working"&&errors.length)process.exitCode=1;
  }finally{await page.close();}
}

for(const [name,engine] of Object.entries(engines)){
  let browser;
  try{
    browser=await engine.launch();
    for(const ref of refs)for(const width of widths)await capture(browser,name,ref,width);
  }catch(error){console.error(name,error.message);process.exitCode=1;}
  finally{await browser?.close();}
}
