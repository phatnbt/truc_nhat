import { createRequire } from "node:module";
const require=createRequire(import.meta.url);
const admin=require("../functions/node_modules/firebase-admin");

if(!admin.apps.length)admin.initializeApp({projectId:"p708-room-manager"});
const db=admin.firestore();
const roomId="P708";
const roomRef=db.doc(`rooms/${roomId}`);

const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
const key=value=>String(value||"")
  .normalize("NFKC")
  .trim()
  .replace(/\s+/g," ")
  .toLocaleLowerCase("vi-VN");
const trueDays=days=>Object.values(days||{}).filter(value=>value===true).length;
const canonicalRowKey=person=>`person:${String(person?.id||"").trim()}`;

function mergeRows(entries,canonical){
  const sorted=[...entries].sort((a,b)=>{
    const aCanonical=a.person?.memberId===canonical.id?1:0;
    const bCanonical=b.person?.memberId===canonical.id?1:0;
    return bCanonical-aCanonical
      || trueDays(b.person?.days)-trueDays(a.person?.days)
      || (Number(b.person?.paidAmount)||0)-(Number(a.person?.paidAmount)||0)
      || String(a.rowKey).localeCompare(String(b.rowKey));
  });
  const target=clone(sorted[0].person)||{};
  target.id=String(target.id||sorted[0].rowKey||"").replace(/^person:|^member:/,"")||admin.firestore().collection("_ids").doc().id;
  const allDayKeys=new Set();
  for(const {person} of entries)for(const day of Object.keys(person?.days||{}))allDayKeys.add(day);
  target.days={};
  for(const day of allDayKeys)target.days[day]=entries.some(({person})=>person?.days?.[day]===true);
  target.memberId=canonical.id;
  target.name=canonical.name;
  target.paid=entries.some(({person})=>person?.paid===true);
  target.paidAmount=Math.max(0,...entries.map(({person})=>Number(person?.paidAmount)||0));
  const paymentSource=[...entries].sort((a,b)=>(Number(b.person?.paidAmount)||0)-(Number(a.person?.paidAmount)||0))[0]?.person;
  target.paidAt=paymentSource?.paidAt||entries.find(({person})=>person?.paidAt)?.person?.paidAt||null;
  target.paidBy=paymentSource?.paidBy||entries.find(({person})=>person?.paidBy)?.person?.paidBy||null;
  target.updatedAt=new Date().toISOString();
  return {rowKey:canonicalRowKey(target),person:target};
}

function canonicalizeOpenMonth(bill,members,byName){
  const original=Object.entries(bill.people||{}).map(([rowKey,person])=>({rowKey,person:clone(person)||{}}));
  const excludedIds=new Set((bill.excludedMemberIds||[]).map(value=>String(value||"").trim()).filter(Boolean));
  const excludedKeys=new Set((bill.excludedMemberKeys||[]).map(key).filter(Boolean));
  const groups=new Map();
  let excludedRows=0;

  for(const entry of original){
    const person=entry.person||{},normalized=key(person.name),linked=person.memberId&&members[person.memberId]?{id:person.memberId,name:members[person.memberId]?.name||person.name}:null;
    const candidates=!linked?(byName.get(normalized)||[]):[];
    const canonical=linked||(candidates.length===1?candidates[0]:null);
    const effectiveId=canonical?.id||person.memberId||null;
    const effectiveName=key(canonical?.name||person.name);
    if((effectiveId&&excludedIds.has(effectiveId))||(effectiveName&&excludedKeys.has(effectiveName))){excludedRows++;continue;}

    const logical=canonical?`member:${canonical.id}`:`guest:${String(person.id||entry.rowKey)}`;
    const list=groups.get(logical)||[];
    list.push({...entry,canonical});
    groups.set(logical,list);
  }

  const nextPeople={};
  let duplicateRows=0,keyRewrites=0,relinkedRows=0;
  for(const entries of groups.values()){
    const canonical=entries[0].canonical;
    let row;
    if(canonical){
      row=mergeRows(entries,canonical);
      duplicateRows+=Math.max(0,entries.length-1);
      relinkedRows+=entries.filter(({person})=>person?.memberId!==canonical.id||key(person?.name)!==key(canonical.name)).length;
    }else{
      const chosen=clone(entries[0].person)||{};
      chosen.id=String(chosen.id||entries[0].rowKey||"").replace(/^person:|^member:/,"")||admin.firestore().collection("_ids").doc().id;
      row={rowKey:canonicalRowKey(chosen),person:chosen};
      duplicateRows+=Math.max(0,entries.length-1);
    }
    keyRewrites+=entries.filter(entry=>entry.rowKey!==row.rowKey).length;
    nextPeople[row.rowKey]=row.person;
  }

  const changed=excludedRows>0||duplicateRows>0||keyRewrites>0||relinkedRows>0||Object.keys(nextPeople).length!==original.length;
  return {changed,nextPeople,excludedRows,duplicateRows,keyRewrites,relinkedRows};
}

const result=await db.runTransaction(async tx=>{
  const snap=await tx.get(roomRef);
  if(!snap.exists)throw new Error("Production room P708 does not exist");
  const data=snap.data()||{},payload=clone(data.payload)||{};
  const members=payload.members||{};
  const byName=new Map();
  for(const [id,member] of Object.entries(members)){
    const normalized=key(member?.name);if(!normalized)continue;
    const list=byName.get(normalized)||[];
    list.push({id,name:member?.name||normalized});
    byName.set(normalized,list);
  }

  let removedRows=0,repairedGroups=0,keyRewrites=0,relinkedRows=0,excludedRows=0;
  const repairedMonths=[];
  for(const [month,bill] of Object.entries(payload.billingMonths||{})){
    if(!bill||bill.closed===true)continue;
    const repaired=canonicalizeOpenMonth(bill,members,byName);
    if(!repaired.changed)continue;
    bill.people=repaired.nextPeople;
    bill.updatedAt=new Date().toISOString();
    removedRows+=repaired.duplicateRows+repaired.excludedRows;
    repairedGroups+=repaired.duplicateRows>0?1:0;
    keyRewrites+=repaired.keyRewrites;
    relinkedRows+=repaired.relinkedRows;
    excludedRows+=repaired.excludedRows;
    repairedMonths.push(month);
  }

  if(!repairedMonths.length)return {revision:Number(data.revision)||0,removedRows:0,repairedGroups:0,keyRewrites:0,relinkedRows:0,excludedRows:0,repairedMonths:[]};

  const nextRevision=(Number(data.revision)||0)+1;
  tx.set(roomRef,{
    ...data,
    schemaVersion:5,
    roomCode:roomId,
    revision:nextRevision,
    payload,
    lastDeviceId:"production-billing-canonical-migration",
    updatedAt:admin.firestore.FieldValue.serverTimestamp()
  });
  return {revision:nextRevision,removedRows,repairedGroups,keyRewrites,relinkedRows,excludedRows,repairedMonths,payload};
});

if(result.repairedMonths.length){
  const accessSnap=await db.collection(`rooms/${roomId}/access`).get();
  const batch=db.batch();
  let memberDataWrites=0;
  for(const accessDoc of accessSnap.docs){
    const access=accessDoc.data()||{};
    if(access.active===false||!access.memberId)continue;
    const member=result.payload?.members?.[access.memberId];
    if(!member)continue;
    const billingMonths={};
    for(const month of result.repairedMonths){
      const bill=result.payload?.billingMonths?.[month];
      const person=Object.values(bill?.people||{}).find(row=>row?.memberId===access.memberId);
      if(person)billingMonths[month]={days:clone(person.days||{})};
    }
    const memberRef=db.doc(`rooms/${roomId}/memberData/${accessDoc.id}`);
    const patch={
      memberId:access.memberId,
      presence:result.payload?.presence?.[access.memberId]!==false,
      updatedBy:"production-billing-canonical-migration",
      updatedAt:admin.firestore.FieldValue.serverTimestamp()
    };
    if(Object.keys(billingMonths).length)patch.billingMonths=billingMonths;
    batch.set(memberRef,patch,{merge:true});
    memberDataWrites++;
  }
  if(memberDataWrites)await batch.commit();
  console.log(`P708_REPAIR_RESULT revision=${result.revision} repairedGroups=${result.repairedGroups} removedRows=${result.removedRows} excludedRows=${result.excludedRows} keyRewrites=${result.keyRewrites} relinkedRows=${result.relinkedRows} months=${result.repairedMonths.join(",")} memberDataWrites=${memberDataWrites}`);
}else{
  console.log(`P708_REPAIR_RESULT revision=${result.revision} no_changes_needed=true`);
}
