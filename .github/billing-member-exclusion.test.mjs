import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const source=fs.readFileSync("src/features/billing-membership-exclusion.js","utf8");

const bill={
  id:"bill-2026-08",
  month:"2026-08",
  electricity:0,
  water:0,
  closed:false,
  people:[
    {id:"p-phat",memberId:"m-phat",name:"Phát",days:{"1":true},paid:false,paidAmount:0,updatedAt:"2026-08-27T10:00:00.000Z"},
    {id:"p-hung",memberId:"m-hung",name:"Hùng",days:{"2":true},paid:false,paidAmount:0,updatedAt:"2026-08-27T10:00:00.000Z"},
    {id:"p-hao",memberId:"m-hao",name:"Hào",days:{"3":true},paid:false,paidAmount:0,updatedAt:"2026-08-27T10:00:00.000Z"}
  ],
  updatedAt:"2026-08-27T10:00:00.000Z"
};

const input={value:""};
let idCounter=0;
const persistCalls=[];
const context={
  state:{
    members:[
      {id:"m-phat",name:"Phát"},
      {id:"m-hung",name:"Hùng"},
      {id:"m-hao",name:"Hào"}
    ],
    billing:{selectedMonth:"2026-08",months:[bill]}
  },
  ui:{activeBillPersonId:"p-phat"},
  requireAdmin:()=>true,
  ensureBill:()=>bill,
  currentBill:()=>bill,
  activeBillPerson:target=>target.people.find(person=>person.id===context.ui.activeBillPersonId)||target.people[0]||null,
  confirm:()=>true,
  toast:()=>{},
  closeModal:()=>{},
  $:selector=>selector==="#billNewPersonName"?input:null,
  uid:()=>`generated-${++idCounter}`,
  nowIso:()=>`2026-08-27T10:00:${String(idCounter).padStart(2,"0")}.000Z`,
  timeMs:value=>Date.parse(value||"")||0,
  monthDays:()=>31,
  monthLabel:()=>"Tháng 8/2026",
  persist:(message,audit)=>{persistCalls.push({message,audit});return true;},
  syncBillingMembers(){throw new Error("base sync should be replaced");},
  removeBillingPerson(){throw new Error("base remove should be replaced");},
  addBillingPerson(){throw new Error("base add should be replaced");}
};

vm.createContext(context);
vm.runInContext(source,context,{filename:"billing-membership-exclusion.js"});

context.removeBillingPerson();
assert.equal(JSON.stringify(bill.excludedMemberIds),JSON.stringify(["m-phat"]),"deleted linked member must be tombstoned for this month");
assert.equal(bill.people.some(person=>person.memberId==="m-phat"),false,"deleted member must leave the month immediately");

bill.people.push(
  {id:"dup-hung",memberId:"m-hung",name:"Hùng",days:{"4":true},paid:false,paidAmount:0,updatedAt:"2026-08-27T11:00:00.000Z"},
  {id:"legacy-hao",memberId:null,name:"  Hào  ",days:{"5":true},paid:false,paidAmount:0,updatedAt:"2026-08-27T11:00:00.000Z"}
);

context.syncBillingMembers();
const afterFirstSync=[...bill.people];
assert.equal(afterFirstSync.some(person=>person.memberId==="m-phat"),false,"sync must not resurrect a member explicitly removed from the month");
assert.equal(afterFirstSync.filter(person=>person.memberId==="m-hung").length,1,"sync must collapse duplicate linked rows");
assert.equal(afterFirstSync.filter(person=>person.memberId==="m-hao").length,1,"sync must relink and collapse legacy rows");
assert.equal(afterFirstSync.find(person=>person.memberId==="m-hung").days["2"],true);
assert.equal(afterFirstSync.find(person=>person.memberId==="m-hung").days["4"],true,"dedup must preserve marked stay days");
assert.equal(afterFirstSync.find(person=>person.memberId==="m-hao").days["3"],true);
assert.equal(afterFirstSync.find(person=>person.memberId==="m-hao").days["5"],true,"legacy dedup must preserve marked stay days");

const stableIds=[...afterFirstSync].map(person=>person.id).sort();
context.syncBillingMembers();
assert.equal(JSON.stringify([...bill.people].map(person=>person.id).sort()),JSON.stringify(stableIds),"repeated sync must be idempotent and must not grow the list");
assert.equal(bill.people.some(person=>person.memberId==="m-phat"),false,"second sync must still respect the tombstone");

input.value="Phát";
context.addBillingPerson();
assert.equal(bill.excludedMemberIds.includes("m-phat"),false,"manual add must explicitly clear the month exclusion");
assert.equal(bill.people.filter(person=>person.memberId==="m-phat").length,1,"manual re-add must restore one linked row only");

context.syncBillingMembers();
assert.equal(bill.people.length,3,"after explicit restore the month must contain exactly the three current members");
assert.equal(new Set([...bill.people].map(person=>person.memberId)).size,3,"restored month must not contain duplicate member mappings");
assert.ok(persistCalls.some(call=>call.audit?.action==="REMOVE_BILL_PERSON"));
assert.ok(persistCalls.some(call=>call.audit?.action==="SYNC_BILL_MEMBERS"));
assert.ok(persistCalls.some(call=>call.audit?.action==="ADD_BILL_PERSON"));

console.log("Billing member exclusion regression QA PASSED");
