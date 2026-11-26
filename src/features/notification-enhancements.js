const NOTICE_TYPES={schedule:"Lịch trực",reminder:"Nhắc việc trực",review:"Duyệt công việc",swap:"Đổi việc",billing:"Điện nước",stock:"Vật dụng"};
const noticeInFlight=new Set();

function noticeStorageKey(){
  return authSession.status==="active"&&authSession.user?.uid?`P708_NOTICE_V1_${authSession.user.uid}`:null;
}
function noticePreferences(key){
  try{return JSON.parse(storageGet(key)||"null")||{read:[],disabled:[],local:false};}
  catch{return {read:[],disabled:[],local:false};}
}
function roomNotices(){
  if(authSession.status!=="active")return [];
  const result=[],memberId=myMemberId(),today=P708BillingCycle.roomDateKey();
  const current=roomScheduleToday();
  const upcoming=state.schedules.filter(s=>s.weekStart>today).sort((a,b)=>a.weekStart.localeCompare(b.weekStart))[0];
  for(const schedule of [current,upcoming].filter(Boolean)){
    const mine=schedule.assignments.filter(a=>!a.cut&&a.personId===memberId);
    if(mine.length)result.push({id:`schedule:${schedule.id}`,type:"schedule",title:"Lịch trực",body:mine.map(a=>a.task).join(" · "),page:"cleaning",scheduleId:schedule.id});
  }
  const reminder=state.settings?.cleaningReminder;
  const pending=current?.assignments.filter(a=>!a.cut&&!a.completed&&a.personId===memberId&&submissionFor(current,a)?.status!=="submitted")||[];
  if(pending.length){
    const deadline=dateValue(addDays(parseDate(current.weekStart),6));
    const daysLeft=(Date.parse(deadline)-Date.parse(today))/86400000;
    if(daysLeft<=2)result.push({id:`deadline:${current.id}:${today}`,type:"reminder",title:"Sắp đến hạn trực",body:pending.map(a=>a.task).join(" · "),page:"cleaning",scheduleId:current.id});
    if(reminder?.weekStart===current.weekStart&&reminder.memberIds?.includes(memberId))result.push({id:`reminder:${reminder.id}`,type:"reminder",title:"Trưởng phòng nhắc việc",body:pending.map(a=>a.task).join(" · "),page:"cleaning",scheduleId:current.id});
  }
  const overdue=state.schedules.filter(s=>dateValue(addDays(parseDate(s.weekStart),6))<today&&s.assignments.some(a=>!a.cut&&!a.completed&&a.personId===memberId)).sort((a,b)=>b.weekStart.localeCompare(a.weekStart))[0];
  if(overdue)result.push({id:`overdue:${overdue.id}`,type:"reminder",title:"Việc trực quá hạn",body:weekRange(overdue.weekStart),page:"cleaning",scheduleId:overdue.id});
  for(const item of relevantTaskSubmissions().slice(0,30)){
    const waiting=isAdmin()&&item.status==="submitted";
    const own=item.memberId===memberId&&["approved","rejected"].includes(item.status);
    if(waiting||own)result.push({
      id:`task:${item.id}:${item.status}:${item.updatedAt?.seconds||0}`,type:"review",title:waiting?"Chờ xác nhận":item.status==="approved"?"Đã xác nhận":"Yêu cầu làm lại",
      body:item.taskName,page:"cleaning",scheduleId:item.scheduleId
    });
  }
  const bill=[...state.billing.months].filter(b=>b.closed).sort((a,b)=>b.month.localeCompare(a.month))[0];
  for(const swap of taskSwaps.slice(0,20)){
    if((isAdmin()&&swap.status==="pending")||(swap.memberId===memberId&&swap.status!=="pending")){
      result.push({id:`swap:${swap.id}:${swap.status}`,type:"swap",title:{pending:"Yêu cầu đổi việc",approved:"Đổi việc đã được duyệt",rejected:"Đổi việc bị từ chối"}[swap.status],body:weekRange(swap.weekStart),page:"cleaning",scheduleId:swap.scheduleId});
    }
  }
  if(bill&&memberId){
    const calc=billCalc(bill),person=calc.people.find(p=>p.memberId===memberId);
    const remaining=person?Math.max(0,(calc.due[person.id]||0)-(Number(person.paidAmount)||0)):0;
    if(person)result.push({id:`billing:${bill.month}:${remaining}`,type:"billing",title:remaining?"Điện nước cần thanh toán":"Kỳ điện nước đã chốt",body:`${monthLabel(bill.month)} · Còn ${money(remaining)}`,page:"billing",month:bill.month});
  }
  const low=Object.values(state.resources?.inventory||{}).filter(item=>item.quantity<=item.threshold);
  if(low.length)result.push({id:`stock:${low.map(item=>item.id+"-"+item.quantity).sort().join(",")}`,type:"stock",title:"Vật dụng sắp hết",body:low.map(item=>item.name).join(" · "),page:"resources"});
  return result;
}
function renderNotificationCenter(){
  const key=noticeStorageKey(),prefs=noticePreferences(key);
  const notices=roomNotices().filter(item=>!prefs.disabled.includes(item.type));
  const unread=notices.filter(item=>!prefs.read.includes(item.id));
  $("#noticeCount").textContent=unread.length?String(unread.length):"";
  $("#notificationButton").setAttribute("aria-label",unread.length?`Thông báo, ${unread.length} chưa đọc`:"Thông báo");
  $("#noticeMarkAll").disabled=!unread.length;
  $("#noticeChannels").querySelectorAll("[data-notice-type]").forEach(input=>input.checked=!prefs.disabled.includes(input.dataset.noticeType));
  $("#noticeLocal").checked=prefs.local;
  $("#noticeLocal").disabled=!("Notification" in window);
  if($("#noticeModal").classList.contains("show")){
    $("#noticeList").innerHTML=notices.length?notices.map((item,index)=>`<button class="history-btn" data-open-notice="${index}" type="button"><b>${prefs.read.includes(item.id)?"":"● "}${esc(item.title)}</b><small>${esc(item.body)}</small></button>`).join(""):'<p class="empty">Chưa có thông báo.</p>';
    $("#noticeList").onclick=event=>{
      const button=event.target.closest("[data-open-notice]");
      if(!button||!key||key!==noticeStorageKey())return;
      const item=notices[Number(button.dataset.openNotice)];
      saveNoticePreferences(key,{...prefs,read:[...new Set([...prefs.read,item.id])].slice(-200)});
      closeModal("noticeModal");
      if(item.scheduleId)selectSchedule(item.scheduleId);
      if(item.month)setBillMonth(item.month);
      showPage(item.page);
    };
  }
  if(key&&prefs.local&&window.Notification?.permission==="granted"&&syncStatus.mode==="online"){
    for(const item of unread.slice(0,3))void notifyLocally(key,item);
  }
}
function saveNoticePreferences(key,prefs){
  if(key&&key===noticeStorageKey())storageSet(key,JSON.stringify(prefs));
  renderNotificationCenter();
}
async function notifyLocally(key,item){
  const tag=`${key}_shown_${item.id}`;
  if(storageGet(tag)||noticeInFlight.has(tag))return;
  noticeInFlight.add(tag);
  try{
    const registration=await navigator.serviceWorker?.getRegistration();
    if(key!==noticeStorageKey())return;
    if(registration?.active)await registration.showNotification("P708 · "+item.title,{body:item.body,tag,icon:"./icons/icon-192.png",data:{url:`./#${item.page}`}});
    else new Notification("P708 · "+item.title,{body:item.body,tag});
    storageSet(tag,"1");
  }catch{}finally{noticeInFlight.delete(tag);}
}
function bindNotificationCenter(){
  $("#noticeChannels").innerHTML=Object.entries(NOTICE_TYPES).map(([key,label])=>`<label><input type="checkbox" data-notice-type="${key}" checked> ${label}</label>`).join("");
  $("#notificationButton").addEventListener("click",()=>{openModal("noticeModal");renderNotificationCenter();});
  $("#noticeMarkAll").addEventListener("click",()=>{
    const key=noticeStorageKey(),prefs=noticePreferences(key);
    const ids=roomNotices().filter(item=>!prefs.disabled.includes(item.type)).map(item=>item.id);
    saveNoticePreferences(key,{...prefs,read:[...new Set([...prefs.read,...ids])].slice(-200)});
  });
  $("#noticeChannels").addEventListener("change",event=>{
    const type=event.target.dataset.noticeType;
    const key=noticeStorageKey(),prefs=noticePreferences(key);
    if(!type||!key)return;
    const disabled=new Set(prefs.disabled);
    if(event.target.checked)disabled.delete(type);else disabled.add(type);
    saveNoticePreferences(key,{...prefs,disabled:[...disabled]});
  });
  $("#noticeLocal").addEventListener("change",async event=>{
    const key=noticeStorageKey();
    let enabled=event.target.checked;
    if(enabled){
      try{enabled=typeof globalThis.Notification?.requestPermission==="function"&&await Notification.requestPermission()==="granted";}
      catch{enabled=false;}
    }
    if(key!==noticeStorageKey())return;
    if(event.target.checked&&!enabled)toast("Trình duyệt chưa cấp quyền thông báo.");
    saveNoticePreferences(key,{...noticePreferences(key),local:enabled});
  });
  document.addEventListener("visibilitychange",()=>{if(!document.hidden)renderNotificationCenter();});
}
