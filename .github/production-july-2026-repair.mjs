import { createRequire } from "node:module";
const require=createRequire(import.meta.url);
const admin=require("../functions/node_modules/firebase-admin");

if(!admin.apps.length)admin.initializeApp({projectId:"p708-room-manager"});
const db=admin.firestore();
const roomId="P708";
const targetMonth="2026-07";
const roomRef=db.doc(`rooms/${roomId}`);

const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
const norm=value=>String(value||"")
  .normalize("NFKC")
  .trim()
  .replace(/\s+/g," ")
  .toLocaleLowerCase("vi-VN");
const dayMap=days=>Object.fromEntries(Array.from({length:31},(_,i)=>[String(i+1),days?.[String(i+1)]===true]));
const trueDays=days=>Object.values(dayMap(days)).filter(Boolean).length;
const daySignature=days=>JSON.stringify(dayMap(days));
const rowId=entry=>String(entry?.person?.id||entry?.rowKey||"").replace(/^person:|^member:/,"")||db.collection("_ids").doc().id;
const rowKey=id=>`person:${id}`;

function mergePayments(entries,target){
  target.paid=entries.some(({person})=>person?.paid===true);
  target.paidAmount=Math.max(0,...entries.map(({person})=>Number(person?.paidAmount)||0));
  const paymentSource=[...entries].sort((a,b)=>(Number(b.person?.paidAmount)||0)-(Number(a.person?.paidAmount)||0))[0]?.person;
  target.paidAt=paymentSource?.paidAt||entries.find(({person})=>person?.paidAt)?.person?.paidAt||null;
  target.paidBy=paymentSource?.paidBy||entries.find(({person})=>person?.paidBy)?.person?.paidBy||null;
}

function mergeMemberRows(entries,member){
  const sorted=[...entries].sort((a,b)=>{
    const aLinked=a.person?.memberId===member.id?1:0;
    const bLinked=b.person?.memberId===member.id?1:0;
    return bLinked-aLinked
      || trueDays(b.person?.days)-trueDays(a.person?.days)
      || (Number(b.person?.paidAmount)||0)-(Number(a.person?.paidAmount)||0)
      || String(a.rowKey).localeCompare(String(b.rowKey));
  });
  const target=clone(sorted[0].person)||{};
  target.id=rowId(sorted[0]);
  target.memberId=member.id;
  target.name=member.name;
  target.days={};
  for(let d=1;d<=31;d++)target.days[String(d)]=entries.some(({person})=>person?.days?.[String(d)]===true);
  mergePayments(entries,target);
  target.updatedAt=new Date().toISOString();
  return {rowKey:rowKey(target.id),person:target};
}

function mergeGuestRows(entries){
  const normalizedNames=new Set(entries.map(({person})=>norm(person?.name)).filter(Boolean));
  if(normalizedNames.size!==1)throw new Error("Guest group contains different normalized names");
  const signatures=new Set(entries.map(({person})=>daySignature(person?.days)));
  if(signatures.size>1){
    throw new Error(`Closed-month guest rows for ${entries[0]?.person?.name||"unknown"} have conflicting stay-day data; aborting instead of guessing.`);
  }
  const paidStates=new Set(entries.map(({person})=>`${person?.paid===true}|${Number(person?.paidAmount)||0}`));
  if(paidStates.size>1){
    throw new Error(`Closed-month guest rows for ${entries[0]?.person?.name||"unknown"} have conflicting payment data; aborting instead of guessing.`);
  }
  const chosen=[...entries].sort((a,b)=>String(a.rowKey).localeCompare(String(b.rowKey)))[0];
  const target=clone(chosen.person)||{};
  target.id=rowId(chosen);
  target.memberId=null;
  target.days=dayMap(target.days);
  mergePayments(entries,target);
  target.updatedAt=new Date().toISOString();
  return {rowKey:rowKey(target.id),person:target};
}

function canonicalizeClosedMonth(bill,members){
  const byName=new Map();
  for(const [id,member] of Object.entries(members||{})){
    const k=norm(member?.name);if(!k)continue;
    const list=byName.get(k)||[];list.push({id,name:member?.name||k});byName.set(k,list);
  }

  const original=Object.entries(bill?.people||{}).map(([rowKeyValue,person])=>({rowKey:rowKeyValue,person:clone(person)||{}}));
  const groups=new Map();
  for(const entry of original){
    const person=entry.person||{};
    const linked=person.memberId&&members?.[person.memberId]?{id:person.memberId,name:members[person.memberId]?.name||person.name}:null;
    const candidates=!linked?(byName.get(norm(person.name))||[]):[];
    const member=linked||(candidates.length===1?candidates[0]:null);
    const logical=member?`member:${member.id}`:(norm(person.name)?`guest-name:${norm(person.name)}`:`guest-id:${rowId(entry)}`);
    const list=groups.get(logical)||[];list.push({...entry,member});groups.set(logical,list);
  }

  const nextPeople={};
  let removedRows=0,relinkedRows=0,keyRewrites=0,memberGroups=0,guestGroups=0;
  for(const [logical,entries] of groups.entries()){
    const member=entries[0].member||null;
    const merged=member?mergeMemberRows(entries,member):mergeGuestRows(entries);
    if(member)memberGroups++;else guestGroups++;
    removedRows+=Math.max(0,entries.length-1);
    relinkedRows+=member?entries.filter(({person})=>person?.memberId!==member.id||norm(person?.name)!==norm(member.name)).length:0;
    keyRewrites+=entries.filter(entry=>entry.rowKey!==merged.rowKey).length;
    if(nextPeople[merged.rowKey])throw new Error(`Canonical row key collision: ${merged.rowKey}`);
    nextPeople[merged.rowKey]=merged.person;
  }

  const seenMemberIds=new Set();
  const seenNames=new Set();
  for(const person of Object.values(nextPeople)){
    if(person?.memberId){
      if(seenMemberIds.has(person.memberId))throw new Error(`Duplicate memberId remained after repair: ${person.memberId}`);
      seenMemberIds.add(person.memberId);
    }
    const k=norm(person?.name);
    if(k){
      if(seenNames.has(k))throw new Error(`Duplicate normalized name remained after repair: ${person.name}`);
      seenNames.add(k);
    }
  }

  return {nextPeople,removedRows,relinkedRows,keyRewrites,memberGroups,guestGroups,originalCount:original.length};
}

const accessSnap=await db.collection(`rooms/${roomId}/access`).get();
const activeAccess=accessSnap.docs
  .map(doc=>({uid:doc.id,...doc.data()}))
  .filter(item=>item.active!==false&&item.memberId);
const memberDataBefore={};
for(const item of activeAccess){
  const snap=await db.doc(`rooms/${roomId}/memberData/${item.uid}`).get();
  const data=snap.exists?snap.data()||{}:{};
  memberDataBefore[item.uid]={
    exists:snap.exists,
    memberId:data.memberId||item.memberId||null,
    billingMonth:clone(data?.billingMonths?.[targetMonth]??null)
  };
}

const result=await db.runTransaction(async tx=>{
  const snap=await tx.get(roomRef);
  if(!snap.exists)throw new Error("Production room P708 does not exist");
  const data=snap.data()||{};
  const payload=clone(data.payload)||{};
  const bill=payload?.billingMonths?.[targetMonth];
  if(!bill)throw new Error(`Billing month ${targetMonth} does not exist`);
  if(bill.closed!==true)throw new Error(`Billing month ${targetMonth} is not closed; refusing historical repair`);

  const before=clone(bill);
  const beforeElectricity=Number(bill.electricity)||0;
  const beforeWater=Number(bill.water)||0;
  const repaired=canonicalizeClosedMonth(bill,payload.members||{});
  if(repaired.removedRows===0&&repaired.relinkedRows===0&&repaired.keyRewrites===0){
    return {changed:false,revision:Number(data.revision)||0,backupId:null,...repaired};
  }

  bill.people=repaired.nextPeople;
  bill.closed=true;
  bill.electricity=beforeElectricity;
  bill.water=beforeWater;
  bill.updatedAt=new Date().toISOString();
  bill.historicalRepair={
    version:1,
    repairedAt:new Date().toISOString(),
    sourceRevision:Number(data.revision)||0,
    note:"Canonicalized duplicate July 2026 billing rows after production audit"
  };

  const sourceRevision=Number(data.revision)||0;
  const nextRevision=sourceRevision+1;
  const backupId=`billing-${targetMonth}-rev-${sourceRevision}`;
  const backupRef=db.doc(`rooms/${roomId}/backups/${backupId}`);
  const backupSnap=await tx.get(backupRef);
  if(backupSnap.exists)throw new Error(`Backup ${backupId} already exists; refusing to overwrite historical backup`);

  tx.set(backupRef,{
    type:"billing-month-backup",
    roomCode:roomId,
    month:targetMonth,
    sourceRevision,
    reason:"Repair duplicate rows in closed July 2026 billing data",
    billingMonth:before,
    memberData:memberDataBefore,
    createdAt:admin.firestore.FieldValue.serverTimestamp()
  });
  tx.update(roomRef,{
    revision:nextRevision,
    payload,
    lastDeviceId:"historical-july-2026-repair",
    updatedAt:admin.firestore.FieldValue.serverTimestamp()
  });
  return {changed:true,revision:nextRevision,backupId,...repaired};
});

if(result.changed){
  const roomAfter=(await roomRef.get()).data()||{};
  const afterBill=roomAfter?.payload?.billingMonths?.[targetMonth];
  if(!afterBill||afterBill.closed!==true)throw new Error("Verification failed: July 2026 is missing or no longer closed");
  const people=Object.values(afterBill.people||{});
  const seenMemberIds=new Set(),seenNames=new Set();
  for(const person of people){
    if(person?.memberId){
      if(seenMemberIds.has(person.memberId))throw new Error(`Verification failed: duplicate memberId ${person.memberId}`);
      seenMemberIds.add(person.memberId);
    }
    const k=norm(person?.name);
    if(k){
      if(seenNames.has(k))throw new Error(`Verification failed: duplicate name ${person.name}`);
      seenNames.add(k);
    }
  }

  const batch=db.batch();
  let memberDataWrites=0;
  for(const item of activeAccess){
    const person=people.find(row=>row?.memberId===item.memberId);
    if(!person)continue;
    const memberRef=db.doc(`rooms/${roomId}/memberData/${item.uid}`);
    batch.set(memberRef,{
      memberId:item.memberId,
      billingMonths:{[targetMonth]:{days:dayMap(person.days)}},
      updatedBy:"historical-july-2026-repair",
      updatedAt:admin.firestore.FieldValue.serverTimestamp()
    },{merge:true});
    memberDataWrites++;
  }
  if(memberDataWrites)await batch.commit();

  console.log(`P708_JULY_REPAIR_RESULT revision=${result.revision} backup=${result.backupId} originalRows=${result.originalCount} finalRows=${people.length} removedRows=${result.removedRows} relinkedRows=${result.relinkedRows} keyRewrites=${result.keyRewrites} memberGroups=${result.memberGroups} guestGroups=${result.guestGroups} memberDataWrites=${memberDataWrites}`);
}else{
  console.log(`P708_JULY_REPAIR_RESULT revision=${result.revision} no_changes_needed=true`);
}
