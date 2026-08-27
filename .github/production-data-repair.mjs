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
  return {rowKey:sorted[0].rowKey,person:target};
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

  let removedRows=0,repairedGroups=0;
  const repairedMonths=[];
  for(const [month,bill] of Object.entries(payload.billingMonths||{})){
    if(!bill||bill.closed===true)continue;
    const people=bill.people||{};
    const rowGroups=new Map();
    for(const [rowKey,person] of Object.entries(people)){
      const normalized=key(person?.name);if(!normalized)continue;
      const list=rowGroups.get(normalized)||[];
      list.push({rowKey,person});
      rowGroups.set(normalized,list);
    }

    let monthChanged=false;
    for(const [normalized,entries] of rowGroups){
      if(entries.length<2)continue;
      const candidates=byName.get(normalized)||[];
      if(candidates.length!==1)continue;
      const canonical=candidates[0];
      const merged=mergeRows(entries,canonical);
      for(const {rowKey} of entries)delete people[rowKey];
      people[merged.rowKey]=merged.person;
      removedRows+=entries.length-1;
      repairedGroups++;
      monthChanged=true;
    }
    if(monthChanged){
      bill.people=people;
      bill.updatedAt=new Date().toISOString();
      repairedMonths.push(month);
    }
  }

  if(!removedRows)return {revision:Number(data.revision)||0,removedRows:0,repairedGroups:0,repairedMonths:[]};

  const nextRevision=(Number(data.revision)||0)+1;
  tx.set(roomRef,{
    ...data,
    schemaVersion:5,
    roomCode:roomId,
    revision:nextRevision,
    payload,
    lastDeviceId:"production-billing-dedup-migration",
    updatedAt:admin.firestore.FieldValue.serverTimestamp()
  });
  return {revision:nextRevision,removedRows,repairedGroups,repairedMonths,payload};
});

if(result.removedRows){
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
    if(!Object.keys(billingMonths).length)continue;
    const memberRef=db.doc(`rooms/${roomId}/memberData/${accessDoc.id}`);
    batch.set(memberRef,{
      memberId:access.memberId,
      presence:result.payload?.presence?.[access.memberId]!==false,
      billingMonths,
      updatedBy:"production-billing-dedup-migration",
      updatedAt:admin.firestore.FieldValue.serverTimestamp()
    },{merge:true});
    memberDataWrites++;
  }
  if(memberDataWrites)await batch.commit();
  console.log(`P708_REPAIR_RESULT revision=${result.revision} repairedGroups=${result.repairedGroups} removedRows=${result.removedRows} months=${result.repairedMonths.join(",")} memberDataWrites=${memberDataWrites}`);
}else{
  console.log(`P708_REPAIR_RESULT revision=${result.revision} no_changes_needed=true`);
}
