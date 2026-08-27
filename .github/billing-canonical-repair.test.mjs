import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const source=fs.readFileSync("src/features/billing-canonical-repair.js","utf8");

let basePersistCalls=0;
let commitCalls=[];
let verifyCalls=0;
let readCalls=0;
let mappingCalls=[];

const duplicatePayload={members:{a:{id:"a",name:"Hào"},b:{id:"b",name:"Hào"}},presence:{a:true,b:true},billingMonths:{"2026-08":{month:"2026-08",people:{"person:1":{id:"1",memberId:"a",name:"Hào",days:{}},"person:2":{id:"2",memberId:"b",name:"Hào",days:{}}}}},schedules:{},settings:{}};
const cleanPayload={members:{a:{id:"a",name:"Hào"}},presence:{a:true},billingMonths:{"2026-08":{month:"2026-08",people:{"person:1":{id:"1",memberId:"a",name:"Hào",days:{}}}}},schedules:{},settings:{}};
const cleanPersisted={...structuredClone(cleanPayload),updatedAt:"2026-08-27T15:00:00.000Z"};

const service={
  async readServer(){readCalls++;return {revision:7,payload:structuredClone(duplicatePayload),roomPayload:structuredClone(duplicatePayload),accesses:[{uid:"u",memberId:"b",active:true}]};},
  async commit(desired,options){commitCalls.push({desired:structuredClone(desired),options:structuredClone(options)});},
  async verify(desired){verifyCalls++;return {revision:8,payload:structuredClone(desired),roomPayload:structuredClone(desired),accesses:[{uid:"u",memberId:"a",active:true}],same:true};}
};
const mappingService={
  async repair(options){mappingCalls.push(structuredClone(options));return {remapped:1,accesses:[{uid:"u",memberId:"a",active:true}]};}
};

const context={
  console,
  navigator:{onLine:true},
  FIREBASE_CONFIG:{apiKey:"test"},ROOM_CODE:"P708",DEVICE_ID:"device",
  createP708AuthoritativeRepair:()=>service,
  createP708CanonicalMappingRepair:()=>mappingService,
  accessAccounts:[],
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
vm.runInContext(source,context,{filename:"billing-canonical-repair.js"});

const result=await context.syncBillingMembers();
assert.equal(result,true);
assert.equal(readCalls,1,"must start from authoritative server state");
assert.equal(commitCalls.length,1,"must persist repair exactly once through authoritative service");
assert.equal(commitCalls[0].options.expectedRevision,7,"must guard against concurrent room changes");
assert.deepEqual(commitCalls[0].desired,cleanPersisted,"must write the deduplicated payload, not cached duplicate data");
assert.equal(mappingCalls.length,1,"must remap accounts that still point at removed duplicate IDs");
assert.deepEqual(mappingCalls[0].beforePayload,duplicatePayload,"mapping repair needs the pre-dedup identity map");
assert.deepEqual(mappingCalls[0].desiredPayload,cleanPersisted,"mapping repair must target the canonical payload");
assert.equal(verifyCalls,1,"must verify server state after commit and mapping repair");
assert.equal(basePersistCalls,0,"SYNC_BILL_MEMBERS must bypass the old optimistic merge path");
assert.deepEqual(context.state,cleanPersisted,"verified clean state must remain visible after repair");
assert.equal(context.accessAccounts[0].memberId,"a","UI mapping cache must move to the canonical member ID");

console.log("Canonical billing repair regression QA PASSED");
