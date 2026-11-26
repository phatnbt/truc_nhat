async function startCloud(){
  let bootReady=false;
  const signalBootReady=()=>{if(bootReady)return;bootReady=true;window.dispatchEvent(new Event("p708:boot-ready"));};
  try{localStorage.removeItem(CACHE_KEY);}catch{}
  realtimeEngine=createP708SecureEngine({
    firebaseConfig:FIREBASE_CONFIG,roomCode:ROOM_CODE,deviceId:DEVICE_ID,
    onShape:(shape)=>{
      state=fromSyncShape(shape);confirmedState=clone(state);
      if(ui.selectedScheduleId&&!state.schedules.some(s=>s.id===ui.selectedScheduleId))ui.selectedScheduleId=null;
      const bill=currentBill();
      if(ui.activeBillPersonId&&!bill?.people?.some(p=>p.id===ui.activeBillPersonId))ui.activeBillPersonId=bill?.people?.[0]?.id||null;
      renderAll();
    },
    onStatus:status=>{syncStatus={mode:status.mode||"online",text:status.text||"Đã đồng bộ"};renderSync();},
    onSession:session=>{
      if(session.status!=="active"||session.user?.uid!==authSession.user?.uid||session.access?.role!==authSession.access?.role){
        state=defaultState();
        confirmedState=clone(state);
        accessRequests=[];accessAccounts=[];auditLogs=[];taskSubmissions=[];taskSwaps=[];
        ui.selectedScheduleId=null;ui.activeBillPersonId=null;
        $$(".modal.show").forEach(modal=>closeModal(modal.id));
        for(const form of [$("#stockForm"),$("#expenseForm"),$("#roomEventForm"),$("#taskChecklistForm")]){
          form.reset();delete form.dataset.expenseId;
        }
      }
      authSession={...authSession,...session};
      renderAuthGate();if(session.status!=="checking")signalBootReady();renderAll();
    },
    onAdminData:data=>{
      if(data.requests!==undefined)accessRequests=data.requests;
      if(data.accesses!==undefined)accessAccounts=data.accesses;
      if(data.logs!==undefined)auditLogs=data.logs;
      renderAll();
    },
    onTaskData:data=>{taskSubmissions=data||[];renderAll();},
    onSwapData:data=>{taskSwaps=data||[];renderAll();}
  });
  try{await realtimeEngine.start();}
  catch(e){
    authSession={...authSession,status:"error"};syncStatus={mode:"offline",text:e?.message||"Không thể kết nối"};
    renderAuthGate();renderSync();toast(e?.message||"Không thể khởi động ứng dụng",6000);signalBootReady();
  }
}

function bindStaticEvents(){
  const themeButton=$("#themeButton"),updateTheme=dark=>{
    document.documentElement.dataset.theme=dark?"dark":"light";
    themeButton?.setAttribute("aria-pressed",String(dark));
  };
  const storedTheme=storageGet("P708_THEME");
  updateTheme(storedTheme?storedTheme==="dark":matchMedia("(prefers-color-scheme: dark)").matches);
  themeButton?.addEventListener("click",()=>{
    const dark=document.documentElement.dataset.theme!=="dark";
    updateTheme(dark);storageSet("P708_THEME",dark?"dark":"light");
  });
  $$('[data-go]').forEach(btn=>btn.addEventListener("click",()=>showPage(btn.dataset.go)));
  $$('[data-close]').forEach(btn=>btn.addEventListener("click",()=>closeModal(btn.dataset.close)));
  $$(".modal").forEach(modal=>modal.addEventListener("click",e=>{if(e.target===modal)closeModal(modal.id);}));
  document.addEventListener("keydown",event=>{
    const modal=$$(".modal.show").at(-1);
    if(!modal)return;
    if(event.key==="Escape"){event.preventDefault();closeModal(modal.id);return;}
    if(event.key!=="Tab")return;
    const focusable=[...modal.querySelectorAll("button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href],summary")].filter(el=>el.getClientRects().length);
    if(!focusable.length)return;
    const next=event.shiftKey?focusable.at(-1):focusable[0];
    if(!modal.contains(document.activeElement)||document.activeElement===(event.shiftKey?focusable[0]:focusable.at(-1))){
      event.preventDefault();next.focus();
    }
  });
  $("#accountButton")?.addEventListener("click",()=>{renderAccessModal();openModal("accessModal");});
  $("#homeCleaningButton")?.addEventListener("click",()=>{const week=roomScheduleToday();if(week)selectSchedule(week.id);});
  $("#homePendingButton")?.addEventListener("click",()=>{
    if(isAdmin())$(".room-queue")?.scrollIntoView({block:"center"});
    else{showPage("cleaning");$("#cleanFilter").value="mine";renderCleaning();}
  });
  $("#signOutButton")?.addEventListener("click",secureSignOut);
  $("#refreshReminderButton")?.addEventListener("click",()=>{renderHome();renderNotificationCenter();toast("Đã làm mới nhắc việc");});
  $("#cleaningRulesButton")?.addEventListener("click",()=>{renderCleaningRules();openModal("cleaningRulesModal");});
  $("#sendCleaningReminderButton")?.addEventListener("click",sendCleaningReminder);

  $("#addMemberButton")?.addEventListener("click",addMember);
  $("#cleanMemberName")?.addEventListener("keydown",e=>{if(e.key==="Enter")addMember();});
  $("#allPresentButton")?.addEventListener("click",setAllPresent);
  $("#resetCleaningPointsButton")?.addEventListener("click",resetAllCleaningPoints);
  $("#createScheduleButton")?.addEventListener("click",createSchedule);
  $("#cleanFilter")?.addEventListener("change",renderCleaning);
  $("#cleanHistorySearch")?.addEventListener("input",renderCleaningHistory);
  $("#confirmScheduleButton")?.addEventListener("click",confirmSchedule);
  $("#sendSwapButton")?.addEventListener("click",sendTaskSwap);
  $("#taskChecklistForm")?.addEventListener("submit",confirmChecklist);
  $("#roomCalendarView")?.addEventListener("change",renderRoomCalendar);
  $("#roomEventForm")?.addEventListener("submit",saveRoomCalendarEvent);
  $("#deleteScheduleButton")?.addEventListener("click",deleteSchedule);
  $("#manualScheduleButton")?.addEventListener("click",openManual);
  $("#saveManualScheduleButton")?.addEventListener("click",saveManual);
  $("#copyScheduleButton")?.addEventListener("click",()=>copyText(scheduleText(),"Đã copy lịch"));
  $("#cleanWeek")?.addEventListener("change",()=>{
    const s=state.schedules.find(x=>x.weekStart===$("#cleanWeek").value);ui.selectedScheduleId=s?.id||null;saveLocal();renderCleaning();
  });

  $("#billMonth")?.addEventListener("change",e=>setBillMonth(e.target.value));
  $("#billElectricity")?.addEventListener("change",e=>updateBill("electricity",e.target.value));
  $("#billWater")?.addEventListener("change",e=>updateBill("water",e.target.value));
  $("#syncBillingMembersButton")?.addEventListener("click",syncBillingMembers);
  $("#addBillingPersonButton")?.addEventListener("click",()=>openModal("memberModal"));
  $("#confirmAddBillingPersonButton")?.addEventListener("click",addBillingPerson);
  $("#billingPeriodStart")?.addEventListener("input",()=>globalThis.P708BillingCycleUi?.updateBillingPeriodEditorNotice?.());
  $("#billingPeriodEnd")?.addEventListener("input",()=>globalThis.P708BillingCycleUi?.updateBillingPeriodEditorNotice?.());
  $("#resetBillingPeriodButton")?.addEventListener("click",()=>globalThis.resetBillingPeriodEditor?.());
  $("#saveBillingPeriodButton")?.addEventListener("click",()=>globalThis.saveBillingPeriodEditor?.());
  $("#billNewPersonName")?.addEventListener("keydown",e=>{if(e.key==="Enter")addBillingPerson();});
  $("#removeBillingPersonButton")?.addEventListener("click",removeBillingPerson);
  $("#markStayButton")?.addEventListener("click",()=>applyStayRange(true));
  $("#markAwayButton")?.addEventListener("click",()=>applyStayRange(false));
  $$('[data-stay-preset]').forEach(btn=>btn.addEventListener("click",()=>presetStay(btn.dataset.stayPreset)));
  $("#billCloseButton")?.addEventListener("click",toggleBillClosed);
  $("#billingDecisionForm")?.addEventListener("submit",confirmBillingDecision);
  $("#copyBillingButton")?.addEventListener("click",()=>copyText(billingText(),"Đã copy bảng tiền"));
  $("#downloadBillingCsvButton")?.addEventListener("click",downloadBillingCsv);

  $("#auditMemberFilter")?.addEventListener("change",e=>{auditFilters.member=e.target.value;renderAudit();});
  $("#auditActionFilter")?.addEventListener("change",e=>{auditFilters.action=e.target.value;renderAudit();});
  $("#auditSearch")?.addEventListener("input",e=>{auditFilters.query=e.target.value;renderAudit();});
  $("#clearAuditFiltersButton")?.addEventListener("click",()=>{auditFilters={member:"all",action:"all",query:""};renderAudit();});
  $("#cleanupAuditButton")?.addEventListener("click",cleanupAudit);

  const routeFromLocation=()=>showPage(location.hash.replace("#","")||"home",{replace:true,instant:true,scroll:false});
  window.addEventListener("hashchange",routeFromLocation);
  window.addEventListener("popstate",routeFromLocation);
  window.addEventListener("online",()=>forceSync());
  window.addEventListener("offline",()=>{syncStatus={mode:"offline",text:"Mất kết nối · chế độ chỉ đọc"};renderSync();});
  document.addEventListener("visibilitychange",()=>{if(!document.hidden)realtimeEngine?.forceSync().catch(()=>{});});
}

async function registerPwa(){
  if(!("serviceWorker" in navigator)||location.protocol==="file:")return;
  try{
    const reg=await navigator.serviceWorker.register("./sw.js?v=20261127-1",{scope:"./",updateViaCache:"none"});
    const banner=$("#pwaUpdateBanner");
    const showUpdate=()=>{banner.hidden=!(reg.waiting&&reg.active&&reg.waiting!==reg.active&&navigator.serviceWorker.controller);};
    showUpdate();
    reg.addEventListener("updatefound",()=>{
      reg.installing?.addEventListener("statechange",showUpdate);
    });
    navigator.serviceWorker.addEventListener("controllerchange",showUpdate);
    $("#pwaUpdateButton").addEventListener("click",()=>{
      const drafts=$$('#stockForm input,#expenseForm input,#roomEventForm input')
        .some(input=>input.name!=="threshold"&&input.name!==""&&input.value!==input.defaultValue);
      if($(".modal.show")||drafts){
        return toast("Lưu hoặc hủy phần đang nhập rồi cập nhật.");
      }
      if(!reg.waiting){location.reload();return;}
      navigator.serviceWorker.addEventListener("controllerchange",()=>location.reload(),{once:true});
      reg.waiting.postMessage({type:"SKIP_WAITING"});
    });
  }catch(e){console.warn("PWA",e);}
}

bindStaticEvents();
bindRoomResources();
bindNotificationCenter();
if($("#cleanWeek"))$("#cleanWeek").value=dateValue(nextMonday());
state.billing.selectedMonth=validMonthKey(ui.selectedMonth)?ui.selectedMonth:state.billing.selectedMonth||todayMonth();
renderAll();
showPage(location.hash.replace("#","")||"home",{replace:true,instant:true});
void registerPwa();
startCloud();
