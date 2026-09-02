import { createRequire } from "node:module";
const require=createRequire(import.meta.url);
const admin=require("../functions/node_modules/firebase-admin");

if(!admin.apps.length)admin.initializeApp({projectId:"p708-room-manager"});
const db=admin.firestore();
const roomId="P708";
const weekStart="2026-09-01";
const roomRef=db.doc(`rooms/${roomId}`);
const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));

let backupId="",removed=false,beforeRevision=0,afterRevision=0;
await db.runTransaction(async tx=>{
  const snap=await tx.get(roomRef);
  if(!snap.exists)throw new Error("Production room P708 does not exist");
  const room=snap.data()||{};
  beforeRevision=Number(room.revision)||0;
  const payload=clone(room.payload)||{};
  payload.schedules=payload.schedules&&typeof payload.schedules==="object"?payload.schedules:{};
  payload._sync=payload._sync&&typeof payload._sync==="object"?payload._sync:{};
  payload._sync.deletedSchedules=payload._sync.deletedSchedules&&typeof payload._sync.deletedSchedules==="object"?payload._sync.deletedSchedules:{};
  const schedule=payload.schedules[weekStart]||null;

  const tombstone={
    deletedAt:new Date().toISOString(),
    deletedBy:"production-repair",
    scheduleId:schedule?.id||null
  };
  backupId=`cleaning-${weekStart}-rev-${beforeRevision}`;
  const backupRef=db.doc(`rooms/${roomId}/repairBackups/${backupId}`);
  tx.set(backupRef,{
    roomCode:roomId,weekStart,revision:beforeRevision,
    schedule:clone(schedule),createdAt:admin.firestore.FieldValue.serverTimestamp(),
    reason:"Backup before authoritative cleaning schedule deletion repair"
  });

  if(schedule){delete payload.schedules[weekStart];removed=true;}
  payload._sync.deletedSchedules[weekStart]=tombstone;
  const topDeleted=clone(room.deletedSchedules)||{};
  topDeleted[weekStart]=tombstone;
  afterRevision=beforeRevision+1;

  tx.update(roomRef,{
    payload,
    deletedSchedules:topDeleted,
    revision:admin.firestore.FieldValue.increment(1),
    lastAdminUid:room.lastAdminUid||"production-repair",
    lastDeviceId:"production-cleaning-repair",
    updatedAt:admin.firestore.FieldValue.serverTimestamp()
  });
});

const submissions=await db.collection(`rooms/${roomId}/taskSubmissions`).where("weekStart","==",weekStart).get();
for(let offset=0;offset<submissions.docs.length;offset+=400){
  const batch=db.batch();
  for(const task of submissions.docs.slice(offset,offset+400))batch.delete(task.ref);
  await batch.commit();
}

const verify=await roomRef.get();
const data=verify.data()||{};
const stillExists=!!data?.payload?.schedules?.[weekStart];
const tombstone=!!data?.payload?._sync?.deletedSchedules?.[weekStart];
if(stillExists||!tombstone){
  throw new Error(`Verification failed: stillExists=${stillExists} tombstone=${tombstone}`);
}
console.log(JSON.stringify({
  roomId,weekStart,removed,beforeRevision,serverRevision:data.revision,
  backupId,deletedTaskSubmissions:submissions.size,stillExists,tombstone
},null,2));
