import fs from "node:fs";
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails
} from "@firebase/rules-unit-testing";
import {
  doc, collection, query, where, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  serverTimestamp, Timestamp
} from "firebase/firestore";

const projectId="demo-p708-production-audit";
const roomId="P708";
const weekStart="2026-08-31";
const rules=fs.readFileSync("firestore-secure.rules","utf8");
const env=await initializeTestEnvironment({projectId,firestore:{rules}});

const roomPayload={
  members:{
    m1:{id:"m1",name:"Member One"},
    m2:{id:"m2",name:"Member Two"}
  },
  presence:{m1:true,m2:true},
  schedules:{
    [weekStart]:{
      id:"schedule-1",weekStart,
      assignments:[
        {taskId:"lavabo",task:"Lavabo - Toilet",personId:"m1",personName:"Member One",cut:false,completed:false},
        {taskId:"san",task:"Sàn NVS - cống",personId:"m2",personName:"Member Two",cut:false,completed:false}
      ]
    }
  },
  billingMonths:{},
  settings:{weights:{lavabo:5,san:5,quet:3,lau:4,tham:2,rac:2}}
};

await env.withSecurityRulesDisabled(async context=>{
  const db=context.firestore();
  await setDoc(doc(db,`rooms/${roomId}/security/config`),{roomCode:roomId,adminUid:"admin",createdAt:Timestamp.now()});
  await setDoc(doc(db,`rooms/${roomId}`),{schemaVersion:5,roomCode:roomId,revision:1,payload:roomPayload,lastAdminUid:"admin",lastDeviceId:"seed",updatedAt:Timestamp.now()});
  await setDoc(doc(db,`rooms/${roomId}/access/admin`),{email:"admin@example.com",displayName:"Primary Admin",role:"admin",memberId:null,active:true});
  await setDoc(doc(db,`rooms/${roomId}/access/delegated`),{email:"delegated@example.com",displayName:"Delegated Admin",role:"admin",memberId:null,active:true});
  await setDoc(doc(db,`rooms/${roomId}/access/member1`),{email:"m1@example.com",displayName:"Member One",role:"member",memberId:"m1",active:true});
  await setDoc(doc(db,`rooms/${roomId}/access/member2`),{email:"m2@example.com",displayName:"Member Two",role:"member",memberId:"m2",active:true});
  await setDoc(doc(db,`rooms/${roomId}/memberData/member1`),{memberId:"m1",presence:true,billingMonths:{},updatedBy:"member1",updatedAt:Timestamp.now()});
  await setDoc(doc(db,`rooms/${roomId}/memberData/member2`),{memberId:"m2",presence:true,billingMonths:{},updatedBy:"member2",updatedAt:Timestamp.now()});
  await setDoc(doc(db,`rooms/${roomId}/taskSubmissions/other-task`),{roomCode:roomId,actorUid:"member2",actorName:"Member Two",memberId:"m2",scheduleId:"schedule-1",weekStart,taskId:"san",taskName:"Sàn NVS - cống",status:"submitted",submittedAt:Timestamp.now(),updatedAt:Timestamp.now()});
});

const admin=env.authenticatedContext("admin",{email:"admin@example.com",name:"Primary Admin"}).firestore();
const delegated=env.authenticatedContext("delegated",{email:"delegated@example.com",name:"Delegated Admin"}).firestore();
const member1=env.authenticatedContext("member1",{email:"m1@example.com",name:"Member One"}).firestore();
const outsider=env.authenticatedContext("outsider",{email:"outsider@example.com",name:"Outsider"}).firestore();
const anon=env.unauthenticatedContext().firestore();

try{
  await assertSucceeds(getDoc(doc(member1,`rooms/${roomId}`)));
  await assertFails(getDoc(doc(outsider,`rooms/${roomId}`)));
  await assertFails(getDoc(doc(anon,`rooms/${roomId}`)));

  await assertFails(updateDoc(doc(member1,`rooms/${roomId}`),{revision:2}));
  await assertSucceeds(updateDoc(doc(delegated,`rooms/${roomId}`),{
    revision:2,
    payload:roomPayload,
    lastAdminUid:"delegated",
    lastDeviceId:"rules-test",
    updatedAt:serverTimestamp()
  }));

  await assertSucceeds(getDoc(doc(member1,`rooms/${roomId}/memberData/member1`)));
  await assertFails(getDoc(doc(member1,`rooms/${roomId}/memberData/member2`)));
  await assertSucceeds(setDoc(doc(member1,`rooms/${roomId}/memberData/member1`),{
    memberId:"m1",presence:false,billingMonths:{},updatedBy:"member1",updatedAt:serverTimestamp()
  }));
  await assertFails(setDoc(doc(member1,`rooms/${roomId}/memberData/member2`),{
    memberId:"m2",presence:false,billingMonths:{},updatedBy:"member1",updatedAt:serverTimestamp()
  }));
  await assertFails(setDoc(doc(member1,`rooms/${roomId}/memberData/member1`),{
    memberId:"m2",presence:false,billingMonths:{},updatedBy:"member1",updatedAt:serverTimestamp()
  }));

  await assertSucceeds(setDoc(doc(member1,`rooms/${roomId}/taskSubmissions/member1-lavabo`),{
    roomCode:roomId,actorUid:"member1",actorName:"Member One",memberId:"m1",scheduleId:"schedule-1",
    weekStart,taskId:"lavabo",taskName:"Lavabo - Toilet",status:"submitted",
    submittedAt:serverTimestamp(),updatedAt:serverTimestamp()
  }));
  await assertFails(setDoc(doc(member1,`rooms/${roomId}/taskSubmissions/member1-san`),{
    roomCode:roomId,actorUid:"member1",actorName:"Member One",memberId:"m1",scheduleId:"schedule-1",
    weekStart,taskId:"san",taskName:"Sàn NVS - cống",status:"submitted",
    submittedAt:serverTimestamp(),updatedAt:serverTimestamp()
  }));
  await assertFails(setDoc(doc(member1,`rooms/${roomId}/taskSubmissions/member1-forged-name`),{
    roomCode:roomId,actorUid:"member1",actorName:"Admin giả",memberId:"m1",scheduleId:"schedule-1",
    weekStart,taskId:"lavabo",taskName:"Lavabo - Toilet",status:"submitted",
    submittedAt:serverTimestamp(),updatedAt:serverTimestamp()
  }));

  await assertSucceeds(getDoc(doc(member1,`rooms/${roomId}/taskSubmissions/member1-lavabo`)));
  await assertFails(getDoc(doc(member1,`rooms/${roomId}/taskSubmissions/other-task`)));
  await assertSucceeds(getDocs(query(collection(member1,`rooms/${roomId}/taskSubmissions`),where("actorUid","==","member1"))));
  await assertFails(getDocs(collection(member1,`rooms/${roomId}/taskSubmissions`)));

  await assertSucceeds(setDoc(doc(member1,`rooms/${roomId}/auditLogs/member-log`),{
    roomCode:roomId,actorUid:"member1",actorName:"Member One",actorEmail:"m1@example.com",role:"member",
    action:"UPDATE_PRESENCE",summary:"Member One: Vắng",targetMemberId:"m1",deviceId:"test",createdAt:serverTimestamp()
  }));
  await assertFails(setDoc(doc(member1,`rooms/${roomId}/auditLogs/forged-log`),{
    roomCode:roomId,actorUid:"member1",actorName:"Primary Admin",actorEmail:"m1@example.com",role:"admin",
    action:"UPDATE_PRESENCE",summary:"Giả mạo",targetMemberId:"m1",deviceId:"test",createdAt:serverTimestamp()
  }));

  await assertFails(updateDoc(doc(delegated,`rooms/${roomId}/security/config`),{adminUid:"delegated"}));
  await assertFails(deleteDoc(doc(delegated,`rooms/${roomId}/security/config`)));
  await assertFails(updateDoc(doc(delegated,`rooms/${roomId}/access/admin`),{displayName:"Taken over"}));
  await assertFails(deleteDoc(doc(delegated,`rooms/${roomId}/access/admin`)));
  await assertFails(updateDoc(doc(admin,`rooms/${roomId}/access/admin`),{role:"member",active:false}));
  await assertSucceeds(updateDoc(doc(admin,`rooms/${roomId}/access/admin`),{displayName:"Primary Admin Updated",role:"admin",active:true,email:"admin@example.com"}));

  console.log("Firestore rules QA PASSED");
} finally {
  await env.cleanup();
}
