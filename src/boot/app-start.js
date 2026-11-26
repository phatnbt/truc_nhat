async function startCloud(){
  let bootReady=false;
  let sessionMarkup="";
  const signalBootReady=()=>{if(bootReady)return;bootReady=true;window.dispatchEvent(new Event("p708:boot-ready"));};
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
      const nextSession=JSON.stringify(session);
      if(nextSession===sessionMarkup)return;
      sessionMarkup=nextSession;
      if(session.user?.uid!==authSession.user?.uid||session.access?.role!==authSession.access?.role||session.access?.memberId!==authSession.access?.memberId){
        state=defaultState();
        confirmedState=clone(state);
        accessRequests=[];accessAccounts=[];auditLogs=[];taskSubmissions=[];taskSwaps=[];
        ui.selectedScheduleId=null;ui.activeBillPersonId=null;
        $$(".modal.show").forEach(modal=>closeModal(modal.id));
        for(const form of [$("#stockForm"),$("#expenseForm"),$("#roomEventForm"),$("#taskChecklistForm")]){
          form.reset();delete form.dataset.expenseId;
        }
      }
      authSession=session;
      if(session.status==="active"&&location.hash==="#audit")showPage("audit",{replace:true,scroll:false});
      renderAuthGate();if(session.status!=="restoring")signalBootReady();renderAll();
    },
    onAdminData:data=>{
      if(data.requests!==undefined)accessRequests=data.requests;
      if(data.accesses!==undefined)accessAccounts=data.accesses;
      if(data.logs!==undefined)auditLogs=data.logs;
      renderHome();
      if(data.logs!==undefined&&document.body.dataset.page==="audit")renderAudit();
      if($("#accessModal").classList.contains("show"))renderAccessModal();
      renderNotificationCenter();
    },
    onTaskData:data=>{taskSubmissions=data||[];renderHome();renderCleaning();renderNotificationCenter();},
    onSwapData:data=>{taskSwaps=data||[];renderHome();renderCleaning();renderNotificationCenter();}
  });
  try{await realtimeEngine.start();}
  catch(e){
    authSession={...authSession,status:"error"};syncStatus={mode:"offline",text:"Không thể kết nối"};
    renderAuthGate();renderSync();signalBootReady();
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
  $("#homeSyncButton")?.addEventListener("click",forceSync);
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
  const cleaningActions={
    submitTask:openChecklist,
    startTask:index=>submitTask(index,"in_progress"),
    swapTask:openTaskSwap,
    reviewApprove:(index,button)=>reviewTask(index,true,button),
    reviewReject:(index,button)=>reviewTask(index,false,button),
    reopenTask:reopenCompletedTask,
    adminTask:adminCompleteTask
  };
  const cleaningScheduleBox=$("#cleanScheduleBox");
  const holdCleaningView=(event,id)=>{
    if(event.target.closest("button:not(:disabled)"))cleaningTaskPress={id};
  };
  const releaseCleaningView=id=>{
    const press=cleaningTaskPress;
    if(!press||press.id!==id)return;
    // Wait until the click following release has been dispatched.
    requestAnimationFrame(()=>{
      if(cleaningTaskPress!==press)return;
      cleaningTaskPress=null;
      if(cleaningRenderQueued)renderCleaning();
    });
  };
  cleaningScheduleBox?.addEventListener("pointerdown",event=>{
    if(event.isPrimary&&event.button===0)holdCleaningView(event,event.pointerId);
  },true);
  window.addEventListener("pointerup",event=>releaseCleaningView(event.pointerId),true);
  window.addEventListener("pointercancel",event=>releaseCleaningView(event.pointerId),true);
  cleaningScheduleBox?.addEventListener("keydown",event=>{
    if(event.key===" "&&!event.repeat)holdCleaningView(event,"space");
  },true);
  window.addEventListener("keyup",event=>{if(event.key===" ")releaseCleaningView("space");},true);
  window.addEventListener("blur",()=>releaseCleaningView(cleaningTaskPress?.id));
  cleaningScheduleBox?.addEventListener("click",event=>{
    const button=event.target.closest("button");
    if(!button||button.disabled)return;
    for(const [key,action] of Object.entries(cleaningActions)){
      if(!Object.hasOwn(button.dataset,key))continue;
      const index=Number(button.dataset[key]),schedule=currentSchedule(),assignment=schedule?.assignments[index];
      if(!assignment||schedule.id!==cleaningScheduleBox.dataset.scheduleId||button.closest("tr")?.dataset.taskKey!==cleaningTaskKey(assignment,index)){
        toast("Phân công vừa thay đổi. Hãy kiểm tra lại lịch trực.");
        return;
      }
      action(index,button);
      return;
    }
  });
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
  $("#auditGroups")?.addEventListener("click",event=>{
    const button=event.target.closest("[data-audit-more]");
    if(!button)return;
    const actor=button.dataset.auditMore;
    auditVisibleCounts.set(actor,(auditVisibleCounts.get(actor)||auditPageSize)+auditPageSize);
    renderAudit();
  });
  $("#cleanupAuditButton")?.addEventListener("click",cleanupAudit);

  const routeFromLocation=()=>showPage(location.hash.replace("#","")||"home",{replace:true,instant:true,scroll:false});
  window.addEventListener("hashchange",routeFromLocation);
  window.addEventListener("popstate",routeFromLocation);
}

async function registerPwa(){
  if(!("serviceWorker" in navigator)||location.protocol==="file:")return;
  try{
    const reg=await navigator.serviceWorker.register("./sw.js",{scope:"./",updateViaCache:"none"});
    const banner=$("#pwaUpdateBanner");
    let requested=false,reloadNeeded=false,updateCheckedAt=0;
    const showUpdate=()=>{banner.hidden=!(reloadNeeded||(reg.waiting&&reg.active&&reg.waiting!==reg.active&&navigator.serviceWorker.controller));};
    const reloadBlocker=()=>{
      if(!navigator.onLine)return "Kết nối mạng rồi thử cập nhật.";
      if(["loading","restoring","signingIn","checking","loadingRoom"].includes(authSession.status))
        return "Đợi đăng nhập và dữ liệu phòng tải xong rồi cập nhật.";
      if(realtimeEngine?.hasPendingWork()||globalThis.P708HasExternalWrites?.())
        return "Đợi các thay đổi được máy chủ xác nhận rồi cập nhật.";
      const drafts=$$('#stockForm input,#expenseForm input,#roomEventForm input')
        .some(input=>input.name!=="threshold"&&input.name!==""&&input.value!==input.defaultValue);
      if($(".modal.show")||drafts)return "Lưu hoặc hủy phần đang nhập rồi cập nhật.";
      return "";
    };
    showUpdate();
    reg.addEventListener("updatefound",()=>{
      reg.installing?.addEventListener("statechange",showUpdate);
    });
    navigator.serviceWorker.addEventListener("controllerchange",()=>{
      if(requested){
        requested=false;
        if(!reloadBlocker()){location.reload();return;}
        reloadNeeded=true;
      }
      showUpdate();
    });
    navigator.serviceWorker.addEventListener("message",event=>{
      if(event.source!==navigator.serviceWorker.controller||event.data?.type!=="P708_OPEN_PAGE")return;
      const page=typeof event.data.hash==="string"?event.data.hash.slice(1):"";
      if(page)showPage(page);
    });
    $("#pwaUpdateButton").addEventListener("click",()=>{
      const blocker=reloadBlocker();
      if(blocker)return toast(blocker);
      if(reloadNeeded){location.reload();return;}
      if(requested||!reg.waiting)return;
      const channel=new MessageChannel();
      requested=true;
      const timeout=setTimeout(()=>{requested=false;channel.port1.close();},5000);
      channel.port1.onmessage=event=>{
        clearTimeout(timeout);channel.port1.close();
        if(!event.data?.accepted){requested=false;toast("Đóng các cửa sổ P708 khác rồi thử cập nhật.");}
      };
      reg.waiting.postMessage({type:"SKIP_WAITING"},[channel.port2]);
    });
    const checkUpdate=()=>{
      if(document.hidden||!navigator.onLine||Date.now()-updateCheckedAt<60000)return;
      updateCheckedAt=Date.now();
      void reg.update().then(showUpdate).catch(()=>globalThis.P708Debug?.("registration","update-error"));
    };
    for(const event of ["pageshow","online"])window.addEventListener(event,checkUpdate);
    document.addEventListener("visibilitychange",checkUpdate);
  }catch(e){globalThis.P708Debug?.("registration","failed");}
}

globalThis.P708StartApplication=()=>{
  bindStaticEvents();
  bindRoomResources();
  bindNotificationCenter();
  if($("#cleanWeek"))$("#cleanWeek").value=dateValue(nextMonday());
  state.billing.selectedMonth=validMonthKey(ui.selectedMonth)?ui.selectedMonth:state.billing.selectedMonth||todayMonth();
  renderAll();
  showPage(location.hash.replace("#","")||"home",{replace:true,instant:true,updateLocation:location.hash!=="#audit"});
  void registerPwa();
  void startCloud().catch(()=>globalThis.P708ShowBootRecovery?.("cloud-start"));
};
