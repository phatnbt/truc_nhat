(()=>{
  const AUTO_NOTIFY_KEY="P708_AUTO_NOTIFY_V2";

  const supportsNotifications=()=>"Notification" in window;
  const permissionState=()=>supportsNotifications()?Notification.permission:"unsupported";

  function updateNotificationButton(){
    const btn=document.querySelector("#notificationButton");
    if(!btn)return;
    const permission=permissionState();
    btn.classList.toggle("notify-enabled",permission==="granted");
    btn.classList.toggle("notify-blocked",permission==="denied");
    btn.disabled=permission==="unsupported";
    if(permission==="granted"){
      btn.innerHTML='🔔 <span>Nhắc tự động</span>';
      btn.title="Đã bật: tự nhắc trực nhật và điện nước khi ứng dụng nhận dữ liệu mới";
    }else if(permission==="denied"){
      btn.innerHTML='🔕 <span>Thông báo bị chặn</span>';
      btn.title="Thông báo đang bị chặn trong cài đặt trình duyệt";
    }else if(permission==="unsupported"){
      btn.innerHTML='🔕 <span>Không hỗ trợ</span>';
      btn.title="Thiết bị/trình duyệt này chưa hỗ trợ thông báo web";
    }else{
      btn.innerHTML='🔔 <span>Bật nhắc việc</span>';
      btn.title="Bật một lần để tự nhắc trực nhật và kết toán";
    }
  }

  function scheduleForToday(){
    const today=new Date();today.setHours(0,0,0,0);
    return (state?.schedules||[]).find(schedule=>{
      if(!schedule?.weekStart)return false;
      const start=parseDate(schedule.weekStart);start.setHours(0,0,0,0);
      const end=addDays(start,6);end.setHours(23,59,59,999);
      return today>=start&&today<=end;
    })||null;
  }

  function latestClosedBill(){
    return [...(state?.billing?.months||[])]
      .filter(item=>item?.closed&&item?.month)
      .sort((a,b)=>String(b.month).localeCompare(String(a.month)))[0]||null;
  }

  async function runAutomaticReminders(force=false){
    if(permissionState()!=="granted"||authSession?.status!=="active")return;
    if(!force&&storageGet(AUTO_NOTIFY_KEY)!=="1")return;

    const myId=myMemberId?.();
    const schedule=scheduleForToday();
    if(myId&&schedule){
      for(const assignment of schedule.assignments||[]){
        if(assignment.personId!==myId||assignment.cut||assignment.completed)continue;
        const submission=submissionFor(schedule,assignment);
        if(submission?.status==="submitted")continue;
        await showNotification(
          `P708 · Trực nhật: ${assignment.task}`,
          `Đến lịch trực tuần này (${weekRange(schedule.weekStart)}). Hãy hoàn thành và báo đã làm trong ứng dụng.`
        );
      }
    }

    const bill=latestClosedBill();
    if(myId&&bill){
      const calc=billCalc(bill);
      const mine=calc.people.find(person=>person.memberId===myId);
      const due=mine?(calc.due[mine.id]||0):0;
      if(mine&&due>0&&!isBillPaid(mine,due)){
        await showNotification(
          `P708 · Kết toán ${monthLabel(bill.month)}`,
          `Điện nước đã chốt. Số tiền của bạn: ${money(due)}.`
        );
      }
    }
  }

  async function enableAutomaticReminders(){
    if(!supportsNotifications()){
      toast("Thiết bị này chưa hỗ trợ thông báo web. Trên iPhone hãy dùng PWA đã thêm vào Màn hình chính.",5500);
      updateNotificationButton();
      return;
    }
    if(Notification.permission==="denied"){
      toast("Thông báo đang bị chặn. Hãy bật lại quyền Thông báo trong cài đặt trình duyệt/ứng dụng.",5500);
      updateNotificationButton();
      return;
    }
    const permission=Notification.permission==="granted"?"granted":await Notification.requestPermission();
    if(permission==="granted"){
      storageSet(AUTO_NOTIFY_KEY,"1");
      updateNotificationButton();
      toast("Đã bật nhắc tự động: trực nhật và kết toán");
      await runAutomaticReminders(true);
    }else{
      updateNotificationButton();
      toast("Bạn chưa cho phép thông báo");
    }
  }

  const oldButton=document.querySelector("#notificationButton");
  if(oldButton){
    const newButton=oldButton.cloneNode(true);
    oldButton.replaceWith(newButton);
    newButton.addEventListener("click",enableAutomaticReminders);
  }

  if(permissionState()==="granted")storageSet(AUTO_NOTIFY_KEY,"1");
  updateNotificationButton();

  const previousRenderAll=renderAll;
  renderAll=function(...args){
    const result=previousRenderAll(...args);
    updateNotificationButton();
    if(permissionState()==="granted")setTimeout(()=>runAutomaticReminders(false).catch(()=>{}),0);
    return result;
  };

  document.addEventListener("visibilitychange",()=>{
    if(!document.hidden)runAutomaticReminders(false).catch(()=>{});
  });
  window.addEventListener("online",()=>runAutomaticReminders(false).catch(()=>{}));
  setInterval(()=>runAutomaticReminders(false).catch(()=>{}),15*60*1000);
  setTimeout(()=>runAutomaticReminders(false).catch(()=>{}),1200);
})();
