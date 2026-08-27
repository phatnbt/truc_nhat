(()=>{
  const style=document.createElement("link");
  style.rel="stylesheet";
  style.href="./mobile-notification-ui.css?v=20260827-2";
  style.dataset.mobileNotifyUi="1";
  if(!document.querySelector('link[data-mobile-notify-ui="1"]'))document.head.appendChild(style);

  const AUTO_NOTIFY_KEY="P708_AUTO_NOTIFY_V2";
  const EVENING_HOUR=19;
  const notificationInFlight=new Set();
  let eveningTimer=null;

  const supportsNotifications=()=>"Notification" in window;
  const permissionState=()=>supportsNotifications()?Notification.permission:"unsupported";
  const localDateKey=(date=new Date())=>dateValue(date);
  const notificationUrl=title=>title.includes("điện nước")||title.includes("Kết toán")?"./#billing":title.includes("trực")||title.includes("lịch")?"./#cleaning":"./";

  // Override the base notification helpers with local-date semantics. The old helper
  // used UTC and marked a notification as delivered before the browser actually
  // accepted it, which could suppress retries after an OS/browser failure.
  notificationKey=function(title){return `P708_NOTIFY_${localDateKey()}_${title}`;};
  showNotification=async function(title,body){
    if(permissionState()!=="granted")return false;
    const key=notificationKey(title);
    if(storageGet(key)||notificationInFlight.has(key))return false;
    notificationInFlight.add(key);
    try{
      const options={body,icon:"./icons/icon-192.png",badge:"./icons/icon-32.png",tag:key,data:{url:notificationUrl(title)}};
      const reg=await navigator.serviceWorker?.ready;
      if(reg?.showNotification)await reg.showNotification(title,options);
      else new Notification(title,options);
      storageSet(key,"1");
      return true;
    }catch(error){
      console.warn("P708 notification",error);
      return false;
    }finally{notificationInFlight.delete(key);}
  };

  function updateNotificationButton(){
    const btn=document.querySelector("#notificationButton");
    if(!btn)return;
    const permission=permissionState();
    btn.classList.toggle("notify-enabled",permission==="granted");
    btn.classList.toggle("notify-blocked",permission==="denied");
    btn.disabled=permission==="unsupported";
    if(permission==="granted"){
      btn.innerHTML='🔔 <span>Nhắc tự động</span>';
      btn.title="Đã bật: báo lịch trực tuần mới, nhắc T4/T5 lúc 19:00 và kết toán điện nước";
    }else if(permission==="denied"){
      btn.innerHTML='🔕 <span>Thông báo bị chặn</span>';
      btn.title="Thông báo đang bị chặn trong cài đặt trình duyệt";
    }else if(permission==="unsupported"){
      btn.innerHTML='🔕 <span>Không hỗ trợ</span>';
      btn.title="Thiết bị/trình duyệt này chưa hỗ trợ thông báo web";
    }else{
      btn.innerHTML='🔔 <span>Bật nhắc việc</span>';
      btn.title="Bật một lần để nhận lịch trực tuần mới, nhắc tối T4/T5 và kết toán";
    }
  }

  function startOfWeek(date=new Date()){
    const d=new Date(date);d.setHours(0,0,0,0);
    const offset=(d.getDay()+6)%7;
    d.setDate(d.getDate()-offset);
    return d;
  }

  function scheduleForDate(date=new Date()){
    const target=new Date(date);target.setHours(0,0,0,0);
    return (state?.schedules||[]).find(schedule=>{
      if(!schedule?.weekStart)return false;
      const start=parseDate(schedule.weekStart);if(Number.isNaN(start.getTime()))return false;
      start.setHours(0,0,0,0);
      const end=addDays(start,6);end.setHours(23,59,59,999);
      return target>=start&&target<=end;
    })||null;
  }

  function newestRelevantSchedule(){
    const monday=startOfWeek();
    return [...(state?.schedules||[])]
      .filter(schedule=>schedule?.weekStart&&!Number.isNaN(parseDate(schedule.weekStart).getTime())&&parseDate(schedule.weekStart)>=monday)
      .sort((a,b)=>String(b.weekStart).localeCompare(String(a.weekStart)))[0]||null;
  }

  function pendingAssignments(schedule,myId){
    if(!schedule||!myId)return [];
    return (schedule.assignments||[]).filter(assignment=>{
      if(assignment.personId!==myId||assignment.cut||assignment.completed)return false;
      const submission=submissionFor(schedule,assignment);
      return submission?.status!=="submitted"&&submission?.status!=="approved";
    });
  }

  function allMyAssignments(schedule,myId){
    if(!schedule||!myId)return [];
    return (schedule.assignments||[]).filter(assignment=>assignment.personId===myId&&!assignment.cut);
  }

  function actorKey(myId){return authSession?.user?.uid||myId||"member";}

  async function notifyNewSchedule(myId){
    const schedule=newestRelevantSchedule();
    if(!schedule)return;
    const mine=allMyAssignments(schedule,myId);
    if(!mine.length)return;
    const seenKey=`P708_NEW_CLEAN_SCHEDULE_${actorKey(myId)}_${schedule.weekStart}`;
    if(storageGet(seenKey)==="1")return;
    const taskNames=mine.map(item=>item.task).filter(Boolean);
    const summary=taskNames.length<=2?taskNames.join(" · "):`${taskNames.slice(0,2).join(" · ")} +${taskNames.length-2} việc`;
    const sent=await showNotification("P708 · Có lịch trực tuần mới",`Tuần ${weekRange(schedule.weekStart)} · Việc của bạn: ${summary||"Mở ứng dụng để xem phân công"}.`);
    if(sent||storageGet(notificationKey("P708 · Có lịch trực tuần mới")))storageSet(seenKey,"1");
  }

  async function notifyWednesdayThursdayEvening(myId,now=new Date()){
    const day=now.getDay();
    if((day!==3&&day!==4)||now.getHours()<EVENING_HOUR)return;
    const schedule=scheduleForDate(now);if(!schedule)return;
    const pending=pendingAssignments(schedule,myId);if(!pending.length)return;
    const dayLabel=day===3?"Thứ 4":"Thứ 5",tasks=pending.map(item=>item.task).filter(Boolean),summary=tasks.length<=2?tasks.join(" · "):`${tasks.slice(0,2).join(" · ")} +${tasks.length-2} việc`;
    await showNotification(`P708 · Nhắc trực tối ${dayLabel}`,`Bạn còn ${pending.length} việc trực tuần này: ${summary}. Hãy hoàn thành và báo đã làm.`);
  }

  function latestClosedBill(){
    return [...(state?.billing?.months||[])]
      .filter(item=>item?.closed&&item?.month)
      .sort((a,b)=>String(b.month).localeCompare(String(a.month)))[0]||null;
  }

  async function notifyClosedBill(myId){
    const bill=latestClosedBill();if(!myId||!bill)return;
    const calc=billCalc(bill),mine=calc.people.find(person=>person.memberId===myId),due=mine?(calc.due[mine.id]||0):0;
    if(mine&&due>0&&!isBillPaid(mine,due))await showNotification(`P708 · Kết toán ${monthLabel(bill.month)}`,`Điện nước đã chốt. Số tiền của bạn: ${money(due)}.`);
  }

  async function runAutomaticReminders(force=false){
    if(permissionState()!=="granted"||authSession?.status!=="active")return;
    if(!force&&storageGet(AUTO_NOTIFY_KEY)!=="1")return;
    const myId=myMemberId?.();if(!myId)return;
    await notifyNewSchedule(myId);
    await notifyWednesdayThursdayEvening(myId,new Date());
    await notifyClosedBill(myId);
  }

  function nextEveningTarget(from=new Date()){
    for(let offset=0;offset<=7;offset++){
      const candidate=new Date(from);candidate.setDate(from.getDate()+offset);candidate.setHours(EVENING_HOUR,0,0,0);
      if((candidate.getDay()===3||candidate.getDay()===4)&&candidate>from)return candidate;
    }
    return null;
  }

  function armEveningTimer(){
    if(eveningTimer)clearTimeout(eveningTimer);
    const target=nextEveningTarget(new Date());if(!target)return;
    eveningTimer=setTimeout(async()=>{await runAutomaticReminders(false).catch(()=>{});armEveningTimer();},Math.max(1000,target.getTime()-Date.now()+1000));
  }

  async function enableAutomaticReminders(){
    if(!supportsNotifications()){
      toast("Thiết bị này chưa hỗ trợ thông báo web. Trên iPhone hãy dùng PWA đã thêm vào Màn hình chính.",5500);updateNotificationButton();return;
    }
    if(Notification.permission==="denied"){
      toast("Thông báo đang bị chặn. Hãy bật lại quyền Thông báo trong cài đặt trình duyệt/ứng dụng.",5500);updateNotificationButton();return;
    }
    const permission=Notification.permission==="granted"?"granted":await Notification.requestPermission();
    if(permission==="granted"){
      storageSet(AUTO_NOTIFY_KEY,"1");updateNotificationButton();toast("Đã bật: lịch tuần mới · T4/T5 19:00 · kết toán");armEveningTimer();await runAutomaticReminders(true);
    }else{updateNotificationButton();toast("Bạn chưa cho phép thông báo");}
  }

  const oldButton=document.querySelector("#notificationButton");
  if(oldButton){
    const newButton=oldButton.cloneNode(true);oldButton.replaceWith(newButton);newButton.addEventListener("click",enableAutomaticReminders);
  }

  if(permissionState()==="granted")storageSet(AUTO_NOTIFY_KEY,"1");
  updateNotificationButton();armEveningTimer();

  const previousRenderAll=renderAll;
  renderAll=function(...args){
    const result=previousRenderAll(...args);updateNotificationButton();
    if(permissionState()==="granted")setTimeout(()=>runAutomaticReminders(false).catch(()=>{}),0);
    return result;
  };

  document.addEventListener("visibilitychange",()=>{if(!document.hidden){runAutomaticReminders(false).catch(()=>{});armEveningTimer();}});
  window.addEventListener("online",()=>runAutomaticReminders(false).catch(()=>{}));
  const periodicTimer=setInterval(()=>runAutomaticReminders(false).catch(()=>{}),15*60*1000);
  window.addEventListener("pagehide",()=>{if(eveningTimer)clearTimeout(eveningTimer);clearInterval(periodicTimer);},{once:true});
  setTimeout(()=>runAutomaticReminders(false).catch(()=>{}),1200);
})();
