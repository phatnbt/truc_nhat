import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import { buildCanonicalAccessRemapPlan, identityNameKey } from "../src/core/p708-identity-plan.js";

{
  const beforePayload={members:{
    "phat-old":{id:"phat-old",name:"Phát"},
    "phat-live":{id:"phat-live",name:" Phát "},
    "thinh-old":{id:"thinh-old",name:"Thịnh"},
    "thinh-live":{id:"thinh-live",name:"Thịnh"}
  }};
  const desiredPayload={members:{
    "phat-live":{id:"phat-live",name:"Phát"},
    "thinh-live":{id:"thinh-live",name:"Thịnh"}
  }};
  const accesses=[
    {uid:"u-phat",memberId:"phat-old",displayName:"Phát",active:true},
    {uid:"u-thinh",memberId:"thinh-old",displayName:"Thịnh",active:true},
    {uid:"u-stale",memberId:"phat-old",displayName:"Phát",active:false},
    {uid:"u-good",memberId:"phat-live",displayName:"Phát",active:true}
  ];
  const plan=buildCanonicalAccessRemapPlan({beforePayload,desiredPayload,accesses});
  assert.deepEqual(plan.map(item=>[item.uid,item.canonicalMemberId]),[
    ["u-phat","phat-live"],
    ["u-thinh","thinh-live"],
    ["u-stale","phat-live"]
  ]);
  assert.equal(identityNameKey("  Hữu   Ý "),identityNameKey("Hữu Ý"));
}

{
  const source=fs.readFileSync("src/features/canonical-identity-repair.js","utf8");
  const state={members:[
    {id:"old",name:"Thịnh",createdAt:"2026-01-01"},
    {id:"live",name:"Thịnh",createdAt:"2026-02-01"}
  ]};
  const originalAccounts=[
    {uid:"a",memberId:"old",active:true},
    {uid:"b",memberId:"live",active:true},
    {uid:"c",memberId:"old",active:false}
  ];
  let seenAccounts=[];
  const context={
    state,
    accessAccounts:originalAccounts,
    duplicateMemberGroups:()=>[["thịnh",state.members]],
    memberReferenceScore:id=>id==="live"?50:10,
    timeMs:value=>Date.parse(value||"")||0,
    memberNameKey:value=>String(value||"").trim().toLocaleLowerCase("vi-VN"),
    mergeBillingRowsForIdentity:()=>0,
    repairDuplicateMembersInMemory(){
      seenAccounts=context.accessAccounts.map(item=>({...item}));
      return {cancelled:false,conflicts:seenAccounts.length>1?["conflict"]:[],mergedGroups:1,mergedBillingRows:0};
    }
  };
  vm.createContext(context);
  vm.runInContext(source,context,{filename:"canonical-identity-repair.js"});
  const result=context.repairDuplicateMembersInMemory({ask:false});
  assert.equal(seenAccounts.length,1,"only the preferred active mapping may participate in canonical selection");
  assert.equal(seenAccounts[0].memberId,"live","most referenced duplicate member ID must win");
  assert.equal(result.conflicts.length,0,"multiple active aliases of the same logical name must no longer block repair");
  assert.equal(context.accessAccounts,originalAccounts,"global access list must be restored after repair");
}

{
  const source=fs.readFileSync("src/features/canonical-identity-repair.js","utf8");
  const bill={month:"2026-08",closed:false,people:[
    {id:"canonical-row",memberId:"hung-live",name:"Hùng",days:{}},
    {id:"orphan-row",memberId:"hung-old",name:" Hùng ",days:{"1":true}},
    {id:"legacy-row",memberId:null,name:"Hùng",days:{"2":true}}
  ]};
  const state={members:[{id:"hung-live",name:"Hùng",createdAt:"2026-01-01"}],billing:{months:[bill]}};
  let mergeCall=null;
  const context={
    state,
    accessAccounts:[],
    duplicateMemberGroups:()=>[],
    memberReferenceScore:()=>0,
    timeMs:value=>Date.parse(value||"")||0,
    memberNameKey:value=>String(value||"").normalize("NFKC").trim().replace(/\s+/g," ").toLocaleLowerCase("vi-VN"),
    mergeBillingRowsForIdentity(targetBill,canonical,ids,key){
      mergeCall={canonical:canonical.id,ids:[...ids].sort(),key};
      targetBill.people=[targetBill.people[0]];
      targetBill.people[0].memberId=canonical.id;
      return 2;
    },
    repairDuplicateMembersInMemory:()=>({cancelled:false,conflicts:[],mergedGroups:0,mergedBillingRows:0})
  };
  vm.createContext(context);
  vm.runInContext(source,context,{filename:"canonical-identity-repair.js"});
  const result=context.repairDuplicateMembersInMemory({ask:false});
  assert.deepEqual(mergeCall,{canonical:"hung-live",ids:["hung-live","hung-old"],key:"hùng"},"orphan non-null memberIds must be merged by normalized name");
  assert.equal(result.mergedBillingRows,2,"orphan and legacy billing rows must count as merged");
  assert.equal(context.state.billing.months[0].people.length,1,"only one canonical billing row may remain");
}

console.log("Canonical identity regression QA PASSED");
