import assert from "node:assert/strict";
import { createRequire } from "node:module";

const requireFromFunctions=createRequire(new URL("../functions/package.json",import.meta.url));
const {initializeApp,getApps,deleteApp}=requireFromFunctions("firebase-admin/app");
const {getFirestore,FieldValue,Timestamp}=requireFromFunctions("firebase-admin/firestore");
const {checkInPetTransaction,getPetStatus,petStageForXp,PetCheckInError}=requireFromFunctions("./pet-streak");

const projectId="demo-p708-production-audit";
const app=getApps().find(item=>item.name==="pet-checkin-test")||initializeApp({projectId},"pet-checkin-test");
const db=getFirestore(app);
const roomCode="PET_TEST";

const at=(day,hour=3)=>new Date(Date.UTC(2026,0,day,hour)); // 10:00 Asia/Ho_Chi_Minh
const activity=(uid,memberId,id,weekStart,submittedAt)=>({
  id,roomCode,actorUid:uid,actorName:memberId,memberId,scheduleId:`schedule-${weekStart}`,
  weekStart,taskId:"lavabo",taskName:"Lavabo - Toilet",status:"submitted",
  submittedAt:Timestamp.fromDate(submittedAt),updatedAt:Timestamp.fromDate(submittedAt)
});

async function seedUser({uid,memberId,activities}){
  await db.doc(`rooms/${roomCode}/access/${uid}`).set({uid,memberId,role:"member",active:true});
  const schedules={};
  for(const item of activities){
    schedules[item.weekStart]={id:item.scheduleId,weekStart:item.weekStart,assignments:[{taskId:item.taskId,personId:memberId,personName:memberId,cut:false,completed:false}]};
    await db.doc(`rooms/${roomCode}/taskSubmissions/${item.id}`).set(item);
  }
  const roomRef=db.doc(`rooms/${roomCode}`),old=await roomRef.get(),payload=old.exists?old.data()?.payload||{}:{};
  await roomRef.set({schemaVersion:5,roomCode,revision:1,payload:{...payload,schedules:{...(payload.schedules||{}),...schedules}},updatedAt:Timestamp.now()},{merge:true});
}

try{
  const a1=activity("user1","m1","activity-1","2025-12-29",at(1));
  const a2=activity("user1","m1","activity-2","2026-01-05",at(2));
  const a4=activity("user1","m1","activity-4","2026-01-12",at(4));
  await seedUser({uid:"user1",memberId:"m1",activities:[a1,a2,a4]});

  const first=await checkInPetTransaction({db,FieldValue,uid:"user1",roomCode,activityId:a1.id,now:at(1)});
  assert.equal(first.awarded,true);
  assert.equal(first.xpAwarded,20);
  assert.equal(first.profile.xp,20);
  assert.equal(first.profile.currentStreak,1);

  const duplicate=await checkInPetTransaction({db,FieldValue,uid:"user1",roomCode,activityId:a1.id,now:at(1,5)});
  assert.equal(duplicate.awarded,false);
  assert.equal(duplicate.alreadyCheckedIn,true);
  assert.equal(duplicate.profile.xp,20);

  const nextDay=await checkInPetTransaction({db,FieldValue,uid:"user1",roomCode,activityId:a2.id,now:at(2)});
  assert.equal(nextDay.profile.xp,40);
  assert.equal(nextDay.profile.currentStreak,2);

  const missedStatus=await getPetStatus({db,uid:"user1",roomCode,now:at(4)});
  assert.equal(missedStatus.profile.currentStreak,0,"missing 03/01 must reset visible streak");
  assert.equal(missedStatus.profile.xp,40,"missing a day must preserve XP");
  const afterGap=await checkInPetTransaction({db,FieldValue,uid:"user1",roomCode,activityId:a4.id,now:at(4)});
  assert.equal(afterGap.profile.currentStreak,1);
  assert.equal(afterGap.profile.bestStreak,2);
  assert.equal(afterGap.profile.xp,60);

  assert.equal(petStageForXp(0).level,0);
  assert.equal(petStageForXp(100).level,1);
  assert.equal(petStageForXp(300).level,2);
  assert.equal(petStageForXp(700).level,3);

  const concurrentActivity=activity("user2","m2","activity-concurrent","2026-01-19",at(5));
  await seedUser({uid:"user2",memberId:"m2",activities:[concurrentActivity]});
  const concurrent=await Promise.all([
    checkInPetTransaction({db,FieldValue,uid:"user2",roomCode,activityId:concurrentActivity.id,now:at(5)}),
    checkInPetTransaction({db,FieldValue,uid:"user2",roomCode,activityId:concurrentActivity.id,now:at(5)})
  ]);
  assert.equal(concurrent.filter(result=>result.awarded).length,1,"concurrent requests must award once");
  assert.equal(concurrent.filter(result=>result.alreadyCheckedIn).length,1);
  assert.equal((await db.doc(`rooms/${roomCode}/petProfiles/user2`).get()).data().xp,20);

  await assert.rejects(
    ()=>checkInPetTransaction({db,FieldValue,uid:"outsider",roomCode,activityId:concurrentActivity.id,now:at(5)}),
    error=>error instanceof PetCheckInError&&error.code==="permission-denied"
  );

  console.log("Server-authoritative Streak Pet check-in tests passed.");
}finally{
  await deleteApp(app);
}
