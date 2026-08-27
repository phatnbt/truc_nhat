import { getApps, getApp, initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
  getFirestore, doc, collection, getDocFromServer, getDocsFromServer,
  runTransaction, serverTimestamp, setDoc
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));

function memberPersonEntry(shape,memberId,month){
  const people=shape?.billingMonths?.[month]?.people||{};
  return Object.entries(people).find(([,person])=>person?.memberId===memberId)||null;
}

function extractMemberData(shape,memberId,previous={}){
  const prior=previous?.memberId===memberId?previous:{};
  const billingMonths={};
  for(const month of Object.keys(shape?.billingMonths||{})){
    const entry=memberPersonEntry(shape,memberId,month);
    if(entry)billingMonths[month]={days:clone(entry[1]?.days||{})};
    else if(prior?.billingMonths?.[month])billingMonths[month]=clone(prior.billingMonths[month]);
  }
  return {
    memberId,
    presence:shape?.presence?.[memberId]!==false,
    billingMonths
  };
}

function overlayMemberData(shape,memberDocs){
  const output=clone(shape)||{};
  output.members||={};output.presence||={};output.billingMonths||={};
  for(const data of memberDocs||[]){
    const memberId=data?.memberId;
    if(!memberId||!output.members?.[memberId])continue;
    if(typeof data.presence==="boolean")output.presence[memberId]=data.presence;
    for(const [month,monthData] of Object.entries(data.billingMonths||{})){
      const entry=memberPersonEntry(output,memberId,month);
      if(!entry)continue;
      output.billingMonths[month].people[entry[0]].days=clone(monthData?.days||{});
    }
  }
  return output;
}

function auditId(uid){
  const random=globalThis.crypto?.randomUUID?.()||Math.random().toString(36).slice(2);
  return `${Date.now()}-${uid}-${random}`;
}

export function createP708AuthoritativeRepair({firebaseConfig,roomCode,deviceId}){
  if(!firebaseConfig?.apiKey)throw new Error("Chưa cấu hình Firebase.");
  const appName="p708-secure-manager-v5";
  const app=getApps().some(item=>item.name===appName)?getApp(appName):initializeApp(firebaseConfig,appName);
  const db=getFirestore(app),auth=getAuth(app);
  const roomRef=doc(db,"rooms",roomCode);
  const accessCollection=collection(db,"rooms",roomCode,"access");
  const memberDataCollection=collection(db,"rooms",roomCode,"memberData");
  const auditCollection=collection(db,"rooms",roomCode,"auditLogs");

  async function readServer(){
    const [roomSnap,memberSnap]=await Promise.all([
      getDocFromServer(roomRef),
      getDocsFromServer(memberDataCollection)
    ]);
    if(!roomSnap.exists())return {revision:0,payload:{}};
    const data=roomSnap.data()||{};
    const memberDocs=memberSnap.docs.map(item=>({uid:item.id,...item.data()}));
    return {
      revision:Number(data.revision)||0,
      payload:overlayMemberData(clone(data.payload)||{},memberDocs)
    };
  }

  async function commit(desiredShape,{expectedRevision=null,audit={}}={}){
    const user=auth.currentUser;
    if(!user)throw new Error("Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.");
    const desired=clone(desiredShape)||{};
    const accessSnap=await getDocsFromServer(accessCollection);
    const accesses=accessSnap.docs.map(item=>({uid:item.id,...item.data()}));
    const ownAccess=accesses.find(item=>item.uid===user.uid&&item.active!==false)||null;
    if(!ownAccess||ownAccess.role!=="admin")throw new Error("Chỉ trưởng phòng được sửa dữ liệu trùng.");

    const mapped=accesses.filter(item=>
      item.active!==false&&item.memberId&&desired?.members?.[item.memberId]
    );

    const result=await runTransaction(db,async tx=>{
      const roomSnap=await tx.get(roomRef);
      const currentData=roomSnap.exists()?roomSnap.data()||{}:{};
      const currentRevision=Number(currentData.revision)||0;
      if(expectedRevision!==null&&Number(expectedRevision)!==currentRevision){
        throw new Error("Dữ liệu vừa thay đổi trên thiết bị khác. Hãy bấm Cập nhật danh sách lại để tránh ghi đè dữ liệu mới.");
      }

      const memberSnaps=[];
      for(const item of mapped){
        memberSnaps.push(await tx.get(doc(memberDataCollection,item.uid)));
      }

      mapped.forEach((item,index)=>{
        const previous=memberSnaps[index].exists()?memberSnaps[index].data()||{}:{};
        const memberData=extractMemberData(desired,item.memberId,previous);
        tx.set(doc(memberDataCollection,item.uid),{
          ...memberData,
          updatedBy:user.uid,
          updatedAt:serverTimestamp()
        });
      });

      const nextRevision=currentRevision+1;
      tx.set(roomRef,{
        schemaVersion:5,
        roomCode,
        revision:nextRevision,
        payload:desired,
        lastAdminUid:user.uid,
        lastDeviceId:String(deviceId||"").slice(0,160),
        updatedAt:serverTimestamp()
      },{merge:true});
      return {revision:nextRevision,payload:desired};
    });

    if(audit?.action||audit?.summary){
      const actorName=String(ownAccess.displayName||user.displayName||user.email||"Trưởng phòng");
      try{
        await setDoc(doc(auditCollection,auditId(user.uid)),{
          roomCode,
          actorUid:user.uid,
          actorName,
          actorEmail:user.email||"",
          role:ownAccess.role||"admin",
          action:String(audit.action||"SYNC_BILL_MEMBERS").slice(0,80),
          summary:String(audit.summary||"Sửa dữ liệu thành viên và điện nước bị trùng").slice(0,600),
          targetMemberId:audit.targetMemberId?String(audit.targetMemberId):null,
          deviceId:String(deviceId||"").slice(0,160),
          createdAt:serverTimestamp()
        });
      }catch(error){
        console.warn("P708 integrity audit",error);
      }
    }

    return result;
  }

  async function verify(expectedPayload){
    const server=await readServer();
    const same=JSON.stringify(server.payload)===JSON.stringify(expectedPayload||{});
    return {...server,same};
  }

  return {readServer,commit,verify};
}
