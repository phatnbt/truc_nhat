import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import {
  initializeAuth, getAuth, GoogleAuthProvider, browserLocalPersistence, indexedDBLocalPersistence,
  browserSessionPersistence, inMemoryPersistence, browserPopupRedirectResolver,
  onAuthStateChanged, signInWithPopup, signInWithRedirect, getRedirectResult,
  signOut as firebaseSignOut, connectAuthEmulator
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
  initializeFirestore, getFirestore, memoryLocalCache, connectFirestoreEmulator,
  doc, collection, query, where, orderBy, limit, onSnapshot, runTransaction, serverTimestamp, FieldPath,
  setDoc, deleteDoc, getDoc, getDocFromServer, getDocs, writeBatch, Timestamp, increment
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { assertBillingPeriodUpdate, periodDateKeys, daysInMonthKey } from "./billing-cycle-period.js?v=20261127-12";
import {authEnvironment,signInMethod,sessionStorageAvailable} from "./mobile-auth-policy.js?v=20261127-12";

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
  const supportsRedirect=useEmulators||location.host===firebaseConfig.authDomain;
  const diagnostic=(key,value)=>globalThis.P708Debug?.(key,value);
  const appName="p708-secure-manager-v5";
  const appExists=getApps().some(x=>x.name===appName);
  const app=appExists?getApp(appName):initializeApp(firebaseConfig,appName);
  let db;
  try{db=initializeFirestore(app,{localCache:memoryLocalCache()});}
  catch{db=getFirestore(app);}
  const auth=appExists?getAuth(app):initializeAuth(app,{
    persistence:[browserLocalPersistence,indexedDBLocalPersistence,browserSessionPersistence,inMemoryPersistence],
    ...(supportsRedirect?{popupRedirectResolver:browserPopupRedirectResolver}:{})
  }),provider=new GoogleAuthProvider();
  if(useEmulators&&!appExists){
    connectAuthEmulator(auth,"http://127.0.0.1:9099",{disableWarnings:true});
    connectFirestoreEmulator(db,"127.0.0.1",8080);
  }
  provider.setCustomParameters({prompt:"select_account"});
  diagnostic("firebase","initialized");
  diagnostic("sdk","12.16.0");
  diagnostic("persistence","firebase-managed-fallback");
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
  let authRestoring=true,signingIn=false,authError="",roomError="",accessError="",denied=false,waitingTimer,waitingFor="",generation=0,dataGeneration=0;
  const emitStatus=(mode,text,extra={})=>onStatus?.({mode,text,online:navigator.onLine,...extra});
  const sessionStatus=()=>{
    if(authRestoring)return "restoring";
    if(!user)return signingIn?"signingIn":"signedOut";
    if(denied)return "denied";
    if(accessError||roomError)return "error";
    if(!accessReady||(!hasAccess()&&!requestReady))return "checking";
    if(!hasAccess())return ownRequest?"pending":"needsAccess";
    if(!roomReady||!memberDataReady)return "loadingRoom";
    return "active";
  };
  const emitSession=()=>{
    const status=sessionStatus();
    diagnostic("auth",status);
    if(authError)diagnostic("authError",authError);
    const waiting=status==="checking"||status==="loadingRoom"?status:"";
    if(waitingFor!==waiting){
      clearTimeout(waitingTimer);
      waitingFor=waiting;
      if(waiting)waitingTimer=setTimeout(()=>{
        if(sessionStatus()!==waiting)return;
        if(waiting==="checking")accessError="slow";
        else roomError="slow";
        emitSession();
      },12000);
    }
    onSession?.({
      user:user?{uid:user.uid,email:user.email||"",displayName:user.displayName||"",photoURL:user.photoURL||""}:null,
      access:clone(access),request:clone(ownRequest),status,authError,roomError,accessError,offline:!navigator.onLine
    });
  };
  const emitAdminData=(requests=null,accesses=null,logs=null)=>onAdminData?.({requests:requests??undefined,accesses:accesses??undefined,logs:logs??undefined});
  const rebuild=()=>{
    if(!hasAccess()||!roomReady||!memberDataReady)return;
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
    dataGeneration++;
    roomUnsub?.();memberDataUnsub?.();adminAccessUnsub?.();adminRequestsUnsub?.();auditUnsub?.();taskUnsub?.();swapUnsub?.();
    roomUnsub=memberDataUnsub=adminAccessUnsub=adminRequestsUnsub=auditUnsub=taskUnsub=swapUnsub=null;
    memberDataByUid=new Map();accessByUid=new Map();memberDataReady=false;
    remoteShape={};optimisticShape={};roomReady=false;remoteRevision=0;pendingRoomWrite=false;
    diagnostic("listener","stopped");
  };
  const dataListener=callback=>{
    const epoch=dataGeneration;
    return value=>{if(epoch===dataGeneration)callback(value);};
  };
  const startAdminListeners=()=>{
    adminAccessUnsub?.();adminRequestsUnsub?.();auditUnsub?.();
    adminAccessUnsub=onSnapshot(accessCollection,dataListener(snap=>{
      accessByUid=new Map(snap.docs.map(d=>[d.id,{uid:d.id,...d.data()}]));
      emitAdminData(null,[...accessByUid.values()],null);
    }),dataListener(()=>emitStatus("offline","Không tải được danh sách quyền")));
    adminRequestsUnsub=onSnapshot(requestCollection,dataListener(snap=>emitAdminData(snap.docs.map(d=>({uid:d.id,...d.data()})),null,null)),dataListener(()=>emitStatus("offline","Không tải được yêu cầu tham gia")));
    auditUnsub=onSnapshot(query(auditCollection,orderBy("createdAt","desc"),limit(200)),dataListener(snap=>emitAdminData(null,null,snap.docs.map(d=>({id:d.id,...d.data()})))),dataListener(()=>emitStatus("offline","Không tải được nhật ký")));
  };
  const startTaskListener=()=>{
    taskUnsub?.();
    const source=isAdmin()?query(taskCollection,orderBy("updatedAt","desc"),limit(200)):query(taskCollection,where("actorUid","==",user.uid));
    taskUnsub=onSnapshot(source,{includeMetadataChanges:true},dataListener(snap=>{
      if(snap.metadata.fromCache||snap.metadata.hasPendingWrites)return;
      onTaskData?.(snap.docs.map(d=>({id:d.id,...d.data()})));
    }),dataListener(()=>emitStatus("offline","Không tải được trạng thái công việc")));
    const swaps=isAdmin()?query(swapCollection,orderBy("updatedAt","desc"),limit(100)):query(swapCollection,where("actorUid","==",user.uid),limit(100));
    swapUnsub=onSnapshot(swaps,dataListener(snap=>onSwapData?.(snap.docs.map(d=>({id:d.id,...d.data()})))),dataListener(()=>emitStatus("offline","Không tải được yêu cầu đổi việc")));
  };
  const startRoomListeners=()=>{
    stopDataListeners();
    const epoch=dataGeneration;
    const stillCurrent=()=>epoch===dataGeneration&&hasAccess();
    const onRoomError=error=>{
      if(!stillCurrent())return;
      roomError=error?.code||"room";
      diagnostic("firestoreError",roomError);
      diagnostic("listener","error");
      emitSession();emitStatus("offline","Không thể đọc dữ liệu phòng");
    };
    diagnostic("listener","connecting");
    roomUnsub=onSnapshot(roomRef,{includeMetadataChanges:true},snap=>{
      if(!stillCurrent())return;
      pendingRoomWrite=snap.metadata.hasPendingWrites;
      diagnostic("pendingWrites",pendingRoomWrite||activeWrites>0);
      diagnostic("snapshot",pendingRoomWrite?"pending":snap.metadata.fromCache?"cache":"server");
      if(pendingRoomWrite)return;
      if(snap.metadata.fromCache){
        emitStatus(navigator.onLine?"syncing":"offline","Chưa xác nhận dữ liệu với máy chủ");
        return;
      }
      if(!snap.exists()){onRoomError({code:"room-not-found"});return;}
      if(!isAdmin()&&!snap.data()?.payload?.members?.[access.memberId]){
        onRoomError({code:"invalid-member"});return;
      }
      roomError="";
      acceptRoomShape(snap.data()?.payload,Number(snap.data()?.revision)||0);
      diagnostic("listener","active");
      diagnostic("lastSync",Date.now());
      emitSession();
      emitStatus(navigator.onLine?"online":"offline",navigator.onLine?"Đã đồng bộ":"Đang dùng dữ liệu ngoại tuyến");
    },onRoomError);
    if(isAdmin()){
      memberDataUnsub=onSnapshot(memberDataCollection,{includeMetadataChanges:true},snap=>{
        if(!stillCurrent()||snap.metadata.fromCache||snap.metadata.hasPendingWrites)return;
        memberDataByUid=new Map(snap.docs.map(d=>[d.id,{uid:d.id,...d.data()}]));memberDataReady=true;
        if(roomError==="slow"&&roomReady)roomError="";
        rebuild();emitSession();
      },onRoomError);
    }else{
      memberDataUnsub=onSnapshot(doc(memberDataCollection,user.uid),{includeMetadataChanges:true},snap=>{
        if(!stillCurrent()||snap.metadata.fromCache||snap.metadata.hasPendingWrites)return;
        memberDataByUid=snap.exists()?new Map([[snap.id,{uid:snap.id,...snap.data()}]]):new Map();memberDataReady=true;
        if(roomError==="slow"&&roomReady)roomError="";
        rebuild();emitSession();
      },onRoomError);
    }
    startTaskListener();if(isAdmin())startAdminListeners();
  };
  const handleAccessChange=next=>{
    const previous=access;
    denied=!!next&&(!next.active||!["admin","member"].includes(next.role)||(next.role==="member"&&!next.memberId));
    access=next?.active&&!denied?next:null;
    if(!access)stopDataListeners();
    else if(!roomUnsub||previous?.role!==access.role||previous?.memberId!==access.memberId)startRoomListeners();
    emitSession();
  };
  const attachUserListeners=()=>{
    accessUnsub?.();requestUnsub?.();
    const epoch=generation;
    accessUnsub=onSnapshot(doc(accessCollection,user.uid),{includeMetadataChanges:true},s=>{
      if(epoch!==generation||s.metadata.fromCache)return;
      accessError="";
      accessReady=true;
      handleAccessChange(s.exists()?{uid:s.id,...s.data()}:null);
    },e=>{if(epoch!==generation)return;stopDataListeners();access=null;accessError=e?.code||"access";diagnostic("firestoreError",accessError);emitSession();});
    requestUnsub=onSnapshot(doc(requestCollection,user.uid),{includeMetadataChanges:true},s=>{
      if(epoch!==generation||s.metadata.fromCache)return;
      if(accessReady&&accessError==="slow")accessError="";
      requestReady=true;ownRequest=s.exists()?{uid:s.id,...s.data()}:null;emitSession();
    },e=>{if(epoch===generation&&!hasAccess()){accessError=e?.code||"access";emitSession();}});
  };
  const clearUserListeners=()=>{
    generation++;
    accessUnsub?.();requestUnsub?.();accessUnsub=requestUnsub=null;
    stopDataListeners();access=null;ownRequest=null;
    accessReady=false;requestReady=false;restoreInFlight=null;
    denied=false;accessError="";roomError="";
  };
  const retryAccess=()=>{
    if(!user)return;
    clearUserListeners();emitSession();attachUserListeners();
  };
  let wasHidden=false,lastRecoveryAt=0,activeWrites=0,pendingRoomWrite=false;
  const trackWrite=operation=>async(...args)=>{
    activeWrites++;
    diagnostic("pendingWrites",true);
    try{return await operation(...args);}
    catch(error){diagnostic("firestoreError",error?.code||"write-rejected");throw error;}
    finally{activeWrites--;diagnostic("pendingWrites",activeWrites>0||pendingRoomWrite);}
  };
  const resume=()=>{
    if(!navigator.onLine||!user)return;
    const now=Date.now();
    if(now-lastRecoveryAt<750)return;
    lastRecoveryAt=now;
    if(accessError||roomError){retryAccess();return;}
    if(!hasAccess()||!roomReady)return;
    emitStatus("syncing","Đang xác nhận dữ liệu với máy chủ…");
    void forceSync();
  };
  const onlineHandler=()=>{emitStatus("syncing","Đang kết nối lại…");lastRecoveryAt=0;resume();emitSession();};
  const offlineHandler=()=>{emitStatus("offline","Đang ngoại tuyến");emitSession();};
  const pageHideHandler=()=>{wasHidden=true;};
  const visibilityHandler=()=>{
    if(document.visibilityState==="hidden"){wasHidden=true;return;}
    if(wasHidden){wasHidden=false;resume();}
  };
  const pageShowHandler=event=>{
    if(event.persisted&&signingIn&&!user){signingIn=false;authError="auth/cancelled-popup-request";emitSession();}
    if(event.persisted||wasHidden){wasHidden=false;resume();}
  };

  const start=async()=>{
    if(started)return;started=true;emitStatus("syncing","Đang khởi động bảo mật…");
    authRestoring=true;emitSession();
    window.addEventListener("online",onlineHandler);window.addEventListener("offline",offlineHandler);
    window.addEventListener("pageshow",pageShowHandler);
    window.addEventListener("pagehide",pageHideHandler);
    document.addEventListener("visibilitychange",visibilityHandler);
    const redirect=supportsRedirect&&sessionStorageAvailable()
      ?getRedirectResult(auth,browserPopupRedirectResolver).catch(error=>{authError=error?.code||"redirect";})
      :Promise.resolve(null);
    diagnostic("authFlow",supportsRedirect?"restore-same-origin":"restore-popup-context");
    await Promise.all([auth.authStateReady(),redirect]);
    if(!started)return;
    authRestoring=false;
    authUnsub=onAuthStateChanged(auth,next=>{
      clearUserListeners();user=next;signingIn=false;
      if(user)authError="";
      emitSession();
      if(!user){emitStatus("offline","Chưa đăng nhập");return;}
      emitStatus("syncing","Đang kiểm tra quyền…");attachUserListeners();
    });
  };
  const environment=()=>authEnvironment({
    userAgent:navigator.userAgent,platform:navigator.platform,maxTouchPoints:navigator.maxTouchPoints,
    standalone:window.matchMedia("(display-mode: standalone)").matches||navigator.standalone===true
  });
  const signInGoogle=async()=>{
    if(signingIn||authRestoring||user)return;
    if(!navigator.onLine){authError="auth/network-request-failed";emitSession();return;}
    const environmentInfo=environment();
    const canRedirect=supportsRedirect&&sessionStorageAvailable();
    const method=signInMethod({...environmentInfo,sameOrigin:supportsRedirect,sessionStorage:canRedirect});
    if(method==="unavailable"){authError="auth/operation-not-supported-in-this-environment";emitSession();return;}
    const redirect=()=>signInWithRedirect(auth,provider,browserPopupRedirectResolver);
    signingIn=true;authError="";emitSession();
    diagnostic("authFlow",method);
    try{
      if(method==="redirect")await redirect();
      else{
        try{await signInWithPopup(auth,provider,browserPopupRedirectResolver);}
        catch(error){if(error?.code!=="auth/popup-blocked"||!canRedirect)throw error;await redirect();}
      }
    }catch(error){authError=error?.code||"unknown";}
    finally{
      signingIn=false;
      emitSession();
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
  const dismissAccessRequest=async(uid,expectedRequestedAt)=>{
    if(!isAdmin())throw new Error("Chỉ trưởng phòng được xóa yêu cầu.");
    if(!navigator.onLine)throw new Error("Đang ngoại tuyến.");
    const actor=user.uid,epoch=dataGeneration,ref=doc(requestCollection,uid);
    await runTransaction(db,async tx=>{
      const request=await tx.get(ref),data=request.data();
      if(user?.uid!==actor||epoch!==dataGeneration||!isAdmin())throw new Error("Phiên hoặc quyền truy cập đã thay đổi.");
      if(!data)return;
      if(data.status!=="pending"||data.requestedAt?.seconds!==expectedRequestedAt?.seconds||
        data.requestedAt?.nanoseconds!==expectedRequestedAt?.nanoseconds)
        throw new Error("Yêu cầu đã thay đổi. Hãy kiểm tra lại.");
      tx.delete(ref);
      await writeAudit({action:"DISMISS_ACCESS_REQUEST",summary:`Xóa yêu cầu tham gia của ${data.displayName||"thành viên"}`},tx);
    });
  };

  const approveRequest=async({uid,memberId,role="member",displayName=""})=>{
    if(!isAdmin())throw new Error("Chỉ trưởng phòng được duyệt.");if(!uid)throw new Error("Thiếu UID tài khoản.");
    const reqRef=doc(requestCollection,uid),accessRef=doc(accessCollection,uid),memberRef=doc(memberDataCollection,uid);
    const normalizedRole=role==="admin"?"admin":"member",normalizedMemberId=memberId||null,actor=user.uid,epoch=dataGeneration;
    const initialMemberData=await runTransaction(db,async tx=>{
      const req=await tx.get(reqRef),room=await tx.get(roomRef);
      if(user?.uid!==actor||epoch!==dataGeneration||!isAdmin())throw new Error("Phiên hoặc quyền truy cập đã thay đổi.");
      const data=req.data(),payload=room.data()?.payload;
      if(!data||data.status!=="pending")throw new Error("Yêu cầu tham gia không còn tồn tại.");
      if(normalizedMemberId&&!payload?.members?.[normalizedMemberId])throw new Error("Thành viên đã rời danh sách phòng.");
      const memberData=normalizedMemberId?extractMemberData(payload,normalizedMemberId,{}):null;
      tx.set(accessRef,{email:data.email||"",displayName:String(displayName||data.displayName||"Thành viên").trim().slice(0,80)||"Thành viên",role:normalizedRole,memberId:normalizedMemberId,active:true,approvedBy:actor,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
      tx.delete(reqRef);
      if(memberData)tx.set(memberRef,{...memberData,updatedBy:actor,updatedAt:serverTimestamp()});else tx.delete(memberRef);
      await writeAudit({action:"APPROVE_ACCESS",summary:`Duyệt quyền cho ${displayName||data.displayName||data.email||uid}`,targetMemberId:normalizedMemberId},tx);
      return memberData;
    });
    if(user?.uid!==actor||epoch!==dataGeneration||!isAdmin())return;
    if(initialMemberData)memberDataByUid.set(uid,{uid,...clone(initialMemberData)});else memberDataByUid.delete(uid);rebuild();
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
    const actor=user.uid,epoch=dataGeneration,id=taskDocId(weekStart,taskId,memberId),ref=doc(taskCollection,id);
    if(!["in_progress","submitted"].includes(status))throw new Error("Trạng thái không hợp lệ.");
    const completion=status==="submitted"?{checks}:{};
    await runTransaction(db,async tx=>{
      const room=await tx.get(roomRef),old=await tx.get(ref);
      if(user?.uid!==actor||epoch!==dataGeneration||access?.memberId!==memberId)throw new Error("Tài khoản hoặc phân công đã thay đổi.");
      const payload=room.data()?.payload,schedule=payload?.schedules?.[weekStart];
      const assignment=schedule?.assignments?.find(a=>a.taskId===taskId&&a.personId===memberId&&!a.cut);
      if(schedule?.id!==scheduleId||!assignment||payload?._sync?.deletedSchedules?.[weekStart])
        throw new Error("Công việc này không còn được phân cho bạn.");
      if(assignment.completed)throw new Error("Công việc đã được xác nhận hoàn thành.");
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
  const reviewTask=async({submissionId,status,note="",expectedSubmittedAt})=>{
    if(!isAdmin())throw new Error("Chỉ trưởng phòng được xác nhận.");if(!navigator.onLine)throw new Error("Đang ngoại tuyến.");if(!["approved","rejected"].includes(status))throw new Error("Trạng thái không hợp lệ.");
    if(!expectedSubmittedAt||!Number.isInteger(expectedSubmittedAt.seconds)||!Number.isInteger(expectedSubmittedAt.nanoseconds))
      throw new Error("Chưa có phiên bản báo cáo đã đồng bộ. Hãy thử lại.");
    const actor=user.uid,epoch=dataGeneration,ref=doc(taskCollection,submissionId),result=await runTransaction(db,async tx=>{
      const taskSnap=await tx.get(ref),roomSnap=await tx.get(roomRef);
      if(!taskSnap.exists())throw new Error("Không tìm thấy báo hoàn thành.");
      if(user?.uid!==actor||epoch!==dataGeneration||!isAdmin())throw new Error("Phiên hoặc quyền truy cập đã thay đổi.");
      const task=taskSnap.data()||{};
      if(task.submittedAt?.seconds!==expectedSubmittedAt.seconds||task.submittedAt?.nanoseconds!==expectedSubmittedAt.nanoseconds)
        throw new Error("Thành viên đã gửi báo cáo mới. Hãy kiểm tra lại trước khi duyệt.");
      if(task.status===status)return null;if(task.status!=="submitted")throw new Error("Báo hoàn thành này đã được xử lý.");if(!roomSnap.exists())throw new Error("Không tìm thấy dữ liệu phòng.");
      const payload=clone(roomSnap.data()?.payload)||{},schedule=payload?.schedules?.[task.weekStart];
      if(!schedule||schedule.id!==task.scheduleId||payload._sync?.deletedSchedules?.[task.weekStart])throw new Error("Lịch trực tương ứng không còn tồn tại.");
      const assignment=(schedule.assignments||[]).find(a=>a?.taskId===task.taskId&&a?.personId===task.memberId&&!a?.cut);
      if(!assignment||assignment.completed)throw new Error("Phân công hoặc trạng thái đã thay đổi; hãy kiểm tra lại lịch.");
      if(status==="approved"){assignment.completed=true;delete assignment.needsRedo;schedule.updatedAt=new Date().toISOString();}
      tx.set(ref,{...task,status,reviewNote:String(note||"").slice(0,300),reviewedBy:user.uid,reviewedAt:serverTimestamp(),updatedAt:serverTimestamp()});
      if(status==="approved")tx.update(roomRef,new FieldPath("payload","schedules",task.weekStart),schedule,
        "revision",increment(1),"lastAdminUid",actor,"lastDeviceId",deviceId,"updatedAt",serverTimestamp());
      await writeAudit({action:status==="approved"?"VERIFY_TASK":"REJECT_TASK",summary:`${status==="approved"?"Xác nhận":"Yêu cầu làm lại"}: ${task.taskName||"công việc"}`,targetMemberId:task.memberId||null},tx);
      return status==="approved"?{payload,revision:(Number(roomSnap.data()?.revision)||0)+1}:null;
    });
    if(!result||user?.uid!==actor||epoch!==dataGeneration||!isAdmin())return true;
    acceptRoomShape(result.payload,result.revision);
    return true;
  };
  const completeTask=async({weekStart,scheduleId,taskId,memberId})=>{
    if(!isAdmin()||!navigator.onLine)throw new Error("Chỉ trưởng phòng đang kết nối mới được đánh dấu hoàn thành.");
    const actor=user.uid,epoch=dataGeneration;
    const result=await runTransaction(db,async tx=>{
      const room=await tx.get(roomRef),payload=clone(room.data()?.payload),schedule=payload?.schedules?.[weekStart];
      const assignment=schedule?.assignments?.find(item=>item.taskId===taskId&&item.personId===memberId&&!item.cut);
      if(schedule?.id!==scheduleId||!assignment||payload?._sync?.deletedSchedules?.[weekStart])throw new Error("Phân công vừa thay đổi. Hãy kiểm tra lại.");
      if(assignment.completed)return null;
      const report=await tx.get(doc(taskCollection,taskDocId(weekStart,taskId,memberId)));
      if(user?.uid!==actor||epoch!==dataGeneration||!isAdmin())throw new Error("Phiên hoặc quyền truy cập đã thay đổi.");
      if(report.data()?.scheduleId===scheduleId&&report.data()?.status==="submitted")
        throw new Error("Thành viên đang chờ xác nhận. Hãy dùng Xác nhận hoặc Làm lại.");
      assignment.completed=true;delete assignment.needsRedo;schedule.updatedAt=new Date().toISOString();
      tx.update(roomRef,new FieldPath("payload","schedules",weekStart),schedule,
        "revision",increment(1),"lastAdminUid",actor,"lastDeviceId",deviceId,"updatedAt",serverTimestamp());
      await writeAudit({action:"UPDATE_TASK",summary:`${assignment.task||taskId}: Đã xong`,targetMemberId:memberId},tx);
      return {payload,revision:(Number(room.data()?.revision)||0)+1};
    });
    if(result&&user?.uid===actor&&epoch===dataGeneration&&isAdmin())acceptRoomShape(result.payload,result.revision);
    return true;
  };
  const reopenTask=async({weekStart,scheduleId,taskId,memberId,expectedScheduleUpdatedAt})=>{
    if(!isAdmin()||!navigator.onLine)throw new Error("Chỉ trưởng phòng đang kết nối mới được yêu cầu làm lại.");
    const actor=user.uid,epoch=dataGeneration,ref=doc(taskCollection,taskDocId(weekStart,taskId,memberId));
    const result=await runTransaction(db,async tx=>{
      const room=await tx.get(roomRef),report=await tx.get(ref);
      if(user?.uid!==actor||epoch!==dataGeneration||!isAdmin())throw new Error("Phiên hoặc quyền truy cập đã thay đổi.");
      const payload=clone(room.data()?.payload),schedule=payload?.schedules?.[weekStart];
      const assignment=schedule?.assignments?.find(item=>item.taskId===taskId&&item.personId===memberId&&!item.cut);
      if(schedule?.id!==scheduleId||!assignment||payload?._sync?.deletedSchedules?.[weekStart])
        throw new Error("Phân công vừa thay đổi. Hãy kiểm tra lại.");
      if(!assignment.completed&&assignment.needsRedo)return null;
      const latest=schedule.updatedAt||schedule.createdAt;
      if(!assignment.completed||latest&&latest!==expectedScheduleUpdatedAt)
        throw new Error("Lịch trực vừa thay đổi. Hãy thử lại trên trạng thái mới.");
      const task=report.data();
      if(task?.scheduleId===scheduleId&&task.status==="approved"){
        tx.update(ref,{status:"rejected",reviewNote:"Hoàn tác xác nhận và yêu cầu làm lại",reviewedBy:actor,
          reviewedAt:serverTimestamp(),updatedAt:serverTimestamp()});
      }
      assignment.completed=false;
      assignment.needsRedo=true;
      schedule.updatedAt=new Date().toISOString();
      tx.update(roomRef,new FieldPath("payload","schedules",weekStart),schedule,
        "revision",increment(1),"lastAdminUid",actor,"lastDeviceId",deviceId,"updatedAt",serverTimestamp());
      await writeAudit({action:"REJECT_TASK",summary:`Hoàn tác xác nhận và yêu cầu làm lại: ${assignment.task||taskId}`,targetMemberId:memberId},tx);
      return {payload,revision:(Number(room.data()?.revision)||0)+1};
    });
    if(result&&user?.uid===actor&&epoch===dataGeneration&&isAdmin())acceptRoomShape(result.payload,result.revision);
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
  const reconcileTaskSubmissions=async({weekStart,scheduleId})=>{
    if(!isAdmin())throw new Error("Chỉ trưởng phòng được đồng bộ báo công việc.");if(!weekStart)return 0;
    const actor=user.uid,epoch=dataGeneration;
    const snap=await getDocs(query(taskCollection,where("weekStart","==",weekStart)));
    let deleted=0;
    for(const candidate of snap.docs){
      const removed=await runTransaction(db,async tx=>{
        const room=await tx.get(roomRef),report=await tx.get(candidate.ref);
        if(user?.uid!==actor||epoch!==dataGeneration||!isAdmin())throw new Error("Phiên hoặc quyền truy cập đã thay đổi.");
        const task=report.data();
        if(!room.exists()||!task||task.weekStart!==weekStart||(scheduleId&&task.scheduleId!==scheduleId))return false;
        const current=room.data()?.payload?.schedules?.[weekStart];
        const matches=current&&(task.scheduleId===current.id||!task.scheduleId)&&current.assignments?.some(
          assignment=>!assignment.cut&&assignment.taskId===task.taskId&&assignment.personId===task.memberId);
        if(matches)return false;
        tx.delete(report.ref);
        return true;
      });
      if(removed)deleted++;
    }
    return deleted;
  };
  const deleteTaskSubmissionsForWeek=(weekStart,scheduleId)=>scheduleId?reconcileTaskSubmissions({weekStart,scheduleId}):Promise.resolve(0);
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
    const actor=user.uid,epoch=dataGeneration;
    const pending=getDocFromServer(roomRef).then(snap=>{
      if(user?.uid!==actor||epoch!==dataGeneration||!hasAccess())return false;
      if(snap.metadata.hasPendingWrites||snap.metadata.fromCache)return false;
      if(!snap.exists()||(!isAdmin()&&!snap.data()?.payload?.members?.[access.memberId]))return false;
      acceptRoomShape(snap.data()?.payload,Number(snap.data()?.revision)||0);
      diagnostic("lastSync",Date.now());
      diagnostic("snapshot","server");
      if(navigator.onLine)emitStatus("online","Đã đồng bộ");
      return true;
    }).catch(e=>{
      if(user?.uid===actor&&epoch===dataGeneration){
        diagnostic("firestoreError",e?.code||"server-read");
        emitStatus("offline","Không thể đồng bộ");
      }
      return false;
    }).finally(()=>{if(restoreInFlight===pending)restoreInFlight=null;});
    restoreInFlight=pending;
    return pending;
  };
  const flush=forceSync;
  const stop=()=>{
    authUnsub?.();clearUserListeners();clearTimeout(waitingTimer);waitingFor="";
    window.removeEventListener("online",onlineHandler);window.removeEventListener("offline",offlineHandler);
    window.removeEventListener("pageshow",pageShowHandler);
    window.removeEventListener("pagehide",pageHideHandler);
    document.removeEventListener("visibilitychange",visibilityHandler);
    started=false;
  };
  const writes={requestAccess,cancelAccessRequest,dismissAccessRequest,approveRequest,updateAccess,revokeAccess,recordShape,
    saveBillingDays,submitTask,reviewTask,completeTask,reopenTask,requestTaskSwap,reviewTaskSwap,reconcileTaskSubmissions,
    deleteTaskSubmissionsForWeek,deleteAccountFromRoom,cleanupAuditLogs};
  for(const key of Object.keys(writes))writes[key]=trackWrite(writes[key]);
  return {start,stop,signInGoogle,signOut,retryAccess,environment,forceSync,flush,...writes,
    hasPendingWork:()=>authRestoring||signingIn||activeWrites>0||pendingRoomWrite};
}
