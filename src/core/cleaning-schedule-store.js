import { getApps, getApp, initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import { getFirestore, doc, runTransaction, serverTimestamp, increment } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));

function appFor(firebaseConfig){
  const existing=getApps().find(app=>app.name==="p708-secure-manager-v5");
  return existing||initializeApp(firebaseConfig,"p708-secure-manager-v5");
}

export async function deleteScheduleAuthoritatively({firebaseConfig,roomCode,deviceId,weekStart,scheduleId}){
  if(!weekStart)throw new Error("Thiếu tuần cần xóa.");
  const app=appFor(firebaseConfig),auth=getAuth(app),db=getFirestore(app),user=auth.currentUser;
  if(!user)throw new Error("Bạn cần đăng nhập trước.");
  const roomRef=doc(db,"rooms",roomCode);

  const result=await runTransaction(db,async tx=>{
    const snap=await tx.get(roomRef);
    if(!snap.exists())throw new Error("Không tìm thấy dữ liệu phòng.");
    const room=snap.data()||{},payload=clone(room.payload)||{};
    payload.schedules=payload.schedules&&typeof payload.schedules==="object"?payload.schedules:{};
    const current=payload.schedules[weekStart]||null;
    if(!current)return {removed:false,reason:"missing"};
    if(scheduleId&&current.id&&current.id!==scheduleId)return {removed:false,reason:"changed",serverScheduleId:current.id};

    delete payload.schedules[weekStart];
    tx.set(roomRef,{
      schemaVersion:5,
      roomCode,
      revision:increment(1),
      payload,
      lastAdminUid:user.uid,
      lastDeviceId:String(deviceId||"").slice(0,160),
      updatedAt:serverTimestamp()
    },{merge:true});
    return {removed:true};
  });
  return result;
}
