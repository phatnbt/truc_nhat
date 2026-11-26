import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, browserLocalPersistence, setPersistence,
  onAuthStateChanged, signInWithPopup, signInWithRedirect, getRedirectResult,
  signOut as firebaseSignOut, connectAuthEmulator
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
  initializeFirestore, getFirestore, memoryLocalCache, connectFirestoreEmulator,
  doc, collection, query, where, orderBy, limit, onSnapshot, runTransaction, serverTimestamp, FieldPath,
  setDoc, deleteDoc, getDoc, getDocFromServer, getDocs, writeBatch, Timestamp, increment
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { assertBillingPeriodUpdate, periodDateKeys, daysInMonthKey } from "./billing-cycle-period.js?v=20261126-1";

const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
const isObject=value=>value!==null&&typeof value==="object"&&!Array.isArray(value);
const jsonEqual=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

function diffJson(before,after,path=[],output=[]){
  if(jsonEqual(before,after))return output;
  if(after===undefined){output.push({type:"remove",path:[...path]});return output;}
  if(before===undefined||Array.isArray(before)||Array.isArray(after)||!isObject(before)||!isObject(after)){output.push({type:"set",path:[...path],value:clone(after)});return output;}
  const keys=new Set([...Object.keys(before),...Object.keys(after)]);
  for(const key of keys)diffJson(before[key],after[key],[...path,key],output);
  return output;
}
function applyJsonOperations(base,operations){
  let output=clone(base);
  if(output==null)output={};
  for(const operation of operations||[]){
    const path=operation.path||[];
    if(path.some(key=>["__proto__","constructor","prototype"].includes(key)))throw new Error("Khóa dữ liệu không hợp lệ.");
    if(path.length===0){output=operation.type==="remove"?{}:clone(operation.value);continue;}
    if(!isObject(output))output={};
    let parent=output;
    for(let i=0;i<path.length-1;i++){
      const key=path[i];
      if(!isObject(parent[key]))parent[key]={};
      parent=parent[key];
    }
    const key=path[path.length-1];
    if(operation.type==="remove")delete parent[key];
    else parent[key]=clone(operation.value);
  }
  return output;
}
function memberPersonEntry(shape,memberId,month){
  const people=shape?.billingMonths?.[month]?.people||{};
  return Object.entries(people).find(([,p])=>p?.memberId===memberId)||null;
}
function extractMemberData(shape,memberId,previous={}){
  const prior=previous?.memberId===memberId?previous:{};
  const billingMonths={};
  for(const month of Object.keys(shape?.billingMonths||{})){
    const entry=memberPersonEntry(shape,memberId,month);
    if(entry)billingMonths[month]={days:clone(entry[1]?.days||{})};
    else if(prior?.billingMonths?.[month])billingMonths[month]=clone(prior.billingMonths[month]);
  }
  return {memberId,presence:shape?.presence?.[memberId]!==false,billingMonths};
}
function overlayMemberData(adminShape,memberDataByUid){
  const output=clone(adminShape)||{};
  output.members||={};output.presence||={};output.billingMonths||={};
  for(const data of memberDataByUid.values()){
    const memberId=data?.memberId;
    if(!memberId||!output.members?.[memberId])continue;
    if(typeof data.presence==="boolean")output.presence[memberId]=data.presence;
    for(const [month,monthData] of Object.entries(data.billingMonths||{})){
      const bill=output.billingMonths[month];
      if(bill?.closed&&bill.closedDaysVersion===1)continue;
      const entry=memberPersonEntry(output,memberId,month);
      if(!entry||entry[1].daysShared===true)continue;
      output.billingMonths[month].people[entry[0]].days=clone(monthData?.days||{});
    }
  }
  return output;
}
function memberAllowedOperation(operation,memberId,currentShape,nextShape){
  const path=operation.path||[];
  if(path[0]==="presence"&&path.length===2&&path[1]===memberId)return true;
  if(path[0]!=="billingMonths"||path.length<3)return false;
  const month=path[1];
  if(path[2]==="updatedAt"&&path.length===3)return true;
  if(path[2]!=="people"||path.length<5)return false;
  const personKey=path[3],person=nextShape?.billingMonths?.[month]?.people?.[personKey]||currentShape?.billingMonths?.[month]?.people?.[personKey];
  if(person?.memberId!==memberId)return false;
  return ["days","updatedAt","dayUpdatedAt"].includes(path[4]);
}
function makeLogId(uid){
  const random=globalThis.crypto?.randomUUID?.()||Math.random().toString(36).slice(2);
  return `${Date.now()}-${uid}-${random}`;
}
function taskDocId(weekStart,taskId,memberId){
  return `${String(weekStart).replaceAll("/","-")}__${String(taskId).replaceAll("/","-")}__${String(memberId).replaceAll("/","-")}`;
}
function escapeRegExp(value){return String(value||"").replace(/[.*+?^${}()|[\]\\]/g,"\\$&");}

export function createP708SecureEngine({firebaseConfig,roomCode,deviceId,onShape,onStatus,onSession,onAdminData,onTaskData,onSwapData}){
  if(!firebaseConfig?.apiKey)throw new Error("Chưa cấu hình Firebase.");
  const useEmulators=["localhost","127.0.0.1","[::1]"].includes(location.hostname)&&firebaseConfig.projectId==="demo-p708-production-audit";
  const appName="p708-secure-manager-v5";
  const appExists=getApps().some(x=>x.name===appName);
  const app=appExists?getApp(appName):initializeApp(firebaseConfig,appName);
  let db;
  try{db=initializeFirestore(app,{localCache:memoryLocalCache()});}
  catch{db=getFirestore(app);}
  const auth=getAuth(app),provider=new GoogleAuthProvider();
  if(useEmulators&&!appExists){
    connectAuthEmulator(auth,"http://127.0.0.1:9099",{disableWarnings:true});
    connectFirestoreEmulator(db,"127.0.0.1",8080);
  }
  provider.setCustomParameters({prompt:"select_account"});
  const roomRef=doc(db,"rooms",roomCode),configRef=doc(db,"rooms",roomCode,"security","config");
  const accessCollection=collection(db,"rooms",roomCode,"access"),
    requestCollection=collection(db,"rooms",roomCode,"accessRequests"),
    memberDataCollection=collection(db,"rooms",roomCode,"memberData"),
    auditCollection=collection(db,"rooms",roomCode,"auditLogs"),
    taskCollection=collection(db,"rooms",roomCode,"taskSubmissions"),
    swapCollection=collection(db,"rooms",roomCode,"swapRequests");

  let user=null,access=null,ownRequest=null,accessReady=false,requestReady=false,restoreInFlight=null,
    remoteShape={},optimisticShape={},roomReady=false,remoteRevision=0,
    memberDataByUid=new Map(),accessByUid=new Map(),started=false,memberDataReady=false;
  let authUnsub=null,accessUnsub=null,requestUnsub=null,
    roomUnsub=null,memberDataUnsub=null,adminAccessUnsub=null,adminRequestsUnsub=null,
    auditUnsub=null,taskUnsub=null,swapUnsub=null;
  const isAdmin=()=>access?.active&&access?.role==="admin";
  const hasAccess=()=>!!access?.active;
  const emitStatus=(mode,text,extra={})=>onStatus?.({mode,text,online:navigator.onLine,...extra});
  const emitSession=(extra={})=>onSession?.({
    user:user?{uid:user.uid,email:user.email||"",displayName:user.displayName||"",photoURL:user.photoURL||""}:null,
    access:clone(access),request:clone(ownRequest),
    status:!user?"signedOut":!accessReady?"checking":access?.active?"active":!requestReady?"checking":ownRequest?"pending":"needsAccess",
    ...extra
  });
  const emitAdminData=(requests=null,accesses=null,logs=null)=>onAdminData?.({requests:requests??undefined,accesses:accesses??undefined,logs:logs??undefined});
  const rebuild=()=>{
    if(!hasAccess()||!roomReady)return;
    const nextShape=overlayMemberData(remoteShape||{},memberDataByUid);
    if(jsonEqual(optimisticShape,nextShape))return;
    optimisticShape=nextShape;
    onShape?.(clone(optimisticShape),{role:access?.role||null,memberId:access?.memberId||null});
  };
  const acceptRoomShape=(payload,revision)=>{
    if(!hasAccess()||revision<remoteRevision)return false;
    remoteRevision=revision;remoteShape=clone(payload)||{};roomReady=true;
    rebuild();return true;
  };

  const writeAudit=async(audit={},transaction=null)=>{
    if(!user||!hasAccess())return;
    const actorName=String(access?.displayName||user.displayName||user.email||"Người dùng");
    const ref=doc(auditCollection,makeLogId(user.uid)),fields={
      roomCode,actorUid:user.uid,actorName,
      actorEmail:user.email||"",role:access?.role||"member",
      action:String(audit.action||"UPDATE_DATA").slice(0,80),
      summary:String(audit.summary||"Cập nhật dữ liệu").slice(0,600),
      targetMemberId:audit.targetMemberId?String(audit.targetMemberId):null,
      deviceId:String(deviceId||"").slice(0,160),createdAt:serverTimestamp()
    };
    if(transaction)transaction.set(ref,fields);
    else await setDoc(ref,fields);
  };

  const mappedMemberChanges=(nextShape,previousShape)=>{
    const changes=[];
    if(!isAdmin())return changes;
    for(const [mappedUid,previousDoc] of memberDataByUid.entries()){
      const memberId=previousDoc?.memberId;
      if(!memberId)continue;
      const before=extractMemberData(previousShape||{},memberId,previousDoc),after=extractMemberData(nextShape||{},memberId,previousDoc),operations=diffJson(before,after);
      if(operations.length)changes.push({mappedUid,memberId,before,after,operations});
    }
    return changes;
  };

  const stopDataListeners=()=>{
    roomUnsub?.();memberDataUnsub?.();adminAccessUnsub?.();adminRequestsUnsub?.();auditUnsub?.();taskUnsub?.();swapUnsub?.();
    roomUnsub=memberDataUnsub=adminAccessUnsub=adminRequestsUnsub=auditUnsub=taskUnsub=swapUnsub=null;
    memberDataByUid=new Map();accessByUid=new Map();memberDataReady=false;
    remoteShape={};optimisticShape={};roomReady=false;remoteRevision=0;
  };
  const startAdminListeners=()=>{
    adminAccessUnsub?.();adminRequestsUnsub?.();auditUnsub?.();
    adminAccessUnsub=onSnapshot(accessCollection,snap=>{
      accessByUid=new Map(snap.docs.map(d=>[d.id,{uid:d.id,...d.data()}]));
      emitAdminData(null,[...accessByUid.values()],null);
    },e=>emitStatus("offline","Không tải được danh sách quyền",{error:e}));
    adminRequestsUnsub=onSnapshot(requestCollection,snap=>emitAdminData(snap.docs.map(d=>({uid:d.id,...d.data()})),null,null),e=>emitStatus("offline","Không tải được yêu cầu tham gia",{error:e}));
    auditUnsub=onSnapshot(query(auditCollection,orderBy("createdAt","desc"),limit(200)),snap=>emitAdminData(null,null,snap.docs.map(d=>({id:d.id,...d.data()}))),e=>emitStatus("offline","Không tải được nhật ký",{error:e}));
  };
  const startTaskListener=()=>{
    taskUnsub?.();
    const source=isAdmin()?query(taskCollection,orderBy("updatedAt","desc"),limit(200)):query(taskCollection,where("actorUid","==",user.uid),limit(200));
    taskUnsub=onSnapshot(source,snap=>onTaskData?.(snap.docs.map(d=>({id:d.id,...d.data()}))),e=>emitStatus("offline","Không tải được trạng thái công việc",{error:e}));
    const swaps=isAdmin()?query(swapCollection,orderBy("updatedAt","desc"),limit(100)):query(swapCollection,where("actorUid","==",user.uid),limit(100));
    swapUnsub=onSnapshot(swaps,snap=>onSwapData?.(snap.docs.map(d=>({id:d.id,...d.data()}))),e=>console.warn("Không tải được yêu cầu đổi việc",e.code));
  };
  const startRoomListeners=()=>{
    stopDataListeners();
    roomUnsub=onSnapshot(roomRef,{includeMetadataChanges:true},snap=>{
      if(snap.metadata.hasPendingWrites)return;
      if(snap.metadata.fromCache){
        emitStatus(navigator.onLine?"syncing":"offline","Chưa xác nhận dữ liệu với máy chủ");
        return;
      }
      acceptRoomShape(snap.data()?.payload,Number(snap.data()?.revision)||0);
      emitStatus(snap.metadata.hasPendingWrites?"syncing":navigator.onLine?"online":"offline",snap.metadata.hasPendingWrites?"Đang đồng bộ…":navigator.onLine?"Đã đồng bộ":"Đang dùng dữ liệu ngoại tuyến");
    },e=>emitStatus("offline","Không thể đọc dữ liệu phòng",{error:e}));
    if(isAdmin()){
      memberDataUnsub=onSnapshot(memberDataCollection,{includeMetadataChanges:true},snap=>{
        if(snap.metadata.fromCache||snap.metadata.hasPendingWrites)return;
        memberDataByUid=new Map(snap.docs.map(d=>[d.id,{uid:d.id,...d.data()}]));memberDataReady=true;rebuild();
      },e=>{memberDataReady=false;emitStatus("offline","Không thể đọc dữ liệu thành viên",{error:e});});
    }else{
      memberDataUnsub=onSnapshot(doc(memberDataCollection,user.uid),{includeMetadataChanges:true},snap=>{
        if(snap.metadata.fromCache||snap.metadata.hasPendingWrites)return;
        memberDataByUid=snap.exists()?new Map([[snap.id,{uid:snap.id,...snap.data()}]]):new Map();memberDataReady=true;rebuild();
      },e=>{memberDataReady=false;emitStatus("offline","Không thể đọc dữ liệu cá nhân",{error:e});});
    }
    startTaskListener();if(isAdmin())startAdminListeners();
  };
  const handleAccessChange=next=>{
    const oldRole=access?.role;access=next?.active?next:null;
    if(access&&user)accessByUid.set(user.uid,{uid:user.uid,...access});
    emitSession();if(!access){stopDataListeners();return;}
    if(!roomUnsub||oldRole!==access.role)startRoomListeners();rebuild();
  };
  const attachUserListeners=()=>{
    accessUnsub?.();requestUnsub?.();
    accessUnsub=onSnapshot(doc(accessCollection,user.uid),{includeMetadataChanges:true},s=>{
      if(s.metadata.fromCache)return;
      accessReady=true;
      handleAccessChange(s.exists()?{uid:s.id,...s.data()}:null);
    },e=>{stopDataListeners();access=null;emitSession({status:"error",error:e});});
    requestUnsub=onSnapshot(doc(requestCollection,user.uid),{includeMetadataChanges:true},s=>{
      if(s.metadata.fromCache)return;
      requestReady=true;ownRequest=s.exists()?{uid:s.id,...s.data()}:null;emitSession();
    },e=>{if(!hasAccess())emitSession({status:"error",error:e});});
  };
  const clearUserListeners=()=>{
    accessUnsub?.();requestUnsub?.();accessUnsub=requestUnsub=null;
    stopDataListeners();access=null;ownRequest=null;
    accessReady=false;requestReady=false;restoreInFlight=null;
  };
  const onlineHandler=()=>emitStatus("syncing","Đang kết nối lại…");
  const offlineHandler=()=>emitStatus("offline","Mất kết nối · dữ liệu được giữ trên thiết bị");

  const start=async()=>{
    if(started)return;started=true;emitStatus("syncing","Đang khởi động bảo mật…");
    try{await setPersistence(auth,browserLocalPersistence);}catch(e){console.warn("P708 auth persistence",e);}
    authUnsub=onAuthStateChanged(auth,next=>{clearUserListeners();user=next;if(!user){emitSession();emitStatus("offline","Chưa đăng nhập");return;}emitSession({status:"checking"});attachUserListeners();emitStatus("syncing","Đang kiểm tra quyền…");});
    void getRedirectResult(auth).catch(error=>onStatus?.({mode:"offline",text:"Không thể hoàn tất đăng nhập Google",error}));
    window.addEventListener("online",onlineHandler);window.addEventListener("offline",offlineHandler);
  };
  const signInGoogle=async()=>{
    const firstParty=location.hostname===firebaseConfig.authDomain;
    const standalone=window.matchMedia("(display-mode: standalone)").matches||navigator.standalone===true;
    const ios=/iPhone|iPad|iPod/i.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
    const openFirebaseHosting=()=>location.assign(new URL(location.hash||"/","https://p708-room-manager.firebaseapp.com/").href);
    if(!useEmulators&&(ios||standalone)){
      if(!firstParty){openFirebaseHosting();return;}
      await signInWithRedirect(auth,provider);return;
    }
    try{await signInWithPopup(auth,provider);}
    catch(e){
      if(!["auth/popup-blocked","auth/operation-not-supported-in-this-environment"].includes(e?.code))throw e;
      if(!firstParty&&!useEmulators){openFirebaseHosting();return;}
      await signInWithRedirect(auth,provider);
    }
  };
  const signOut=()=>firebaseSignOut(auth);

  const requestAccess=async displayName=>{
    if(!user)throw new Error("Bạn cần đăng nhập trước.");
    const name=String(displayName||user.displayName||"").trim();
    if(!name)throw new Error("Vui lòng nhập tên trong phòng.");if(name.length>80)throw new Error("Tên hiển thị quá dài.");
    await setDoc(doc(requestCollection,user.uid),{uid:user.uid,email:user.email||"",displayName:name,photoURL:String(user.photoURL||"").slice(0,2048),status:"pending",requestedAt:serverTimestamp(),updatedAt:serverTimestamp()});
  };
  const cancelAccessRequest=async()=>{if(user)await deleteDoc(doc(requestCollection,user.uid));};

  const approveRequest=async({uid,memberId,role="member",displayName=""})=>{
    if(!isAdmin())throw new Error("Chỉ trưởng phòng được duyệt.");if(!uid)throw new Error("Thiếu UID tài khoản.");
    const reqRef=doc(requestCollection,uid),accessRef=doc(accessCollection,uid),memberRef=doc(memberDataCollection,uid),req=await getDoc(reqRef);
    if(!req.exists())throw new Error("Yêu cầu tham gia không còn tồn tại.");
    const data=req.data()||{},normalizedRole=role==="admin"?"admin":"member",normalizedMemberId=memberId||null,batch=writeBatch(db),initialMemberData=normalizedMemberId?extractMemberData(optimisticShape,normalizedMemberId,{}):null;
    batch.set(accessRef,{email:data.email||"",displayName:String(displayName||data.displayName||"Thành viên").trim().slice(0,80)||"Thành viên",role:normalizedRole,memberId:normalizedMemberId,active:true,approvedBy:user.uid,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
    batch.delete(reqRef);
    if(initialMemberData)batch.set(memberRef,{...initialMemberData,updatedBy:user.uid,updatedAt:serverTimestamp()});else batch.delete(memberRef);
    await batch.commit();
    if(initialMemberData)memberDataByUid.set(uid,{uid,...clone(initialMemberData)});else memberDataByUid.delete(uid);rebuild();
    await writeAudit({action:"APPROVE_ACCESS",summary:`Duyệt quyền cho ${displayName||data.displayName||data.email||uid}`,targetMemberId:normalizedMemberId});
  };
  const updateAccess=async({uid,memberId,role,displayName,active=true})=>{
    if(!isAdmin())throw new Error("Chỉ trưởng phòng được sửa quyền.");if(!uid)throw new Error("Thiếu UID tài khoản.");
    const ref=doc(accessCollection,uid),memberRef=doc(memberDataCollection,uid),[old,configSnap]=await Promise.all([getDoc(ref),getDoc(configRef)]);
    if(!old.exists())throw new Error("Không tìm thấy tài khoản.");
    const oldData=old.data()||{},primaryUid=configSnap.exists()?configSnap.data()?.adminUid:null;
    if(uid===primaryUid&&user.uid!==primaryUid)throw new Error("Không thể thay đổi tài khoản trưởng phòng chính.");
    const normalizedMemberId=memberId||null,normalizedRole=uid===primaryUid?"admin":role==="admin"?"admin":"member",batch=writeBatch(db),mappingChanged=(oldData.memberId||null)!==normalizedMemberId,initialMemberData=mappingChanged&&normalizedMemberId?extractMemberData(optimisticShape,normalizedMemberId,{}):null;
    batch.set(ref,{...oldData,memberId:normalizedMemberId,role:normalizedRole,displayName:String(displayName||oldData.displayName||"Thành viên").trim().slice(0,80)||"Thành viên",active:uid===primaryUid?true:!!active,updatedAt:serverTimestamp(),updatedBy:user.uid});
    if(mappingChanged){if(initialMemberData)batch.set(memberRef,{...initialMemberData,updatedBy:user.uid,updatedAt:serverTimestamp()});else batch.delete(memberRef);}
    await batch.commit();
    if(mappingChanged){if(initialMemberData)memberDataByUid.set(uid,{uid,...clone(initialMemberData)});else memberDataByUid.delete(uid);rebuild();}
    await writeAudit({action:"UPDATE_ACCESS",summary:`Cập nhật quyền ${displayName||oldData.displayName||oldData.email||uid}`,targetMemberId:normalizedMemberId});
  };
  const revokeAccess=async uid=>{
    if(!isAdmin())throw new Error("Chỉ trưởng phòng được khóa tài khoản.");if(uid===user.uid)throw new Error("Không thể tự khóa tài khoản đang dùng.");
    const ref=doc(accessCollection,uid),memberRef=doc(memberDataCollection,uid),result=await runTransaction(db,async tx=>{
      const accessSnap=await tx.get(ref),configSnap=await tx.get(configRef),roomSnap=await tx.get(roomRef),memberSnap=await tx.get(memberRef);
      if(!accessSnap.exists())return {missing:true};
      const oldData=accessSnap.data()||{};if(configSnap.exists()&&configSnap.data()?.adminUid===uid)throw new Error("Không thể khóa tài khoản trưởng phòng chính.");
      const base=roomSnap.exists()?clone(roomSnap.data()?.payload)||{}:{},memberId=oldData.memberId||null;
      let merged=base;
      if(memberSnap.exists()&&memberId)merged=overlayMemberData(base,new Map([[uid,{uid,...memberSnap.data(),memberId}]]));
      if(roomSnap.exists())tx.set(roomRef,{schemaVersion:5,roomCode,revision:increment(1),payload:merged,lastAdminUid:user.uid,lastDeviceId:deviceId,updatedAt:serverTimestamp()},{merge:true});
      tx.set(ref,{active:false,updatedAt:serverTimestamp(),updatedBy:user.uid},{merge:true});tx.delete(memberRef);
      return {missing:false,oldData,merged};
    });
    if(result.missing)return;
    remoteShape=clone(result.merged)||remoteShape;memberDataByUid.delete(uid);rebuild();
    await writeAudit({action:"REVOKE_ACCESS",summary:`Khóa quyền ${result.oldData.displayName||result.oldData.email||uid}`,targetMemberId:result.oldData.memberId||null});
  };

  const recordShape=async(nextShape,audit={})=>{
    if(!user||!hasAccess())throw new Error("Tài khoản chưa được cấp quyền.");
    if(!navigator.onLine)throw new Error("Đang ngoại tuyến. Hãy kết nối mạng trước khi chỉnh sửa.");
    if(!roomReady||!memberDataReady)throw new Error("Dữ liệu phòng đang tải. Vui lòng thử lại.");
    const actor=user.uid;
    const desired=clone(nextShape)||{};
    if(isAdmin()){
      const previous=clone(optimisticShape)||{},roomOperations=diffJson(previous,desired),memberChanges=mappedMemberChanges(desired,previous);
      const result=await runTransaction(db,async tx=>{
        const roomSnap=await tx.get(roomRef),memberSnaps=[];
        for(const change of memberChanges)memberSnaps.push(await tx.get(doc(memberDataCollection,change.mappedUid)));
        const closeMonth=audit.action==="CLOSE_BILL"?audit.month:null;
        const closeMemberDocs=new Map();
        if(closeMonth){
          for(const [uid,data] of memberDataByUid){
            if(!memberPersonEntry(previous,data.memberId,closeMonth))continue;
            const snap=await tx.get(doc(memberDataCollection,uid));
            if(snap.exists())closeMemberDocs.set(uid,snap.data());
          }
        }
        const serverPayload=roomSnap.exists()?clone(roomSnap.data()?.payload)||{}:{},mergedShape=applyJsonOperations(serverPayload,roomOperations),mergedMembers=[];
        if(roomOperations.some(op=>op.path[0]==="resources")&&!jsonEqual(serverPayload.resources,previous.resources)){
          throw new Error("Sổ vật dụng và chi chung vừa thay đổi. Hãy thử lại sau khi đồng bộ.");
        }
        if(audit.action==="RECORD_PAYMENT"){
          const serverBill=serverPayload.billingMonths?.[audit.month];
          const person=serverBill?.people?.[`person:${audit.personId}`];
          if(!serverBill?.closed||!person||Number(person.paidAmount||0)!==audit.expectedPaid){
            throw new Error("Khoản thanh toán vừa thay đổi. Hãy kiểm tra số dư và thử lại.");
          }
        }
        if(closeMonth){
          const activeBill=serverPayload.billingMonths?.[closeMonth];
          const candidate=mergedShape.billingMonths?.[closeMonth];
          if(!activeBill||activeBill.closed||!candidate)throw new Error("Kỳ điện nước vừa thay đổi.");
          const materialized=overlayMemberData(serverPayload,closeMemberDocs).billingMonths[closeMonth];
          if(!jsonEqual(materialized,previous.billingMonths?.[closeMonth]))throw new Error("Ngày ở hoặc hóa đơn vừa thay đổi. Hãy kiểm tra trước khi chốt lại.");
          candidate.people=materialized.people;
          candidate.closedDaysVersion=1;
        }
        if(audit.action==="OPEN_BILL"&&audit.month){
          const bill=serverPayload.billingMonths?.[audit.month];
          if(!bill?.closed||Object.values(bill.people||{}).some(person=>Number(person.paidAmount)>0)){
            throw new Error("Kỳ vừa thay đổi hoặc đã ghi nhận thanh toán.");
          }
        }
        const deletedSchedules=serverPayload._sync?.deletedSchedules||{};
        const creating=audit.action==="CREATE_SCHEDULE"&&audit.week;
        if(creating){
          const week=audit.week;
          const serverTombstone=deletedSchedules[week]||null;
          if((serverPayload.schedules?.[week]&&!serverTombstone)
            || !jsonEqual(serverTombstone,audit.tombstone)||!desired.schedules?.[week]){
            throw new Error("Lịch tuần đã thay đổi trên thiết bị khác.");
          }
          mergedShape.schedules={...serverPayload.schedules,[week]:desired.schedules[week]};
          if(mergedShape._sync?.deletedSchedules)delete mergedShape._sync.deletedSchedules[week];
        }
        for(const op of roomOperations){
          const [collection,week]=op.path;
          if(collection!=="schedules"||!week||creating===week)continue;
          if(deletedSchedules[week]||!jsonEqual(serverPayload.schedules?.[week],previous.schedules?.[week])){
            throw new Error("Lịch tuần đã thay đổi trên thiết bị khác.");
          }
        }
        assertBillingPeriodUpdate(serverPayload,mergedShape,audit);
        memberChanges.forEach((change,index)=>{
          const snap=memberSnaps[index],current=snap.exists()?clone(snap.data())||{}:{memberId:change.memberId},merged=applyJsonOperations(current,change.operations);
          merged.memberId=change.memberId;
          tx.set(doc(memberDataCollection,change.mappedUid),{...merged,updatedBy:user.uid,updatedAt:serverTimestamp()});
          mergedMembers.push([change.mappedUid,{...merged,memberId:change.memberId}]);
        });
        const fields={schemaVersion:5,roomCode,revision:increment(1),payload:mergedShape,lastAdminUid:actor,lastDeviceId:deviceId,updatedAt:serverTimestamp()};
        if(creating&&roomSnap.data()?.deletedSchedules?.[creating]){
          fields.deletedSchedules=clone(roomSnap.data().deletedSchedules);
          delete fields.deletedSchedules[creating];
        }
        if (roomSnap.exists()) tx.update(roomRef,fields);
        else tx.set(roomRef,fields);
        return {mergedShape,mergedMembers,revision:(Number(roomSnap.data()?.revision)||0)+1};
      });
      if(user?.uid!==actor||!hasAccess())return true;
      if(result.revision>=remoteRevision){
        for(const [mappedUid,data] of result.mergedMembers)memberDataByUid.set(mappedUid,clone(data));
        acceptRoomShape(result.mergedShape,result.revision);
      }
      if(audit?.summary||audit?.action)await writeAudit(audit);emitStatus("online","Đã đồng bộ");return true;
    }
    const memberId=access.memberId;if(!memberId)throw new Error("Tài khoản chưa liên kết với thành viên.");
    const shapeOperations=diffJson(optimisticShape,desired),forbidden=shapeOperations.find(op=>!memberAllowedOperation(op,memberId,optimisticShape,desired));
    if(forbidden)throw new Error("Bạn chỉ được chỉnh trạng thái và ngày ở của chính mình.");
    const previousOwn=extractMemberData(optimisticShape,memberId,memberDataByUid.get(user.uid)),desiredOwn=extractMemberData(desired,memberId,memberDataByUid.get(user.uid)),ownOperations=diffJson(previousOwn,desiredOwn),ownRef=doc(memberDataCollection,user.uid);
    // Keep explicit presence changes even when the prior write's snapshot has not arrived.
    if(audit.action==="UPDATE_PRESENCE"&&audit.targetMemberId===memberId&&!ownOperations.some(operation=>operation.path[0]==="presence")){
      ownOperations.push({type:"set",path:["presence"],value:desiredOwn.presence});
    }
    const billingMonths=[...new Set(ownOperations.filter(operation=>operation.path[0]==="billingMonths").map(operation=>operation.path[1]))];
    const mergedOwn=await runTransaction(db,async tx=>{
      const snap=await tx.get(ownRef),month=billingMonths[0];
      const current=snap.exists()?clone(snap.data()):{memberId,billingMonths:{}};
      if(!snap.exists()||billingMonths.length){
        const room=await tx.get(roomRef),payload=room.data()?.payload;
        if(!snap.exists())current.presence=payload?.presence?.[memberId]!==false;
        if(billingMonths.length&&(billingMonths.length!==1||!payload?.billingMonths?.[month]||payload.billingMonths[month].closed)){
          throw new Error("Chỉ có thể chỉnh ngày ở của một kỳ đang mở.");
        }
        if(month){
          // Preserve existing room days when a member first creates an override for this month.
          current.billingMonths??={};
          current.billingMonths[month]??={days:clone(memberPersonEntry(payload,memberId,month)?.[1]?.days||{})};
        }
      }
      const merged=applyJsonOperations(current,ownOperations);
      merged.memberId=memberId;
      if(month)merged.billingPatchMonth=month;
      tx.set(ownRef,{...merged,updatedBy:user.uid,updatedAt:serverTimestamp()});return merged;
    });
    if(user?.uid!==actor||!hasAccess())return true;
    memberDataByUid.set(actor,{uid:actor,...clone(mergedOwn)});rebuild();if(audit?.summary||audit?.action)await writeAudit(audit);emitStatus("online","Đã đồng bộ");return true;
  };

  const saveBillingDays=async({month,billId,personId,memberId,changes,audit})=>{
    if(!user||!hasAccess())throw new Error("Tài khoản chưa được cấp quyền.");
    if(!navigator.onLine)throw new Error("Đang ngoại tuyến. Hãy kết nối rồi thử lại.");
    const actor=user.uid,admin=isAdmin();
    if(!admin&&(!memberId||memberId!==access.memberId))throw new Error("Bạn chỉ được chỉnh ngày ở của mình.");
    const targets=admin?[...accessByUid.values()].filter(item=>item.active&&item.memberId===memberId&&memberId).map(item=>item.uid):[actor];
    const result=await runTransaction(db,async tx=>{
      const room=await tx.get(roomRef),payload=clone(room.data()?.payload);
      const bill=payload?.billingMonths?.[month],personKey=`person:${personId}`,person=bill?.people?.[personKey];
      if(!bill||bill.id!==billId||!person||person.id!==personId||(person.memberId||null)!==memberId)
        throw new Error("Kỳ hoặc người trong hóa đơn vừa thay đổi. Hãy kiểm tra lại.");
      if(bill.closed)throw new Error("Kỳ điện nước đã chốt.");
      const keys=["28-27","29-28"].includes(bill.cycleMode)
        ?periodDateKeys(month,{start:bill.cycleStart,end:bill.cycleEnd})
        :Array.from({length:daysInMonthKey(month)},(_,index)=>String(index+1));
      const entries=Object.entries(changes);
      if(!entries.length||entries.some(([key,value])=>!keys.includes(key)||typeof value!=="boolean"))
        throw new Error("Ngày không còn nằm trong kỳ điện nước.");
      const documents=await Promise.all(targets.map(uid=>tx.get(doc(memberDataCollection,uid))));
      if(user?.uid!==actor||!hasAccess()||isAdmin()!==admin||(!admin&&access.memberId!==memberId))
        throw new Error("Phiên hoặc quyền truy cập vừa thay đổi.");
      const legacy=documents.map(snapshot=>snapshot.data()).filter(data=>data?.memberId===memberId&&data.billingMonths?.[month]?.days)
        .sort((left,right)=>(right.updatedAt?.toMillis?.()||0)-(left.updatedAt?.toMillis?.()||0))[0];
      const baseline=person.daysShared?person.days:legacy?.billingMonths[month].days||person.days;
      const days={...baseline,...changes};
      if(person.daysShared&&jsonEqual(person.days,days))return null;
      person.days=days;person.daysShared=true;
      tx.update(roomRef,new FieldPath("payload","billingMonths",month,"people",personKey,"days"),days,
        new FieldPath("payload","billingMonths",month,"people",personKey,"daysShared"),true,
        "revision",increment(1),"updatedAt",serverTimestamp(),...(admin?["lastAdminUid",actor,"lastDeviceId",deviceId]:[]));
      for(const [index,snapshot] of documents.entries()){
        if(admin&&(!snapshot.exists()||snapshot.data().memberId!==memberId))continue;
        const current=snapshot.data()||{memberId,presence:payload.presence?.[memberId]!==false,billingMonths:{}};
        if(current.memberId!==memberId)throw new Error("Liên kết thành viên đã thay đổi.");
        tx.set(doc(memberDataCollection,targets[index]),{...current,billingMonths:{...current.billingMonths,[month]:{days}},
          billingPatchMonth:month,billingPatchPerson:personKey,updatedBy:actor,updatedAt:serverTimestamp()});
      }
      await writeAudit(audit,tx);
      return {payload,revision:(Number(room.data()?.revision)||0)+1};
    });
    if(user?.uid===actor&&hasAccess()&&result){
      acceptRoomShape(result.payload,result.revision);
    }
    return true;
  };

  const submitTask=async({scheduleId,weekStart,taskId,taskName,memberId,status="submitted",checks=[]})=>{
    if(!user||!hasAccess())throw new Error("Chưa có quyền truy cập.");if(isAdmin())throw new Error("Trưởng phòng dùng nút xác nhận trực tiếp.");if(!navigator.onLine)throw new Error("Đang ngoại tuyến.");if(memberId!==access.memberId)throw new Error("Bạn chỉ được báo công việc của mình.");
    const schedule=optimisticShape?.schedules?.[weekStart],assignment=(schedule?.assignments||[]).find(a=>a?.taskId===taskId&&a?.personId===memberId&&!a?.cut);
    if(!schedule||schedule.id!==scheduleId||!assignment)throw new Error("Công việc này không còn được phân cho bạn.");if(assignment.completed)throw new Error("Công việc đã được xác nhận hoàn thành.");
    const id=taskDocId(weekStart,taskId,memberId),ref=doc(taskCollection,id);
    if(!["in_progress","submitted"].includes(status))throw new Error("Trạng thái không hợp lệ.");
    const completion=status==="submitted"?{checks}:{};
    await runTransaction(db,async tx=>{
      const old=await tx.get(ref);
      if(old.exists()){
        const previous=old.data(),oldStatus=previous.status;
        if(previous.scheduleId!==scheduleId||previous.actorUid!==user.uid)throw new Error("Báo trực cũ đang giữ chỗ. Hãy nhờ trưởng phòng kiểm tra.");
        if(oldStatus==="approved")throw new Error("Công việc đã được xác nhận.");
        if(oldStatus==="submitted"&&status==="submitted")return;
        if(oldStatus==="submitted")throw new Error("Công việc đang chờ trưởng phòng xác nhận.");
        if(status==="in_progress")return;
        tx.update(ref,{status:"submitted",...completion,submittedAt:serverTimestamp(),updatedAt:serverTimestamp()});
      }else tx.set(ref,{roomCode,actorUid:user.uid,actorName:access.displayName||user.displayName||user.email||"Thành viên",memberId,scheduleId,weekStart,taskId,taskName:assignment.task||taskName||taskId,status,...completion,submittedAt:serverTimestamp(),updatedAt:serverTimestamp()});
      if(status==="submitted")await writeAudit({action:"SUBMIT_TASK",summary:`Báo hoàn thành: ${assignment.task||taskName||taskId}`,targetMemberId:memberId},tx);
    });
    return {id};
  };
  const reviewTask=async({submissionId,status,note=""})=>{
    if(!isAdmin())throw new Error("Chỉ trưởng phòng được xác nhận.");if(!navigator.onLine)throw new Error("Đang ngoại tuyến.");if(!["approved","rejected"].includes(status))throw new Error("Trạng thái không hợp lệ.");
    const actor=user.uid,ref=doc(taskCollection,submissionId),result=await runTransaction(db,async tx=>{
      const taskSnap=await tx.get(ref),roomSnap=await tx.get(roomRef);
      if(!taskSnap.exists())throw new Error("Không tìm thấy báo hoàn thành.");
      const task=taskSnap.data()||{};if(task.status===status)return null;if(task.status!=="submitted")throw new Error("Báo hoàn thành này đã được xử lý.");if(!roomSnap.exists())throw new Error("Không tìm thấy dữ liệu phòng.");
      const payload=clone(roomSnap.data()?.payload)||{},schedule=payload?.schedules?.[task.weekStart];
      if(!schedule||schedule.id!==task.scheduleId)throw new Error("Lịch trực tương ứng không còn tồn tại.");
      const assignment=(schedule.assignments||[]).find(a=>a?.taskId===task.taskId&&a?.personId===task.memberId&&!a?.cut);
      if(!assignment||assignment.completed)throw new Error("Phân công hoặc trạng thái đã thay đổi; hãy kiểm tra lại lịch.");
      if(status==="approved"){assignment.completed=true;schedule.updatedAt=new Date().toISOString();}
      tx.set(ref,{...task,status,reviewNote:String(note||"").slice(0,300),reviewedBy:user.uid,reviewedAt:serverTimestamp(),updatedAt:serverTimestamp()});
      if(status==="approved")tx.update(roomRef,new FieldPath("payload","schedules",task.weekStart),schedule,
        "revision",increment(1),"lastAdminUid",actor,"lastDeviceId",deviceId,"updatedAt",serverTimestamp());
      await writeAudit({action:status==="approved"?"VERIFY_TASK":"REJECT_TASK",summary:`${status==="approved"?"Xác nhận":"Yêu cầu làm lại"}: ${task.taskName||"công việc"}`,targetMemberId:task.memberId||null},tx);
      return status==="approved"?{payload,revision:(Number(roomSnap.data()?.revision)||0)+1}:null;
    });
    if(!result||user?.uid!==actor||!isAdmin())return true;
    acceptRoomShape(result.payload,result.revision);
    return true;
  };
  const completeTask=async({weekStart,scheduleId,taskId,memberId})=>{
    if(!isAdmin()||!navigator.onLine)throw new Error("Chỉ trưởng phòng đang kết nối mới được đánh dấu hoàn thành.");
    const actor=user.uid;
    const result=await runTransaction(db,async tx=>{
      const room=await tx.get(roomRef),payload=clone(room.data()?.payload),schedule=payload?.schedules?.[weekStart];
      const assignment=schedule?.assignments?.find(item=>item.taskId===taskId&&item.personId===memberId&&!item.cut);
      if(schedule?.id!==scheduleId||!assignment)throw new Error("Phân công vừa thay đổi. Hãy kiểm tra lại.");
      if(assignment.completed)return null;
      const report=await tx.get(doc(taskCollection,taskDocId(weekStart,taskId,memberId)));
      if(report.data()?.scheduleId===scheduleId&&report.data()?.status==="submitted")
        throw new Error("Thành viên đang chờ xác nhận. Hãy dùng Xác nhận hoặc Làm lại.");
      assignment.completed=true;schedule.updatedAt=new Date().toISOString();
      tx.update(roomRef,new FieldPath("payload","schedules",weekStart),schedule,
        "revision",increment(1),"lastAdminUid",actor,"lastDeviceId",deviceId,"updatedAt",serverTimestamp());
      await writeAudit({action:"UPDATE_TASK",summary:`${assignment.task||taskId}: Đã xong`,targetMemberId:memberId},tx);
      return {payload,revision:(Number(room.data()?.revision)||0)+1};
    });
    if(result&&user?.uid===actor&&isAdmin())acceptRoomShape(result.payload,result.revision);
    return true;
  };
  const requestTaskSwap=async({weekStart,scheduleId,taskId,otherTaskId,otherMemberId})=>{
    const memberId=access?.memberId;
    if(!memberId||!hasAccess()||!navigator.onLine)throw new Error("Cần kết nối và tài khoản đã liên kết.");
    const pendingId=[scheduleId,taskId,memberId,otherTaskId,otherMemberId].join("__");
    const ref=doc(swapCollection,pendingId),actorUid=user.uid;
    await runTransaction(db,async tx=>{
      if((await tx.get(ref)).exists())throw new Error("Yêu cầu đổi việc này đã tồn tại.");
      tx.set(ref,{
        weekStart,scheduleId,taskId,otherTaskId,memberId,otherMemberId,actorUid,
        status:"pending",createdAt:serverTimestamp(),updatedAt:serverTimestamp()
      });
    });
  };
  const reviewTaskSwap=async(swapId,approved)=>{
    if(!isAdmin()||!navigator.onLine)throw new Error("Chỉ trưởng phòng đang kết nối mới được duyệt.");
    const actor=user.uid,swapRef=doc(swapCollection,swapId);
    await runTransaction(db,async tx=>{
      const snap=await tx.get(swapRef),swap=snap.data();
      if(swap?.status!=="pending")throw new Error("Yêu cầu đã được xử lý.");
      if(approved){
        const room=await tx.get(roomRef),payload=clone(room.data()?.payload);
        const schedule=payload?.schedules?.[swap.weekStart];
        if(!schedule||schedule.id!==swap.scheduleId)throw new Error("Lịch đã thay đổi.");
        const first=schedule.assignments.find(a=>a.taskId===swap.taskId&&a.personId===swap.memberId&&!a.cut&&!a.completed);
        const second=schedule.assignments.find(a=>a.taskId===swap.otherTaskId&&a.personId===swap.otherMemberId&&!a.cut&&!a.completed);
        if(!first||!second)throw new Error("Phân công đã thay đổi.");
        for(const [task,person] of [[first,swap.memberId],[first,swap.otherMemberId],[second,swap.memberId],[second,swap.otherMemberId]]){
          const report=await tx.get(doc(taskCollection,taskDocId(swap.weekStart,task.taskId,person)));
          if(report.exists())throw new Error("Chỉ đổi các việc chưa bắt đầu.");
        }
        for(const [task,person] of [[first,swap.otherMemberId],[second,swap.memberId]]){
          if(!payload.members?.[person])throw new Error("Thành viên không còn trong phòng.");
          task.personId=person;task.personName=payload.members[person].name;task.reassigned=true;
        }
        schedule.updatedAt=new Date().toISOString();
        tx.update(roomRef,{payload,revision:increment(1),lastAdminUid:actor,lastDeviceId:deviceId,updatedAt:serverTimestamp()});
      }
      tx.update(swapRef,{status:approved?"approved":"rejected",reviewedBy:actor,updatedAt:serverTimestamp()});
    });
  };

  const commitDeletes=async docs=>{
    let deleted=0;
    for(let i=0;i<docs.length;i+=400){const batch=writeBatch(db),part=docs.slice(i,i+400);part.forEach(item=>batch.delete(item.ref));await batch.commit();deleted+=part.length;}
    return deleted;
  };
  const commitRedactions=async items=>{
    let updated=0;
    for(let i=0;i<items.length;i+=350){const batch=writeBatch(db),part=items.slice(i,i+350);part.forEach(item=>batch.set(item.ref,item.patch,{merge:true}));await batch.commit();updated+=part.length;}
    return updated;
  };
  const deleteTaskSubmissionsForWeek=async(weekStart,scheduleId)=>{
    if(!isAdmin())throw new Error("Chỉ trưởng phòng được dọn báo công việc.");if(!weekStart)return 0;
    const snap=await getDocs(query(taskCollection,where("weekStart","==",weekStart)));
    return commitDeletes(snap.docs.filter(item=>item.data().scheduleId===scheduleId));
  };
  const reconcileTaskSubmissions=async({weekStart,assignments=[]})=>{
    if(!isAdmin())throw new Error("Chỉ trưởng phòng được đồng bộ báo công việc.");if(!weekStart)return 0;
    const valid=new Set((assignments||[]).filter(a=>a&&!a.cut&&a.personId&&a.taskId).map(a=>`${a.taskId}::${a.personId}`)),snap=await getDocs(query(taskCollection,where("weekStart","==",weekStart)));
    const stale=snap.docs.filter(d=>{const data=d.data()||{};return !valid.has(`${data.taskId}::${data.memberId}`);});return commitDeletes(stale);
  };
  const deleteAccountFromRoom=async targetUid=>{
    if(!isAdmin())throw new Error("Chỉ trưởng phòng được xóa tài khoản khỏi phòng.");if(targetUid===user.uid)throw new Error("Không thể tự xóa tài khoản đang đăng nhập.");
    const targetAccessRef=doc(accessCollection,targetUid),targetMemberRef=doc(memberDataCollection,targetUid),targetRequestRef=doc(requestCollection,targetUid),[configSnap,targetSnap]=await Promise.all([getDoc(configRef),getDoc(targetAccessRef)]);
    if(configSnap.exists()&&configSnap.data()?.adminUid===targetUid)throw new Error("Không thể xóa tài khoản trưởng phòng chính.");
    const target=targetSnap.exists()?targetSnap.data():{},targetEmail=String(target?.email||"").trim(),emailLower=targetEmail.toLowerCase(),targetMemberId=target?.memberId||null,label=target?.displayName||targetMemberId||"tài khoản đã chọn";
    const materializedShape=await runTransaction(db,async tx=>{
      const roomSnap=await tx.get(roomRef),memberSnap=await tx.get(targetMemberRef),base=roomSnap.exists()?clone(roomSnap.data()?.payload)||{}:{};
      let merged=base;if(memberSnap.exists()&&targetMemberId)merged=overlayMemberData(base,new Map([[targetUid,{uid:targetUid,...memberSnap.data(),memberId:targetMemberId}]]));
      if(roomSnap.exists())tx.set(roomRef,{schemaVersion:5,roomCode,revision:increment(1),payload:merged,lastAdminUid:user.uid,lastDeviceId:deviceId,updatedAt:serverTimestamp()},{merge:true});
      tx.delete(targetAccessRef);tx.delete(targetRequestRef);tx.delete(targetMemberRef);return merged;
    });
    remoteShape=clone(materializedShape)||remoteShape;accessByUid.delete(targetUid);memberDataByUid.delete(targetUid);rebuild();
    const taskSnap=await getDocs(query(taskCollection,where("actorUid","==",targetUid))),taskDeleted=await commitDeletes(taskSnap.docs),auditSnap=await getDocs(auditCollection),redactions=[],emailPattern=targetEmail?new RegExp(escapeRegExp(targetEmail),"gi"):null;
    for(const logDoc of auditSnap.docs){
      const data=logDoc.data()||{},summary=String(data.summary||""),actorEmail=String(data.actorEmail||""),actorMatches=data.actorUid===targetUid||(emailLower&&actorEmail.toLowerCase()===emailLower),summaryMatches=Boolean(emailLower&&summary.toLowerCase().includes(emailLower));
      if(!actorMatches&&!summaryMatches)continue;
      const patch={};if(actorMatches)patch.actorEmail="";if(emailLower&&String(data.actorName||"").toLowerCase()===emailLower)patch.actorName="Tài khoản đã xóa";if(summaryMatches&&emailPattern)patch.summary=summary.replace(emailPattern,"[email đã xóa]");if(Object.keys(patch).length)redactions.push({ref:logDoc.ref,patch});
    }
    const auditRedacted=await commitRedactions(redactions);await writeAudit({action:"REMOVE_ACCOUNT",summary:`Xóa ${label} khỏi phòng (bản Free)`,targetMemberId:targetMemberId||null});
    return {removed:true,taskDeleted,auditRedacted,targetMemberId,authDeleted:false};
  };
  const cleanupAuditLogs=async(retentionDays=30)=>{
    if(!isAdmin())throw new Error("Chỉ trưởng phòng được dọn nhật ký.");
    const days=Math.max(30,Math.min(365,Math.round(Number(retentionDays)||30))),cutoff=Timestamp.fromMillis(Date.now()-days*24*60*60*1000);let deletedCount=0;
    for(;;){const snap=await getDocs(query(auditCollection,where("createdAt","<",cutoff),orderBy("createdAt","asc"),limit(400)));if(snap.empty)break;deletedCount+=await commitDeletes(snap.docs);if(snap.size<400)break;}
    await writeAudit({action:"CLEANUP_AUDIT",summary:`Dọn ${deletedCount} nhật ký cũ hơn ${days} ngày`});return {deletedCount,retentionDays:days,cutoff:new Date(cutoff.toMillis()).toISOString()};
  };
  const forceSync=()=>{
    if(!user||!hasAccess())return Promise.resolve(false);
    if(restoreInFlight)return restoreInFlight;
    const actor=user.uid;
    const pending=getDocFromServer(roomRef).then(snap=>{
      if(user?.uid!==actor||!hasAccess())return false;
      acceptRoomShape(snap.data()?.payload,Number(snap.data()?.revision)||0);
      emitStatus("online","Đã đồng bộ");
      return true;
    }).catch(e=>{
      if(user?.uid===actor)emitStatus("offline","Không thể đồng bộ",{error:e});
      return false;
    }).finally(()=>{if(restoreInFlight===pending)restoreInFlight=null;});
    restoreInFlight=pending;
    return pending;
  };
  const flush=forceSync;
  const stop=()=>{authUnsub?.();clearUserListeners();window.removeEventListener("online",onlineHandler);window.removeEventListener("offline",offlineHandler);started=false;};
  return {start,stop,signInGoogle,signOut,requestAccess,cancelAccessRequest,approveRequest,updateAccess,revokeAccess,recordShape,saveBillingDays,submitTask,reviewTask,completeTask,requestTaskSwap,reviewTaskSwap,reconcileTaskSubmissions,deleteTaskSubmissionsForWeek,deleteAccountFromRoom,cleanupAuditLogs,forceSync,flush};
}
