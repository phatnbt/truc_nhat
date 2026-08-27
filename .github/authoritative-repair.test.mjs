import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

let source=fs.readFileSync("src/core/p708-authoritative-repair.js","utf8");
source=source
  .replace(/import[\s\S]*?from\s+"[^"]+";\n/g,"")
  .replace("export function createP708AuthoritativeRepair","function createP708AuthoritativeRepair");
source+=`\nglobalThis.__repairTest={stableStringify,activeMappedMemberDocs,overlayMemberData};\n`;

const context={console,globalThis:null};
context.globalThis=context;
vm.createContext(context);
vm.runInContext(source,context,{filename:"p708-authoritative-repair.js"});
const {stableStringify,activeMappedMemberDocs,overlayMemberData}=context.__repairTest;

assert.equal(
  stableStringify({b:2,a:{y:2,x:1}}),
  stableStringify({a:{x:1,y:2},b:2}),
  "verification must ignore Firestore map key ordering"
);

const payload={
  members:{m1:{id:"m1",name:"Hào"}},
  presence:{m1:true},
  billingMonths:{
    "2026-08":{month:"2026-08",people:{
      "person:1":{id:"1",memberId:"m1",name:"Hào",days:{"1":false,"2":false}}
    }}
  }
};
const snap=items=>({docs:items.map(item=>({id:item.id,data:()=>item.data}))});
const accessSnap=snap([
  {id:"u1",data:{active:true,memberId:"m1"}},
  {id:"u2",data:{active:false,memberId:"m1"}},
  {id:"u3",data:{active:true,memberId:"wrong"}},
  {id:"u4",data:{active:true,memberId:"m1"}}
]);
const memberSnap=snap([
  {id:"u1",data:{memberId:"m1",presence:true,billingMonths:{"2026-08":{days:{"1":true,"2":false}}},updatedAt:{seconds:10}}},
  {id:"u2",data:{memberId:"m1",presence:false,billingMonths:{"2026-08":{days:{"1":false,"2":false}}},updatedAt:{seconds:999}}},
  {id:"u3",data:{memberId:"m1",presence:false,billingMonths:{"2026-08":{days:{"1":false,"2":false}}},updatedAt:{seconds:999}}},
  {id:"u4",data:{memberId:"m1",presence:true,billingMonths:{"2026-08":{days:{"1":true,"2":true}}},updatedAt:{seconds:20}}}
]);

const selected=activeMappedMemberDocs(payload,memberSnap,accessSnap);
assert.equal(selected.length,1,"only one deterministic active mapped document may overlay each member");
assert.equal(selected[0].uid,"u4","newest valid active mapping must win; inactive/orphan docs must be ignored");

const overlaid=overlayMemberData(payload,selected);
assert.equal(overlaid.presence.m1,true);
assert.equal(overlaid.billingMonths["2026-08"].people["person:1"].days["1"],true);
assert.equal(overlaid.billingMonths["2026-08"].people["person:1"].days["2"],true);

console.log("Authoritative repair verification QA PASSED");
