import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, browserLocalPersistence, setPersistence,
  onAuthStateChanged, signInWithPopup, signInWithRedirect, getRedirectResult,
  signOut as firebaseSignOut
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
  initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, collection, query, orderBy, limit, onSnapshot, runTransaction, serverTimestamp,
  setDoc, deleteDoc, getDoc, increment
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-functions.js";

const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
const isObject=value=>value!==null&&typeof value==="object"&&!Array.isArray(value);
const jsonEqual=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

function diffJson(before,after,path=[],output=[]){
  if(jsonEqual(before,after))return output;
  if(after===undefined){output.push({type:"remove",path:[...path]});return output;}
  if(before===undefined||Array.isArray(before)||Array.isArray(after)||!isObject(before)||!isObject(after)){output.push({type:"set",path:[...path],value:clone(after)});return output;}
  const keys=new Set([...Object.keys(before),...Object.keys(after)]);for(const key of keys)diffJson(before[key],after[key],[...path,key],output);return output;
}
function memberPersonEntry(shape,memberId,month){const people=shape?.billingMonths?.[month]?.people||{};return Object.entries(people).find(([,p])=>p?.memberId===memberId)||null;}
function extractMemberData(shape,memberId,previous={}){
  const billingMonths={};for(const month of Object.keys(shape?.billingMonths||{})){const entry=memberPersonEntry(shape,memberId,month);if(entry)billingMonths[month]={days:clone(entry[1]?.days||{})};else if(previous?.billingMonths?.[month])billingMonths[month]=clone(previous.billingMonths[month]);}
  return {memberId,presence:shape?.presence?.[memberId]!==false,billingMonths};
}
function overlayMemberData(adminShape,memberDataByUid){
  const output=clone(adminShape)||{};output.members||={};output.presence||={};output.billingMonths||={};
  for(const data of memberDataByUid.values()){const memberId=data?.memberId;if(!memberId||!output.members?.[memberId])continue;if(typeof data.presence==="boolean")output.presence[memberId]=data.presence;for(const [month,monthData] of Object.entries(data.billingMonths||{})){const entry=memberPersonEntry(output,memberId,month);if(!entry)continue;output.billingMonths[month].people[entry[0]].days=clone(monthData?.days||{});}}
  return output;
}
function memberAllowedOperation(operation,memberId,currentShape,nextShape){
  const path=operation.path||[];if(path[0]==="presence"&&path.length===2&&path[1]===memberId)return true;
  if(path[0]!=="billingMonths"||path.length<3)return false;const month=path[1];
  if(path[2]==="updatedAt"&&path.length===3)return true;if(path[2]!=="people"||path.length<5)return false;
  const personKey=path[3],person=nextShape?.billingMonths?.[month]?.people?.[personKey]||currentShape?.billingMonths?.[month]?.people?.[personKey];if(person?.memberId!==memberId)return false;
  return ["days","updatedAt","dayUpdatedAt"].includes(path[4]);
}
function makeLogId(uid){const random=globalThis.crypto?.randomUUID?.()||Math.random().toString(36).slice(2);return `${Date.now()}-${uid}-${random}`;}
function taskDocId(weekStart,taskId,memberId){return `${String(weekStart).replaceAll("/","-")}__${String(taskId).replaceAll("/","-")}__${String(memberId).replaceAll("/","-")}`;}

export function createP708SecureEngine({firebaseConfig,roomCode,deviceId,initialShape,onShape,onStatus,onSession,onAdminData,onTaskData}){
  if(!firebaseConfig?.apiKey)throw new Error("Chưa cấu hình Firebase.");
  const appName="p708-secure-manager-v5";const app=getApps().some(x=>x.name===appName)?getApp(appName):initializeApp(firebaseConfig,appName);
  let db;try{db=initializeFirestore(app,{localCache:persistentLocalCache({tabManager:persistentMultipleTabManager()})});}catch{db=getFirestore(app);}
  const auth=getAuth(app),provider=new GoogleAuthProvider();provider.setCustomParameters({prompt:"select_account"});
  const functions=getFunctions(app,"us-central1");
  const deleteAccountCallable=httpsCallable(functions,"deleteP708Account");
  const cleanupAuditCallable=httpsCallable(functions,"cleanupP708AuditLogs");
  const roomRef=doc(db,"rooms",roomCode),configRef=doc(db,"rooms",roomCode,"security","config");
  const accessCollection=collection(db,"rooms",roomCode,"access"),requestCollection=collection(db,"rooms",roomCode,"accessRequests"),memberDataCollection=collection(db,"rooms",roomCode,"memberData"),auditCollection=collection(db,"rooms",roomCode,"auditLogs"),taskCollection=collection(db,"rooms",roomCode,"taskSubmissions");

  let user=null,access=null,ownRequest=null,adminExists=false,remoteShape=clone(initialShape)||{},optimisticShape=clone(initialShape)||{},memberDataByUid=new Map(),accessByUid=new Map(),started=false;
  let authUnsub=null,configUnsub=null,accessUnsub=null,requestUnsub=null,roomUnsub=null,memberDataUnsub=null,adminAccessUnsub=null,adminRequestsUnsub=null,auditUnsub=null,taskUnsub=null;
  const isAdmin=()=>access?.active&&access?.role==="admin",hasAccess=()=>!!access?.active;
  const emitStatus=(mode,text,extra={})=>onStatus?.({mode,text,online:navigator.onLine,...extra});
  const emitSession=(extra={})=>onSession?.({user:user?{uid:user.uid,email:user.email||"",displayName:user.displayName||"",photoURL:user.photoURL||""}:null,access:clone(access),request:clone(ownRequest),adminExists,status:!user?"signedOut":access?.active?"active":ownRequest?"pending":"needsAccess",...extra});
  const emitAdminData=(requests=null,accesses=null,logs=null)=>onAdminData?.({requests:requests??undefined,accesses:accesses??undefined,logs:logs??undefined});
  const rebuild=()=>{optimisticShape=overlayMemberData(remoteShape||{},memberDataByUid);onShape?.(clone(optimisticShape),{role:access?.role||null,memberId:access?.memberId||null});};

  const writeAudit=async(audit={})=>{if(!user||!hasAccess())return;await setDoc(doc(auditCollection,makeLogId(user.uid)),{roomCode,actorUid:user.uid,actorName:access?.displayName||user.displayName||user.email||"Người dùng",actorEmail:user.email||"",role:access?.role||"member",action:audit.action||"UPDATE_DATA",summary:audit.summary||"Cập nhật dữ liệu",targetMemberId:audit.targetMemberId||null,deviceId,createdAt:serverTimestamp()});};

  const syncMappedMemberOverrides=async(nextShape,previousShape)=>{
    if(!isAdmin())return;const writes=[];for(const [mappedUid,item] of accessByUid.entries()){if(!item?.active||!item?.memberId)continue;const before=extractMemberData(previousShape||{},item.memberId,memberDataByUid.get(mappedUid)),after=extractMemberData(nextShape||{},item.memberId,memberDataByUid.get(mappedUid));if(!jsonEqual(before,after)){memberDataByUid.set(mappedUid,clone(after));writes.push(setDoc(doc(memberDataCollection,mappedUid),{...after,updatedBy:user.uid,updatedAt:serverTimestamp()}));}}if(writes.length)await Promise.all(writes);
  };
  const stopDataListeners=()=>{roomUnsub?.();memberDataUnsub?.();adminAccessUnsub?.();adminRequestsUnsub?.();auditUnsub?.();taskUnsub?.();roomUnsub=memberDataUnsub=adminAccessUnsub=adminRequestsUnsub=auditUnsub=taskUnsub=null;memberDataByUid=new Map();accessByUid=new Map();};
  const startAdminListeners=()=>{
    adminAccessUnsub?.();adminRequestsUnsub?.();auditUnsub?.();
    adminAccessUnsub=onSnapshot(accessCollection,snap=>{accessByUid=new Map(snap.docs.map(d=>[d.id,{uid:d.id,...d.data()}]));emitAdminData(null,[...accessByUid.values()],null);},e=>emitStatus("offline","Không tải được danh sách quyền",{error:e}));
    adminRequestsUnsub=onSnapshot(requestCollection,snap=>emitAdminData(snap.docs.map(d=>({uid:d.id,...d.data()})),null,null),e=>emitStatus("offline","Không tải được yêu cầu tham gia",{error:e}));
    auditUnsub=onSnapshot(query(auditCollection,orderBy("createdAt","desc"),limit(200)),snap=>emitAdminData(null,null,snap.docs.map(d=>({id:d.id,...d.data()}))),e=>emitStatus("offline","Không tải được nhật ký",{error:e}));
  };
  const startTaskListener=()=>{taskUnsub?.();taskUnsub=onSnapshot(query(taskCollection,orderBy("updatedAt","desc"),limit(200)),snap=>onTaskData?.(snap.docs.map(d=>({id:d.id,...d.data()}))),e=>emitStatus("offline","Không tải được trạng thái công việc",{error:e}));};
  const startRoomListeners=()=>{
    stopDataListeners();
    roomUnsub=onSnapshot(roomRef,{includeMetadataChanges:true},snap=>{const data=snap.exists()?snap.data():{};remoteShape=clone(data.payload)||{};if(!snap.exists()&&isAdmin()&&Object.keys(initialShape?.members||{}).length){void setDoc(roomRef,{schemaVersion:5,roomCode,revision:1,payload:clone(initialShape),lastAdminUid:user.uid,lastDeviceId:deviceId,updatedAt:serverTimestamp()},{merge:true});}rebuild();emitStatus(snap.metadata.hasPendingWrites?"syncing":navigator.onLine?"online":"offline",snap.metadata.hasPendingWrites?"Đang đồng bộ…":navigator.onLine?"Đã đồng bộ":"Đang dùng dữ liệu ngoại tuyến");},e=>emitStatus("offline","Không thể đọc dữ liệu phòng",{error:e}));
    memberDataUnsub=onSnapshot(memberDataCollection,{includeMetadataChanges:true},snap=>{memberDataByUid=new Map(snap.docs.map(d=>[d.id,{uid:d.id,...d.data()}]));rebuild();},e=>emitStatus("offline","Không thể đọc dữ liệu thành viên",{error:e}));
    startTaskListener();if(isAdmin())startAdminListeners();
  };
  const handleAccessChange=next=>{const oldRole=access?.role;access=next?.active?next:null;if(access&&user)accessByUid.set(user.uid,{uid:user.uid,...access});emitSession();if(!access){stopDataListeners();return;}if(!roomUnsub||oldRole!==access.role)startRoomListeners();rebuild();};
  const attachUserListeners=()=>{configUnsub?.();accessUnsub?.();requestUnsub?.();configUnsub=onSnapshot(configRef,s=>{adminExists=s.exists()&&!!s.data()?.adminUid;emitSession();},e=>emitSession({error:e}));accessUnsub=onSnapshot(doc(accessCollection,user.uid),s=>handleAccessChange(s.exists()?{uid:s.id,...s.data()}:null),e=>emitSession({error:e}));requestUnsub=onSnapshot(doc(requestCollection,user.uid),s=>{ownRequest=s.exists()?{uid:s.id,...s.data()}:null;emitSession();},e=>emitSession({error:e}));};
  const clearUserListeners=()=>{configUnsub?.();accessUnsub?.();requestUnsub?.();configUnsub=accessUnsub=requestUnsub=null;stopDataListeners();access=null;ownRequest=null;adminExists=false;};

  const start=async()=>{if(started)return;started=true;emitStatus("syncing","Đang khởi động bảo mật…");await setPersistence(auth,browserLocalPersistence);try{await getRedirectResult(auth);}catch{}authUnsub=onAuthStateChanged(auth,next=>{clearUserListeners();user=next;if(!user){emitSession();emitStatus("offline","Chưa đăng nhập");return;}emitSession({status:"checking"});attachUserListeners();emitStatus("syncing","Đang kiểm tra quyền…");});window.addEventListener("online",()=>emitStatus("syncing","Đang kết nối lại…"));window.addEventListener("offline",()=>emitStatus("offline","Mất kết nối · dữ liệu được giữ trên thiết bị"));};
  const signInGoogle=async()=>{try{await signInWithPopup(auth,provider);}catch(e){if(["auth/popup-blocked","auth/cancelled-popup-request","auth/operation-not-supported-in-this-environment"].includes(e?.code)){await signInWithRedirect(auth,provider);return;}throw e;}};
  const signOut=()=>firebaseSignOut(auth);
  const claimAdmin=async displayName=>{if(!user)throw new Error("Bạn cần đăng nhập trước.");await runTransaction(db,async tx=>{const snap=await tx.get(configRef);if(snap.exists()&&snap.data()?.adminUid)throw new Error("Phòng đã có trưởng phòng.");tx.set(configRef,{roomCode,adminUid:user.uid,adminEmail:user.email||"",createdAt:serverTimestamp()});});await setDoc(doc(accessCollection,user.uid),{email:user.email||"",displayName:String(displayName||user.displayName||"Trưởng phòng").trim(),role:"admin",memberId:null,active:true,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});};
  const requestAccess=async displayName=>{if(!user)throw new Error("Bạn cần đăng nhập trước.");const name=String(displayName||user.displayName||"").trim();if(!name)throw new Error("Vui lòng nhập tên trong phòng.");await setDoc(doc(requestCollection,user.uid),{uid:user.uid,email:user.email||"",displayName:name,photoURL:user.photoURL||"",status:"pending",requestedAt:serverTimestamp(),updatedAt:serverTimestamp()});};
  const cancelAccessRequest=async()=>{if(user)await deleteDoc(doc(requestCollection,user.uid));};
  const approveRequest=async({uid,memberId,role="member",displayName=""})=>{if(!isAdmin())throw new Error("Chỉ trưởng phòng được duyệt.");const req=await getDoc(doc(requestCollection,uid)),data=req.exists()?req.data():{};await setDoc(doc(accessCollection,uid),{email:data.email||"",displayName:displayName||data.displayName||"Thành viên",role:role==="admin"?"admin":"member",memberId:memberId||null,active:true,approvedBy:user.uid,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});await deleteDoc(doc(requestCollection,uid));await writeAudit({action:"APPROVE_ACCESS",summary:`Duyệt quyền cho ${displayName||data.displayName||data.email||uid}`,targetMemberId:memberId||null});};
  const updateAccess=async({uid,memberId,role,displayName,active=true})=>{if(!isAdmin())throw new Error("Chỉ trưởng phòng được sửa quyền.");const ref=doc(accessCollection,uid),old=await getDoc(ref);if(!old.exists())throw new Error("Không tìm thấy tài khoản.");await setDoc(ref,{...old.data(),memberId:memberId||null,role:role==="admin"?"admin":"member",displayName:displayName||old.data().displayName||"Thành viên",active:!!active,updatedAt:serverTimestamp(),updatedBy:user.uid});await writeAudit({action:"UPDATE_ACCESS",summary:`Cập nhật quyền ${displayName||old.data().displayName||old.data().email||uid}`,targetMemberId:memberId||null});};
  const revokeAccess=async uid=>{if(!isAdmin())throw new Error("Chỉ trưởng phòng được khóa tài khoản.");if(uid===user.uid)throw new Error("Không thể tự khóa tài khoản đang dùng.");const ref=doc(accessCollection,uid),old=await getDoc(ref);if(!old.exists())return;await setDoc(ref,{...old.data(),active:false,updatedAt:serverTimestamp(),updatedBy:user.uid});await writeAudit({action:"REVOKE_ACCESS",summary:`Khóa quyền ${old.data().displayName||old.data().email||uid}`,targetMemberId:old.data().memberId||null});};

  const recordShape=async(nextShape,audit={})=>{
    if(!user||!hasAccess())throw new Error("Tài khoản chưa được cấp quyền.");const desired=clone(nextShape)||{};
    if(isAdmin()){
      const previous=clone(optimisticShape)||{};await syncMappedMemberOverrides(desired,previous);remoteShape=desired;rebuild();
      await setDoc(roomRef,{schemaVersion:5,roomCode,revision:increment(1),payload:desired,lastAdminUid:user.uid,lastDeviceId:deviceId,updatedAt:serverTimestamp()},{merge:true});
      if(audit?.summary||audit?.action)await writeAudit(audit);emitStatus("online","Đã đồng bộ");return true;
    }
    const memberId=access.memberId;if(!memberId)throw new Error("Tài khoản chưa liên kết với thành viên.");const operations=diffJson(optimisticShape,desired);const forbidden=operations.find(op=>!memberAllowedOperation(op,memberId,optimisticShape,desired));if(forbidden)throw new Error("Bạn chỉ được chỉnh trạng thái và ngày ở của chính mình.");const own=extractMemberData(desired,memberId,memberDataByUid.get(user.uid));memberDataByUid.set(user.uid,clone(own));rebuild();await setDoc(doc(memberDataCollection,user.uid),{...own,updatedBy:user.uid,updatedAt:serverTimestamp()});if(audit?.summary||audit?.action)await writeAudit(audit);emitStatus("online","Đã đồng bộ");return true;
  };

  const submitTask=async({scheduleId,weekStart,taskId,taskName,memberId})=>{if(!user||!hasAccess())throw new Error("Chưa có quyền truy cập.");if(isAdmin())throw new Error("Trưởng phòng dùng nút xác nhận trực tiếp.");if(memberId!==access.memberId)throw new Error("Bạn chỉ được báo công việc của mình.");const id=taskDocId(weekStart,taskId,memberId);await setDoc(doc(taskCollection,id),{roomCode,actorUid:user.uid,actorName:access.displayName||user.displayName||user.email||"Thành viên",memberId,scheduleId,weekStart,taskId,taskName,status:"submitted",submittedAt:serverTimestamp(),updatedAt:serverTimestamp()},{merge:true});await writeAudit({action:"SUBMIT_TASK",summary:`Báo hoàn thành: ${taskName}`,targetMemberId:memberId});return {id};};
  const reviewTask=async({submissionId,status,note=""})=>{if(!isAdmin())throw new Error("Chỉ trưởng phòng được xác nhận.");if(!["approved","rejected"].includes(status))throw new Error("Trạng thái không hợp lệ.");const ref=doc(taskCollection,submissionId),old=await getDoc(ref);if(!old.exists())throw new Error("Không tìm thấy báo hoàn thành.");await setDoc(ref,{...old.data(),status,reviewNote:note,reviewedBy:user.uid,reviewedAt:serverTimestamp(),updatedAt:serverTimestamp()});await writeAudit({action:status==="approved"?"VERIFY_TASK":"REJECT_TASK",summary:`${status==="approved"?"Xác nhận":"Yêu cầu làm lại"}: ${old.data().taskName||"công việc"}`,targetMemberId:old.data().memberId||null});};

  const deleteAccountCompletely=async targetUid=>{if(!isAdmin())throw new Error("Chỉ trưởng phòng được xóa tài khoản.");if(targetUid===user.uid)throw new Error("Không thể tự xóa tài khoản đang đăng nhập.");const result=await deleteAccountCallable({roomCode,targetUid});return result.data||{};};
  const cleanupAuditLogs=async(retentionDays=30)=>{if(!isAdmin())throw new Error("Chỉ trưởng phòng được dọn nhật ký.");const result=await cleanupAuditCallable({roomCode,retentionDays});return result.data||{};};
  const forceSync=async()=>{if(!user||!hasAccess())return false;try{const snap=await getDoc(roomRef);if(snap.exists()){remoteShape=clone(snap.data()?.payload)||{};rebuild();}emitStatus("online","Đã đồng bộ");return true;}catch(e){emitStatus("offline","Không thể đồng bộ",{error:e});return false;}};
  const flush=forceSync;
  const stop=()=>{authUnsub?.();clearUserListeners();};
  return {start,stop,signInGoogle,signOut,claimAdmin,requestAccess,cancelAccessRequest,approveRequest,updateAccess,revokeAccess,recordShape,submitTask,reviewTask,deleteAccountCompletely,cleanupAuditLogs,forceSync,flush};
}
