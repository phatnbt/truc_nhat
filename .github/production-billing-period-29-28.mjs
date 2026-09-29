import { createRequire } from "node:module";
import { migrateBillingPeriods } from "./production-billing-period-migration-lib.mjs";
import { cycleBounds } from "../src/core/billing-cycle-period.js";

const require=createRequire(import.meta.url);
const admin=require("../functions/node_modules/firebase-admin");

if(!admin.apps.length)admin.initializeApp({projectId:"p708-room-manager"});
const db=admin.firestore(),roomId="P708",roomRef=db.doc(`rooms/${roomId}`);

const result=await db.runTransaction(async tx=>{
  const snap=await tx.get(roomRef);
  if(!snap.exists)throw new Error("Production room P708 does not exist");
  const data=snap.data()||{},sourceRevision=Number(data.revision)||0;
  const migrated=migrateBillingPeriods(data.payload,{updatedAt:new Date().toISOString()});
  if(!migrated.changedMonths.length)return {changed:false,revision:sourceRevision,months:[]};

  const backupId=`billing-period-29-28-rev-${sourceRevision}`;
  const backupRef=db.doc(`rooms/${roomId}/backups/${backupId}`);
  const backupSnap=await tx.get(backupRef);
  if(backupSnap.exists)throw new Error(`Backup ${backupId} already exists; refusing to overwrite it`);

  tx.set(backupRef,{
    type:"billing-period-backup",
    roomCode:roomId,
    sourceRevision,
    reason:"Change electricity billing periods to day 29 through day 28",
    billingMonths:migrated.beforeMonths,
    createdAt:admin.firestore.FieldValue.serverTimestamp()
  });
  tx.update(roomRef,{
    revision:sourceRevision+1,
    payload:migrated.payload,
    lastDeviceId:"production-billing-period-29-28",
    updatedAt:admin.firestore.FieldValue.serverTimestamp()
  });
  return {changed:true,revision:sourceRevision+1,months:migrated.changedMonths,backupId};
});

const verified=(await roomRef.get()).data()||{};
for(const month of result.months){
  const bill=verified.payload?.billingMonths?.[month];
  const expected=cycleBounds(month);
  if(bill?.cycleStart!==expected.start||bill?.cycleEnd!==expected.end||bill?.cycleRule!=="29-28"){
    throw new Error(`Verification failed for billing period ${month}`);
  }
}

if(result.changed){
  console.log(`P708_BILLING_PERIOD_MIGRATION revision=${result.revision} backup=${result.backupId} months=${result.months.join(",")}`);
}else{
  console.log(`P708_BILLING_PERIOD_MIGRATION revision=${result.revision} no_changes_needed=true`);
}
