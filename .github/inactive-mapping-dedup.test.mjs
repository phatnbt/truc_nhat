import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const source=fs.readFileSync("src/features/inactive-mapping-dedup-fix.js","utf8");

function makeContext({throwInside=false}={}){
  const seen=[];
  const context={
    accessAccounts:[
      {uid:"active",memberId:"member-live",active:true},
      {uid:"inactive",memberId:"member-old",active:false},
      {uid:"legacy-active",memberId:"member-legacy"}
    ],
    repairDuplicateMembersInMemory(options){
      seen.push(this?.accessAccounts||context.accessAccounts);
      if(throwInside)throw new Error("boom");
      return {options,ids:context.accessAccounts.map(item=>item.uid)};
    }
  };
  vm.createContext(context);
  vm.runInContext(source,context,{filename:"inactive-mapping-dedup-fix.js"});
  return {context,seen};
}

{
  const {context}=makeContext();
  const original=context.accessAccounts;
  const result=context.repairDuplicateMembersInMemory({ask:false});
  assert.deepEqual([...result.ids],["active","legacy-active"],"inactive access mappings must not participate in duplicate conflict detection");
  assert.equal(context.accessAccounts,original,"global account list must be restored after repair");
  assert.equal(context.accessAccounts.length,3);
}

{
  const {context}=makeContext({throwInside:true});
  const original=context.accessAccounts;
  assert.throws(()=>context.repairDuplicateMembersInMemory({ask:false}),/boom/);
  assert.equal(context.accessAccounts,original,"global account list must also be restored when repair throws");
}

console.log("Inactive mapping dedup regression QA PASSED");
