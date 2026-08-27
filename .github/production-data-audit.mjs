import { createRequire } from "node:module";
const require=createRequire(import.meta.url);
const admin=require("../functions/node_modules/firebase-admin");

if(!admin.apps.length)admin.initializeApp({projectId:"p708-room-manager"});
const db=admin.firestore();
const roomId="P708";

const key=value=>String(value||"")
  .normalize("NFKC")
  .trim()
  .replace(/\s+/g," ")
  .toLocaleLowerCase("vi-VN");
const trueDays=days=>Object.values(days||{}).filter(value=>value===true).length;
const stamp=value=>{
  if(value&&typeof value.toDate==="function")return value.toDate().toISOString();
  const parsed=Date.parse(value||"");
  return Number.isFinite(parsed)?new Date(parsed).toISOString():null;
};
const deviceTag=value=>{
  const text=String(value||"");
  return text?text.slice(-8):null;
};

const [roomSnap,accessSnap,memberDataSnap,recentAuditSnap]=await Promise.all([
  db.doc(`rooms/${roomId}`).get(),
  db.collection(`rooms/${roomId}/access`).get(),
  db.collection(`rooms/${roomId}/memberData`).get(),
  db.collection(`rooms/${roomId}/auditLogs`).orderBy("createdAt","desc").limit(20).get()
]);
if(!roomSnap.exists)throw new Error("Production room P708 does not exist");

const room=roomSnap.data()||{},payload=room.payload||{},members=payload.members||{};
const memberIds=new Set(Object.keys(members));
const memberNameById=new Map(Object.entries(members).map(([id,member])=>[id,key(member?.name)]));

const memberGroups=new Map();
for(const [id,member] of Object.entries(members)){
  const name=key(member?.name);if(!name)continue;
  const list=memberGroups.get(name)||[];list.push(id);memberGroups.set(name,list);
}
const memberDuplicateGroups=[...memberGroups.entries()]
  .filter(([,ids])=>ids.length>1)
  .map(([name,ids])=>({name,memberRecords:ids.length}));

const billingDuplicateGroups=[];
const billingOrphans=[];
for(const [month,bill] of Object.entries(payload.billingMonths||{})){
  const groups=new Map();
  for(const person of Object.values(bill?.people||{})){
    const name=key(person?.name);if(!name)continue;
    const list=groups.get(name)||[];list.push(person);groups.set(name,list);
    if(person?.memberId&&!memberIds.has(person.memberId)){
      billingOrphans.push({month,name,days:trueDays(person.days)});
    }
  }
  for(const [name,rows] of groups){
    if(rows.length<2)continue;
    billingDuplicateGroups.push({
      month,name,rows:rows.length,
      currentMemberRows:rows.filter(row=>row?.memberId&&memberIds.has(row.memberId)).length,
      orphanMemberRows:rows.filter(row=>row?.memberId&&!memberIds.has(row.memberId)).length,
      nullMemberRows:rows.filter(row=>!row?.memberId).length,
      dayCounts:rows.map(row=>trueDays(row.days)).sort((a,b)=>b-a),
      closed:bill?.closed===true
    });
  }
}

const accesses=accessSnap.docs.map(doc=>doc.data()||{});
const accessSummary=[];
for(const account of accesses){
  const memberId=account.memberId||null;
  const mappedName=memberId?memberNameById.get(memberId)||null:null;
  accessSummary.push({
    displayName:key(account.displayName),
    active:account.active!==false,
    role:account.role||null,
    mapping:mappedName?"current":memberId?"orphan":"none",
    memberName:mappedName||key(account.displayName)||null
  });
}
const accessAliasGroups=[];
const accessByName=new Map();
for(const item of accessSummary.filter(item=>item.active&&item.memberName)){
  const list=accessByName.get(item.memberName)||[];list.push(item);accessByName.set(item.memberName,list);
}
for(const [name,items] of accessByName){
  if(items.length>1)accessAliasGroups.push({name,activeAccounts:items.length,mappings:items.map(item=>item.mapping)});
}

const orphanMemberData=memberDataSnap.docs
  .map(doc=>doc.data()||{})
  .filter(data=>data.memberId&&!memberIds.has(data.memberId))
  .map(data=>({daysByMonth:Object.fromEntries(Object.entries(data.billingMonths||{}).map(([month,value])=>[month,trueDays(value?.days)]))}));

const august=payload.billingMonths?.["2026-08"]||{};
const augustRows=Object.entries(august.people||{}).map(([rowKey,person])=>({
  rowKey,
  id:String(person?.id||""),
  name:key(person?.name),
  mappedName:person?.memberId?memberNameById.get(person.memberId)||null:null,
  days:trueDays(person?.days),
  updatedAt:stamp(person?.updatedAt),
  createdAt:stamp(person?.createdAt)
})).sort((a,b)=>a.name.localeCompare(b.name)||a.rowKey.localeCompare(b.rowKey));

const memberDataAugust=memberDataSnap.docs.map(doc=>doc.data()||{}).filter(data=>data?.memberId).map(data=>({
  name:memberNameById.get(data.memberId)||"unknown",
  days:trueDays(data.billingMonths?.["2026-08"]?.days),
  updatedAt:stamp(data.updatedAt),
  updatedByTag:deviceTag(data.updatedBy)
})).sort((a,b)=>a.name.localeCompare(b.name));

const recentAudit=recentAuditSnap.docs.map(doc=>{
  const data=doc.data()||{};
  return {
    action:data.action||null,
    summary:data.summary||null,
    targetName:data.targetMemberId?memberNameById.get(data.targetMemberId)||"unknown":null,
    createdAt:stamp(data.createdAt),
    deviceTag:deviceTag(data.deviceId)
  };
});

const report={
  revision:Number(room.revision)||0,
  roomUpdatedAt:stamp(room.updatedAt),
  lastDeviceTag:deviceTag(room.lastDeviceId),
  memberCount:Object.keys(members).length,
  memberDuplicateGroups,
  billingDuplicateGroups,
  billingOrphans,
  augustDiagnostics:{
    excludedMemberNames:(august.excludedMemberIds||[]).map(id=>memberNameById.get(id)||"unknown"),
    excludedMemberKeys:august.excludedMemberKeys||[],
    rowCount:augustRows.length,
    rows:augustRows
  },
  memberDataAugust,
  recentAudit,
  accessAliasGroups,
  accessSummary,
  orphanMemberDataCount:orphanMemberData.length,
  orphanMemberData
};
console.log("P708_PRODUCTION_DATA_AUDIT="+JSON.stringify(report,null,2));
