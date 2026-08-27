import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, browserLocalPersistence, setPersistence,
  onAuthStateChanged, signInWithPopup, signInWithRedirect, getRedirectResult,
  signOut as firebaseSignOut
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
  initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, collection, query, where, orderBy, limit, onSnapshot, runTransaction, serverTimestamp,
  setDoc, deleteDoc, getDoc, getDocs, writeBatch, Timestamp, increment
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

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
      const entry=memberPersonEntry(output,memberId,month);
      if(!entry)continue;
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

export function createP708SecureEngine({firebaseConfig,roomCode,deviceId,initialShape,onShape,onStatus,onSession,onAdminData,onTaskData}){
  if(!firebaseConfig?.apiKey)throw new Error("Chưa cấu hình Firebase.");
  const appName="p708-secure-manager-v5";
  const app=getApps().some(x=>x.name===appName)?getApp(appName):initializeApp(firebaseConfig,appName);
  let db;
  try{db=initializeFirestore(app,{localCache:persistentLocalCache({tabManager:persistentMultipleTabManager()})});}
  catch{db=getFirestore(app);}
  const auth=getAuth(app),provider=new GoogleAuthProvider();
  provider.setCustomParameters({prompt:"select_account"});
  const roomRef=doc(db,"rooms",roomCode),configRef=doc(db,"rooms",roomCode,"security","config");
  const accessCollection=collection(db,"rooms",roomCode,"access"),
    requestCollection=collection(db,"rooms",roomCode,"accessRequests"),
    memberDataCollection=collection(db,"rooms",roomCode,"memberData"),
    auditCollection=collection(db,"rooms",roomCode,"auditLogs"),
    taskCollection=collection(db,"rooms",roomCode,"taskSubmissions");

  let user=null,access=null,ownRequest=null,adminExists=false,
    remoteShape=clone(initialShape)||{},optimisticShape=clone(initialShape)||{},
    memberDataByUid=new Map(),accessByUid=new Map(),started=false,repairingPrimaryAccess=false;
  let authUnsub=null,configUnsub=null,accessUnsub=null,requestUnsub=null,
    roomUnsub=null,memberDataUnsub=null,adminAccessUnsub=null,adminRequestsUnsub=null,
    auditUnsub=null,taskUnsub=null;
  const isAdmin=()=>access?.active&&access?.role==="admin";
  const hasAccess=()=>!!access?.active;
  const emitStatus=(mode,text,extra={})=>onStatus?.({mode,text,online:navigator.onLine,...extra});
  const emitSession=(extra={})=>onSession?.({
    user:user?{uid:user.uid,email:user.email||"",displayName:user.displayName||"",photoURL:user.photoURL||""}:null,
    access:clone(access),request:clone(ownRequest),adminExists,
    status:!user?"signedOut":access?.active?"active":ownRequest?"pending":"needsAccess",
    ...extra
  });
  const emitAdminData=(requests=null,accesses=null,logs=null)=>onAdminData?.({requests:requests??undefined,accesses:accesses??undefined,logs:logs??undefined});
  const rebuild=()=>{
    optimisticShape=overlayMemberData(remoteShape||{},memberDataByUid);
    onShape?.(clone(optimisticShape),{role:access?.role||null,memberId:access?.memberId||null});
  };

  const writeAudit=async(audit={})=>{
    if(!user||!hasAccess())return;
    await setDoc(doc(auditCollection,makeLogId(user.uid)),{
      roomCode,actorUid:user.uid,
      actorName:access?.displayName||user.displayName||user.email||"Người dùng",
      actorEmail:user.email||"",role:access?.role||"member",
      action:audit.action||"UPDATE_DATA",summary:audit.summary||"Cập nhật dữ liệu",
      targetMemberId:audit.targetMemberId||null,deviceId,createdAt:serverTimestamp()
    });
  };

  const mappedMemberChanges=(nextShape,previousShape)=>{
    const changes=[];
    if(!isAdmin())return changes;
    for(const [mappedUid,item] of accessByUid.entries()){
      if(!item?.active||!item?.memberId)continue;
      const previousDoc=memberDataByUid.get(mappedUid);
      const before=extractMemberData(previousShape||{},item.memberId,previousDoc);
      const after=extractMemberData(nextShape||{},item.memberId,previousDoc);
      const operations=diffJson(before,after);
      if(operations.length)changes.push({mappedUid,item,before,after,operations});
    }
    return changes;
  };

  const stopDataListeners=()=>{
    roomUnsub?.();memberDataUnsub?.();adminAccessUnsub?.();adminRequestsUnsub?.();auditUnsub?.();taskUnsub?.();
    roomUnsub=memberDataUnsub=adminAccessUnsub=adminRequestsUnsub=auditUnsub=taskUnsub=null;
    memberDataByUid=new Map();accessByUid=new Map();
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
    taskUnsub=onSnapshot(query(taskCollection,orderBy("updatedAt","desc"),limit(200)),snap=>onTaskData?.(snap.docs.map(d=>({id:d.id,...d.data()}))),e=>emitStatus("offline","Không tải được trạng thái công việc",{error:e}));
  };
  const startRoomListeners=()=>{
    stopDataListeners();
    roomUnsub=onSnapshot(roomRef,{includeMetadataChanges:true},snap=>{
      const data=snap.exists()?snap.data():{};
      remoteShape=clone(data.payload)||{};
      if(!snap.exists()&&isAdmin()&&Object.keys(initialShape?.members||{}).length){
        void setDoc(roomRef,{schemaVersion:5,roomCode,revision:1,payload:clone(initialShape),lastAdminUid:user.uid,lastDeviceId:deviceId,updatedAt:serverTimestamp()},{merge:true});
      }
      rebuild();
      emitStatus(snap.metadata.hasPendingWrites?"syncing":navigator.onLine?"online":"offline",snap.metadata.hasPendingWrites?"Đang đồng bộ…":navigator.onLine?"Đã đồng bộ":"Đang dùng dữ liệu ngoại tuyến");
    },e=>emitStatus("offline","Không thể đọc dữ liệu phòng",{error:e}));
    memberDataUnsub=onSnapshot(memberDataCollection,{includeMetadataChanges:true},snap=>{
      memberDataByUid=new Map(snap.docs.map(d=>[d.id,{uid:d.id,...d.data()}]));rebuild();
    },e=>emitStatus("offline","Không thể đọc dữ liệu thành viên",{error:e}));
    startTaskListener();if(isAdmin())startAdminListeners();
  };
  const handleAccessChange=next=>{
    const oldRole=access?.role;access=next?.active?next:null;
    if(access&&user)accessByUid.set(user.uid,{uid:user.uid,...access});
    emitSession();if(!access){stopDataListeners();return;}
    if(!roomUnsub||oldRole!==access.role)startRoomListeners();rebuild();
  };
  const repairPrimaryAccess=async configData=>{
    if(repairingPrimaryAccess||!user||configData?.adminUid!==user.uid)return;
    repairingPrimaryAccess=true;
    try{
      const ref=doc(accessCollection,user.uid),snap=await getDoc(ref),current=snap.exists()?snap.data():{};
      if(!snap.exists()||current.active!==true||current.role!=="admin"){
        await setDoc(ref,{...current,email:user.email||current.email||"",displayName:current.displayName||user.displayName||"Trưởng phòng",role:"admin",memberId:current.memberId||null,active:true,createdAt:current.createdAt||serverTimestamp(),updatedAt:serverTimestamp(),updatedBy:user.uid},{merge:true});
      }
    }finally{repairingPrimaryAccess=false;}
  };
  const attachUserListeners=()=>{
    configUnsub?.();accessUnsub?.();requestUnsub?.();
    configUnsub=onSnapshot(configRef,s=>{const config=s.exists()?s.data():null;adminExists=!!config?.adminUid;if(config?.adminUid===user?.uid)void repairPrimaryAccess(config).catch(e=>emitSession({error:e}));emitSession();},e=>emitSession({error:e}));
    accessUnsub=onSnapshot(doc(accessCollection,user.uid),s=>handleAccessChange(s.exists()?{uid:s.id,...s.data()}:null),e=>emitSession({error:e}));
    requestUnsub=onSnapshot(doc(requestCollection,user.uid),s=>{ownRequest=s.exists()?{uid:s.id,...s.data()}:null;emitSession();},e=>emitSession({error:e}));
  };
  const clearUserListeners=()=>{
    configUnsub?.();accessUnsub?.();requestUnsub?.();configUnsub=accessUnsub=requestUnsub=null;
    stopDataListeners();access=null;ownRequest=null;adminExists=false;
  };

  const start=async()=>{
    if(started)return;started=true;emitStatus("syncing","Đang khởi động bảo mật…");
    await setPersistence(auth,browserLocalPersistence);try{await getRedirectResult(auth);}catch{}
    authUnsub=onAuthStateChanged(auth,next=>{clearUserListeners();user=next;if(!user){emitSession();emitStatus("offline","Chưa đăng nhập");return;}emitSession({status:"checking"});attachUserListeners();emitStatus("syncing","Đang kiểm tra quyền…");});
    window.addEventListener("online",()=>emitStatus("syncing","Đang kết nối lại…"));
    window.addEventListener("offline",()=>emitStatus("offline","Mất kết nối · dữ liệu được giữ trên thiết bị"));
  };
  const signInGoogle=async()=>{
    try{await signInWithPopup(auth,provider);}
    catch(e){if(["auth/popup-blocked","auth/cancelled-popup-request","auth/operation-not-supported-in-this-environment"].includes(e?.code)){await signInWithRedirect(auth,provider);return;}throw e;}
  };
  const signOut=()=>firebaseSignOut(auth);

  const claimAdmin=async displayName=>{
    if(!user)throw new Error("Bạn cần đăng nhập trước.");
    const accessRef=doc(accessCollection,user.uid),name=String(displayName||user.displayName||"Trưởng phòng").trim()||"Trưởng phòng";
    await runTransaction(db,async tx=>{
      const snap=await tx.get(configRef);if(snap.exists()&&snap.data()?.adminUid)throw new Error("Phòng đã có trưởng phòng.");
      tx.set(configRef,{roomCode,adminUid:user.uid,createdAt:serverTimestamp()});
      tx.set(accessRef,{email:user.email||"",displayName:name,role:"admin",memberId:null,active:true,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
    });
  };
  const requestAccess=async displayName=>{
    if(!user)throw new Error("Bạn cần đăng nhập trước.");
    const name=String(displayName||user.displayName||"").trim();
    if(!name)throw new Error("Vui lòng nhập tên trong phòng.");if(name.length>80)throw new Error("Tên hiển thị quá dài.");
    await setDoc(doc(requestCollection,user.uid),{uid:user.uid,email:user.email||"",displayName:name,photoURL:user.photoURL||"",status:"pending",requestedAt:serverTimestamp(),updatedAt:serverTimestamp()});
  };
  const cancelAccessRequest=async()=>{if(user)await deleteDoc(doc(requestCollection,user.uid));};

  const approveRequest=async({uid,memberId,role="member",displayName=""})=>{
    if(!isAdmin())throw new Error("Chỉ trưởng phòng được duyệt.");if(!uid)throw new Error("Thiếu UID tài khoản.");
    const reqRef=doc(requestCollection,uid),accessRef=doc(accessCollection,uid),memberRef=doc(memberDataCollection,uid),req=await getDoc(reqRef);
    if(!req.exists())throw new Error("Yêu cầu tham gia không còn tồn tại.");
    const data=req.data()||{},normalizedRole=role==="admin"?"admin":"member",normalizedMemberId=memberId||null,batch=writeBatch(db);
    batch.set(accessRef,{email:data.email||"",displayName:String(displayName||data.displayName||"Thành viên").trim().slice(0,80)||"Thành viên",role:normalizedRole,memberId:normalizedMemberId,active:true,approvedBy:user.uid,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
    batch.delete(reqRef);
    if(normalizedMemberId){const initialMemberData=extractMemberData(optimisticShape,normalizedMemberId,{});batch.set(memberRef,{...initialMemberData,updatedBy:user.uid,updatedAt:serverTimestamp()});}else batch.delete(memberRef);
    await batch.commit();
    await writeAudit({action:"APPROVE_ACCESS",summary:`Duyệt quyền cho ${displayName||data.displayName||data.email||uid}`,targetMemberId:normalizedMemberId});
  };
  const updateAccess=async({uid,memberId,role,displayName,active=true})=>{
    if(!isAdmin())throw new Error("Chỉ trưởng phòng được sửa quyền.");if(!uid)throw new Error("Thiếu UID tài khoản.");
    const ref=doc(accessCollection,uid),memberRef=doc(memberDataCollection,uid),[old,configSnap]=await Promise.all([getDoc(ref),getDoc(configRef)]);
    if(!old.exists())throw new Error("Không tìm thấy tài khoản.");
    const oldData=old.data()||{},primaryUid=configSnap.exists()?configSnap.data()?.adminUid:null;
    if(uid===primaryUid&&user.uid!==primaryUid)throw new Error("Không thể thay đổi tài khoản trưởng phòng chính.");
    const normalizedMemberId=memberId||null,normalizedRole=uid===primaryUid?"admin":role==="admin"?"admin":"member",batch=writeBatch(db);
    batch.set(ref,{...oldData,memberId:normalizedMemberId,role:normalizedRole,displayName:String(displayName||oldData.displayName||"Thành viên").trim().slice(0,80)||"Thành viên",active:uid===primaryUid?true:!!active,updatedAt:serverTimestamp(),updatedBy:user.uid});
    if((oldData.memberId||null)!==normalizedMemberId){if(normalizedMemberId){const migrated=extractMemberData(optimisticShape,normalizedMemberId,{});batch.set(memberRef,{...migrated,updatedBy:user.uid,updatedAt:serverTimestamp()});}else batch.delete(memberRef);}
    await batch.commit();
    await writeAudit({action:"UPDATE_ACCESS",summary:`Cập nhật quyền ${displayName||oldData.displayName||oldData.email||uid}`,targetMemberId:normalizedMemberId});
  };
  const revokeAccess=async uid=>{
    if(!isAdmin())throw new Error("Chỉ trưởng phòng được khóa tài khoản.");if(uid===user.uid)throw new Error("Không thể tự khóa tài khoản đang dùng.");
    const ref=doc(accessCollection,uid),[old,configSnap]=await Promise.all([getDoc(ref),getDoc(configRef)]);if(!old.exists())return;
    if(configSnap.exists()&&configSnap.data()?.adminUid===uid)throw new Error("Không thể khóa tài khoản trưởng phòng chính.");
    await setDoc(ref,{active:false,updatedAt:serverTimestamp(),updatedBy:user.uid},{merge:true});
    await writeAudit({action:"REVOKE_ACCESS",summary:`Khóa quyền ${old.data().displayName||old.data().email||uid}`,targetMemberId:old.data().memberId||null});
  };

  const recordShape=async(nextShape,audit={})=>{
    if(!user||!hasAccess())throw new Error("Tài khoản chưa được cấp quyền.");
    const desired=clone(nextShape)||{};
    if(isAdmin()){
      const previous=clone(optimisticShape)||{},roomOperations=diffJson(previous,desired),memberChanges=mappedMemberChanges(desired,previous);
      const result=await runTransaction(db,async tx=>{
        const roomSnap=await tx.get(roomRef),memberSnaps=[];
        for(const change of memberChanges)memberSnaps.push(await tx.get(doc(memberDataCollection,change.mappedUid)));
        const serverPayload=roomSnap.exists()?clone(roomSnap.data()?.payload)||{}:{},mergedShape=applyJsonOperations(serverPayload,roomOperations),mergedMembers=[];
        memberChanges.forEach((change,index)=>{
          const snap=memberSnaps[index],current=snap.exists()?clone(snap.data())||{}:{},merged=applyJsonOperations(current,change.operations);
          merged.memberId=change.item.memberId;
          tx.set(doc(memberDataCollection,change.mappedUid),{...merged,updatedBy:user.uid,updatedAt:serverTimestamp()});
          mergedMembers.push([change.mappedUid,{...merged,memberId:change.item.memberId}]);
        });
        tx.set(roomRef,{schemaVersion:5,roomCode,revision:increment(1),payload:mergedShape,lastAdminUid:user.uid,lastDeviceId:deviceId,updatedAt:serverTimestamp()},{merge:true});
        return {mergedShape,mergedMembers};
      });
      remoteShape=clone(result.mergedShape)||{};for(const [mappedUid,data] of result.mergedMembers)memberDataByUid.set(mappedUid,clone(data));rebuild();
      if(audit?.summary||audit?.action)await writeAudit(audit);emitStatus("online","Đã đồng bộ");return true;
    }
    const memberId=access.memberId;if(!memberId)throw new Error("Tài khoản chưa liên kết với thành viên.");
    const shapeOperations=diffJson(optimisticShape,desired),forbidden=shapeOperations.find(op=>!memberAllowedOperation(op,memberId,optimisticShape,desired));
    if(forbidden)throw new Error("Bạn chỉ được chỉnh trạng thái và ngày ở của chính mình.");
    const previousOwn=extractMemberData(optimisticShape,memberId,memberDataByUid.get(user.uid)),desiredOwn=extractMemberData(desired,memberId,memberDataByUid.get(user.uid)),ownOperations=diffJson(previousOwn,desiredOwn),ownRef=doc(memberDataCollection,user.uid);
    const mergedOwn=await runTransaction(db,async tx=>{
      const snap=await tx.get(ownRef),current=snap.exists()?clone(snap.data())||{}:{memberId},merged=applyJsonOperations(current,ownOperations);merged.memberId=memberId;
      tx.set(ownRef,{...merged,updatedBy:user.uid,updatedAt:serverTimestamp()});return merged;
    });
    memberDataByUid.set(user.uid,clone(mergedOwn));rebuild();if(audit?.summary||audit?.action)await writeAudit(audit);emitStatus("online","Đã đồng bộ");return true;
  };

  const submitTask=async({scheduleId,weekStart,taskId,taskName,memberId})=>{
    if(!user||!hasAccess())throw new Error("Chưa có quyền truy cập.");if(isAdmin())throw new Error("Trưởng phòng dùng nút xác nhận trực tiếp.");if(memberId!==access.memberId)throw new Error("Bạn chỉ được báo công việc của mình.");
    const schedule=optimisticShape?.schedules?.[weekStart],assignment=(schedule?.assignments||[]).find(a=>a?.taskId===taskId&&a?.personId===memberId&&!a?.cut);
    if(!schedule||schedule.id!==scheduleId||!assignment)throw new Error("Công việc này không còn được phân cho bạn.");if(assignment.completed)throw new Error("Công việc đã được xác nhận hoàn thành.");
    const id=taskDocId(weekStart,taskId,memberId),ref=doc(taskCollection,id);
    await runTransaction(db,async tx=>{
      const old=await tx.get(ref);
      if(old.exists()){
        const oldStatus=old.data()?.status;if(oldStatus==="approved")throw new Error("Công việc đã được xác nhận.");if(oldStatus==="submitted")throw new Error("Công việc đang chờ trưởng phòng xác nhận.");
        tx.set(ref,{status:"submitted",submittedAt:serverTimestamp(),updatedAt:serverTimestamp()},{merge:true});
      }else tx.set(ref,{roomCode,actorUid:user.uid,actorName:access.displayName||user.displayName||user.email||"Thành viên",memberId,scheduleId,weekStart,taskId,taskName:assignment.task||taskName||taskId,status:"submitted",submittedAt:serverTimestamp(),updatedAt:serverTimestamp()});
    });
    await writeAudit({action:"SUBMIT_TASK",summary:`Báo hoàn thành: ${assignment.task||taskName||taskId}`,targetMemberId:memberId});return {id};
  };
  const reviewTask=async({submissionId,status,note=""})=>{
    if(!isAdmin())throw new Error("Chỉ trưởng phòng được xác nhận.");if(!["approved","rejected"].includes(status))throw new Error("Trạng thái không hợp lệ.");
    const ref=doc(taskCollection,submissionId),result=await runTransaction(db,async tx=>{
      const taskSnap=await tx.get(ref),roomSnap=await tx.get(roomRef);
      if(!taskSnap.exists())throw new Error("Không tìm thấy báo hoàn thành.");
      const task=taskSnap.data()||{};if(task.status!=="submitted")throw new Error("Báo hoàn thành này đã được xử lý.");if(!roomSnap.exists())throw new Error("Không tìm thấy dữ liệu phòng.");
      const payload=clone(roomSnap.data()?.payload)||{},schedule=payload?.schedules?.[task.weekStart];
      if(!schedule||schedule.id!==task.scheduleId)throw new Error("Lịch trực tương ứng không còn tồn tại.");
      const assignment=(schedule.assignments||[]).find(a=>a?.taskId===task.taskId&&a?.personId===task.memberId&&!a?.cut);
      if(!assignment)throw new Error("Phân công đã thay đổi; không thể xác nhận báo cáo cũ.");
      assignment.completed=status==="approved";schedule.updatedAt=new Date().toISOString();
      tx.set(ref,{...task,status,reviewNote:String(note||"").slice(0,300),reviewedBy:user.uid,reviewedAt:serverTimestamp(),updatedAt:serverTimestamp()});
      tx.set(roomRef,{schemaVersion:5,roomCode,revision:increment(1),payload,lastAdminUid:user.uid,lastDeviceId:deviceId,updatedAt:serverTimestamp()},{merge:true});
      return {payload,task};
    });
    remoteShape=clone(result.payload)||remoteShape;rebuild();
    await writeAudit({action:status==="approved"?"VERIFY_TASK":"REJECT_TASK",summary:`${status==="approved"?"Xác nhận":"Yêu cầu làm lại"}: ${result.task.taskName||"công việc"}`,targetMemberId:result.task.memberId||null});return true;
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
  const deleteTaskSubmissionsForWeek=async weekStart=>{
    if(!isAdmin())throw new Error("Chỉ trưởng phòng được dọn báo công việc.");if(!weekStart)return 0;
    const snap=await getDocs(query(taskCollection,where("weekStart","==",weekStart)));return commitDeletes(snap.docs);
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
      let merged=base;if(memberSnap.exists()&&targetMemberId){const one=new Map([[targetUid,{uid:targetUid,...memberSnap.data(),memberId:targetMemberId}]]);merged=overlayMemberData(base,one);}
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
  const forceSync=async()=>{
    if(!user||!hasAccess())return false;
    try{const snap=await getDoc(roomRef);if(snap.exists()){remoteShape=clone(snap.data()?.payload)||{};rebuild();}emitStatus("online","Đã đồng bộ");return true;}
    catch(e){emitStatus("offline","Không thể đồng bộ",{error:e});return false;}
  };
  const flush=forceSync,stop=()=>{authUnsub?.();clearUserListeners();};
  return {start,stop,signInGoogle,signOut,claimAdmin,requestAccess,cancelAccessRequest,approveRequest,updateAccess,revokeAccess,recordShape,submitTask,reviewTask,reconcileTaskSubmissions,deleteTaskSubmissionsForWeek,deleteAccountFromRoom,cleanupAuditLogs,forceSync,flush};
}
