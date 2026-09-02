import { getApps, initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
  getFirestore, doc, runTransaction, serverTimestamp, increment,
  deleteField, FieldPath
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

function appFor(firebaseConfig){
  const existing=getApps().find(app=>app.name==="p708-secure-manager-v5");
  return existing||initializeApp(firebaseConfig,"p708-secure-manager-v5");
}

export async function deleteScheduleAuthoritatively({firebaseConfig,roomCode,deviceId,weekStart,scheduleId}){
  if(!weekStart)throw new Error("Thiếu tuần cần xóa.");
  const app=appFor(firebaseConfig),auth=getAuth(app),db=getFirestore(app),user=auth.currentUser;
  if(!user)throw new Error("Bạn cần đăng nhập trước.");
  const roomRef=doc(db,"rooms",roomCode);

  return runTransaction(db,async tx=>{
    const snap=await tx.get(roomRef);
    if(!snap.exists())throw new Error("Không tìm thấy dữ liệu phòng.");
    const room=snap.data()||{};
    const current=room?.payload?.schedules?.[weekStart]||null;
    if(current&&scheduleId&&current.id&&current.id!==scheduleId){
      return {removed:false,reason:"changed",serverScheduleId:current.id};
    }

    const tombstone={
      deletedAt:new Date().toISOString(),
      deletedBy:user.uid,
      scheduleId:current?.id||scheduleId||null
    };

    // QUAN TRỌNG: không dùng set(...,{merge:true}) để "xóa" key con trong map.
    // Omit key khi merge không phải delete. deleteField() mới xóa nested field thật.
    // Tombstone được lưu cả trong payload lẫn metadata phòng để mọi listener/client
    // mới đều biết lịch này đã bị xóa và không được resurrect từ snapshot cũ.
    tx.update(
      roomRef,
      new FieldPath("payload","schedules",weekStart), deleteField(),
      new FieldPath("payload","_sync","deletedSchedules",weekStart), tombstone,
      new FieldPath("deletedSchedules",weekStart), tombstone,
      "revision", increment(1),
      "lastAdminUid", user.uid,
      "lastDeviceId", String(deviceId||"").slice(0,160),
      "updatedAt", serverTimestamp()
    );
    return {removed:!!current,reason:current?"deleted":"already_deleted"};
  });
}

export async function restoreScheduleWeek({firebaseConfig,roomCode,weekStart}){
  if(!weekStart)return;
  const app=appFor(firebaseConfig),auth=getAuth(app),db=getFirestore(app),user=auth.currentUser;
  if(!user)throw new Error("Bạn cần đăng nhập trước.");
  const roomRef=doc(db,"rooms",roomCode);
  await runTransaction(db,async tx=>{
    const snap=await tx.get(roomRef);
    if(!snap.exists())throw new Error("Không tìm thấy dữ liệu phòng.");
    tx.update(
      roomRef,
      new FieldPath("payload","_sync","deletedSchedules",weekStart),deleteField(),
      new FieldPath("deletedSchedules",weekStart),deleteField()
    );
  });
}
