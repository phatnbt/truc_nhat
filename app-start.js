async function requestNotifications(){if(!("Notification" in window))return toast("Trình duyệt này không hỗ trợ thông báo");const permission=await Notification.requestPermission();toast(permission==="granted"?"Đã bật nhắc việc khi mở ứng dụng":"Bạn chưa cho phép thông báo");if(permission==="granted")scheduleReminderNotifications(true);}
function notificationKey(title){return `P708_NOTIFY_${new Date().toISOString().slice(0,10)}_${title}`;}
async function showNotification(title,body){const key=notificationKey(title);if(storageGet(key))return;storageSet(key,"1");try{const reg=await navigator.serviceWorker?.ready;if(reg?.showNotification)await reg.showNotification(title,{body,icon:"./icons/icon-192.png",badge:"./icons/icon-32.png",tag:key});else new Notification(title,{body});}catch{}}
function scheduleReminderNotifications(force=false){if(!("Notification" in window))return;if(!force&&Notification.permission!=="granted")return;if(authSession.status!=="active")return;const s=currentSchedule(),myId=myMemberId();if(myId&&s){s.assignments.filter(a=>a.personId===myId&&!a.cut&&!a.completed).forEach(a=>{const sub=submissionFor(s,a);if(sub?.status!=="submitted")void showNotification(`P708 · ${a.task}`,"Bạn có công việc trực chưa báo hoàn thành.");});}const c=billCalc(),mine=c.people.find(p=>p.memberId===myId);if(mine&&c.b.closed&&!isBillPaid(mine,c.due[mine.id]||0)&&(c.due[mine.id]||0)>0)void showNotification("P708 · Tiền điện nước",`Bạn chưa được ghi nhận thanh toán ${money(c.due[mine.id])}.`);if(isAdmin()&&accessRequests.length)void showNotification("P708 · Yêu cầu tham gia",`Có ${accessRequests.length} tài khoản đang chờ duyệt.`);if(isAdmin()){const count=taskSubmissions.filter(x=>x.status==="submitted").length;if(count)void showNotification("P708 · Công việc chờ xác nhận",`Có ${count} công việc thành viên đã báo hoàn thành.`);}}

async function startCloud(){
  realtimeEngine=createP708SecureEngine({firebaseConfig:FIREBASE_CONFIG,roomCode:ROOM_CODE,deviceId:DEVICE_ID,initialShape:toSyncShape(state),
    onShape:(shape)=>{state=fromSyncShape(shape);if(ui.selectedScheduleId&&!state.schedules.some(s=>s.id===ui.selectedScheduleId))ui.selectedScheduleId=null;const bill=currentBill();if(ui.activeBillPersonId&&!bill?.people?.some(p=>p.id===ui.activeBillPersonId))ui.activeBillPersonId=bill?.people?.[0]?.id||null;renderAll();},
    onStatus:status=>{syncStatus={mode:status.mode||"online",text:status.text||"Đã đồng bộ"};renderSync();},
    onSession:session=>{authSession={...authSession,...session};renderAuthGate();renderAll();},
    onAdminData:data=>{if(data.requests!==undefined)accessRequests=data.requests;if(data.accesses!==undefined)accessAccounts=data.accesses;if(data.logs!==undefined)auditLogs=data.logs;renderAll();},
    onTaskData:data=>{taskSubmissions=data||[];renderAll();}
  });
  try{await realtimeEngine.start();}catch(e){authSession={...authSession,status:"error"};syncStatus={mode:"offline",text:e?.message||"Không thể kết nối"};renderAuthGate();renderSync();toast(e?.message||"Không thể khởi động ứng dụng",6000);}
}

function bindStaticEvents(){
  $$('[data-go]').forEach(btn=>btn.addEventListener("click",()=>showPage(btn.dataset.go)));
  $$('[data-close]').forEach(btn=>btn.addEventListener("click",()=>closeModal(btn.dataset.close)));
  $$(".modal").forEach(modal=>modal.addEventListener("click",e=>{if(e.target===modal)closeModal(modal.id);}));
  $("#accountButton").addEventListener("click",()=>{renderAccessModal();openModal("accessModal");});$("#signOutButton").addEventListener("click",secureSignOut);
  $("#notificationButton").addEventListener("click",requestNotifications);$("#refreshReminderButton").addEventListener("click",()=>{renderHome();scheduleReminderNotifications(true);toast("Đã làm mới nhắc việc");});
  ["#homeSyncButton","#cleanSyncButton","#billSyncButton","#auditSyncButton"].forEach(id=>$(id)?.addEventListener("click",forceSync));
  $("#addMemberButton").addEventListener("click",addMember);$("#cleanMemberName").addEventListener("keydown",e=>{if(e.key==="Enter")addMember();});$("#allPresentButton").addEventListener("click",setAllPresent);$("#createScheduleButton").addEventListener("click",createSchedule);$("#deleteScheduleButton").addEventListener("click",deleteSchedule);$("#manualScheduleButton").addEventListener("click",openManual);$("#saveManualScheduleButton").addEventListener("click",saveManual);$("#copyScheduleButton").addEventListener("click",()=>copyText(scheduleText(),"Đã copy lịch"));$("#cleanWeek").addEventListener("change",()=>{const s=state.schedules.find(x=>x.weekStart===$("#cleanWeek").value);ui.selectedScheduleId=s?.id||null;saveLocal();renderCleaning();});
  $("#billMonth").addEventListener("change",e=>setBillMonth(e.target.value));$("#billElectricity").addEventListener("change",e=>updateBill("electricity",e.target.value));$("#billWater").addEventListener("change",e=>updateBill("water",e.target.value));$("#syncBillingMembersButton").addEventListener("click",syncBillingMembers);$("#addBillingPersonButton").addEventListener("click",()=>openModal("memberModal"));$("#confirmAddBillingPersonButton").addEventListener("click",addBillingPerson);$("#billNewPersonName").addEventListener("keydown",e=>{if(e.key==="Enter")addBillingPerson();});$("#removeBillingPersonButton").addEventListener("click",removeBillingPerson);$("#markStayButton").addEventListener("click",()=>applyStayRange(true));$("#markAwayButton").addEventListener("click",()=>applyStayRange(false));$$('[data-stay-preset]').forEach(btn=>btn.addEventListener("click",()=>presetStay(btn.dataset.stayPreset)));$("#billCloseButton").addEventListener("click",toggleBillClosed);$("#copyBillingButton").addEventListener("click",()=>copyText(billingText(),"Đã copy bảng tiền"));$("#downloadBillingCsvButton").addEventListener("click",downloadBillingCsv);
  $("#auditMemberFilter").addEventListener("change",e=>{auditFilters.member=e.target.value;renderAudit();});$("#auditActionFilter").addEventListener("change",e=>{auditFilters.action=e.target.value;renderAudit();});$("#auditSearch").addEventListener("input",e=>{auditFilters.query=e.target.value;renderAudit();});$("#clearAuditFiltersButton").addEventListener("click",()=>{auditFilters={member:"all",action:"all",query:""};renderAudit();});$("#cleanupAuditButton").addEventListener("click",cleanupAudit);
  window.addEventListener("hashchange",()=>showPage(location.hash.replace("#","")||"home"));window.addEventListener("online",()=>forceSync());window.addEventListener("offline",()=>{syncStatus={mode:"offline",text:"Mất kết nối · dữ liệu được giữ trên máy"};renderSync();});document.addEventListener("visibilitychange",()=>{if(!document.hidden)realtimeEngine?.forceSync().catch(()=>{});});
}

async function registerPwa(){if(!("serviceWorker" in navigator)||location.protocol==="file:")return;try{const reg=await navigator.serviceWorker.register("./sw.js?v=20260819-2",{scope:"./"});setTimeout(()=>reg.update().catch(()=>{}),1500);}catch(e){console.warn("PWA",e);}}

bindStaticEvents();
$("#cleanWeek").value=dateValue(nextMonday());
state.billing.selectedMonth=ui.selectedMonth||state.billing.selectedMonth||todayMonth();
renderAll();
showPage(location.hash.replace("#","")||"home");
registerPwa();
startCloud();
