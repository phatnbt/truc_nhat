import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const source=fs.readFileSync("src/features/billing-stable-repair.js","utf8");

let basePersistCalls=0;
let commitCalls=[];
let verifyCalls=0;
let readCalls=0;

const duplicatePayload={members:{a:{id:"a",name:"Hào"},b:{id:"b",name:"Hào"}},presence:{a:true,b:true},billingMonths:{"2026-08":{month:"2026-08",people:{"person:1":{id:"1",memberId:"a",name:"Hào",days:{}},"person:2":{id:"2",memberId:"b",name:"Hào",days:{}}}}},schedules:{},settings:{}};
const cleanPayload={members:{a:{id:"a",name:"Hào"}},presence:{a:true},billingMonths:{"2026-08":{month:"2026-08",people:{"person:1":{id:"1",memberId:"a",name:"Hào",days:{}}}}},schedules:{},settings:{}};
const cleanPersisted={...structuredClone(cleanPayload),updatedAt:"2026-08-27T15:00:00.000Z"};

const service={
  async readServer(){readCalls++;return {revision:7,payload:structuredClone(duplicatePayload)};},
  async commit(desired,options){commitCalls.push({desired:structuredClone(desired),options:structuredClone(options)});},
  async verify(desired){verifyCalls++;return {revision:8,payload:structuredClone(desired),same:true};}
};

const context={
  console,
  navigator:{onLine:true},
  FIREBASE_CONFIG:{apiKey:"test"},ROOM_CODE:"P708",DEVICE_ID:"device",
  createP708AuthoritativeRepair:()=>service,
  state:structuredClone(duplicatePayload),confirmedState:structuredClone(duplicatePayload),
  clone:value=>structuredClone(value),
  fromSyncShape:value=>structuredClone(value),
  toSyncShape:value=>structuredClone(value),
  nowIso:()=>"2026-08-27T15:00:00.000Z",
  saveLocal(){},renderAll(){},toast(){},restoreConfirmedState(){context.state=structuredClone(context.confirmedState);},
  requireAdmin:()=>true,
  realtimeEngine:{},
  persist:async()=>{basePersistCalls++;return true;},
  syncBillingMembers:async()=>{
    context.state=structuredClone(cleanPayload);
    return context.persist("đã sửa",{action:"SYNC_BILL_MEMBERS",summary:"repair"});
  }
};
context.globalThis=context;
vm.createContext(context);
vm.runInContext(source,context,{filename:"billing-stable-repair.js"});

const result=await context.syncBillingMembers();
assert.equal(result,true);
assert.equal(readCalls,1,"must start from authoritative server state");
assert.equal(commitCalls.length,1,"must persist repair exactly once through authoritative service");
assert.equal(commitCalls[0].options.expectedRevision,7,"must guard against concurrent room changes");
assert.deepEqual(commitCalls[0].desired,cleanPersisted,"must write the deduplicated payload, not cached duplicate data");
assert.equal(verifyCalls,1,"must verify server state after commit");
assert.equal(basePersistCalls,0,"SYNC_BILL_MEMBERS must bypass the old optimistic merge path");
assert.deepEqual(context.state,cleanPersisted,"verified clean state must remain visible after repair");

console.log("Stable billing repair regression QA PASSED");
