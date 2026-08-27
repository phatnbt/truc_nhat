import { getApps, getApp, initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
  getFirestore, doc, collection, getDocFromServer, getDocsFromServer,
  writeBatch, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { buildCanonicalAccessRemapPlan } from "./p708-identity-plan.js";

const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));

function memberPersonEntry(shape,memberId,month){
  const people=shape?.billingMonths?.[month]?.people||{};
  return Object.entries(people).find(([,person])=>person?.memberId===memberId)||null;
}

function extractMemberData(shape,memberId){
  const billingMonths={};
  for(const month of Object.keys(shape?.billingMonths||{})){
    const entry=memberPersonEntry(shape,memberId,month);
    if(entry)billingMonths[month]={days:clone(entry[1]?.days||{})};
  }
  return {
    memberId,
    presence:shape?.presence?.[memberId]!==false,
    billingMonths
  };
}

export function createP708CanonicalMappingRepair({firebaseConfig,roomCode}){
  if(!firebaseConfig?.apiKey)throw new Error("Chưa cấu hình Firebase.");
  const appName="p708-secure-manager-v5";
  const app=getApps().some(item=>item.name===appName)?getApp(appName):initializeApp(firebaseConfig,appName);
  const db=getFirestore(app),auth=getAuth(app);
  const roomRef=doc(db,"rooms",roomCode);
  const accessCollection=collection(db,"rooms",roomCode,"access");
  const memberDataCollection=collection(db,"rooms",roomCode,"memberData");

  async function repair({beforePayload={},desiredPayload={}}={}){
    const user=auth.currentUser;
    if(!user)throw new Error("Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.");

    const [roomSnap,accessSnap]=await Promise.all([
      getDocFromServer(roomRef),
      getDocsFromServer(accessCollection)
    ]);
    const accesses=accessSnap.docs.map(item=>({uid:item.id,...item.data()}));
    const own=accesses.find(item=>item.uid===user.uid&&item.active!==false);
    if(!own||own.role!=="admin")throw new Error("Chỉ trưởng phòng được sửa mapping thành viên.");

    const serverPayload=clone(roomSnap.data()?.payload)||{};
    const roomMembers=serverPayload?.members||{};
    const desiredMembers=desiredPayload?.members||{};
    const desiredIds=Object.keys(desiredMembers);
    if(desiredIds.length!==Object.keys(roomMembers).length||desiredIds.some(id=>!roomMembers[id])){
      throw new Error("Dữ liệu phòng vừa thay đổi. Hãy bấm Cập nhật danh sách lại.");
    }

    const plan=buildCanonicalAccessRemapPlan({beforePayload,desiredPayload,accesses});
    if(!plan.length)return {remapped:0,accesses};

    const batch=writeBatch(db);
    let remapped=0;
    for(const item of plan){
      const account=accesses.find(access=>access.uid===item.uid);
      if(!account||account.memberId!==item.oldMemberId)continue;
      batch.set(doc(accessCollection,item.uid),{
        memberId:item.canonicalMemberId,
        updatedBy:user.uid,
        updatedAt:serverTimestamp()
      },{merge:true});
      batch.set(doc(memberDataCollection,item.uid),{
        ...extractMemberData(desiredPayload,item.canonicalMemberId),
        updatedBy:user.uid,
        updatedAt:serverTimestamp()
      });
      account.memberId=item.canonicalMemberId;
      remapped++;
    }
    if(remapped)await batch.commit();
    return {remapped,accesses};
  }

  return {repair};
}
