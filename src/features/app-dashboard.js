async function cleanupAudit(){
  if(!requireAdmin())return;
  if(!confirm("Xóa tất cả nhật ký cũ hơn 30 ngày? Nhật ký trong 30 ngày gần nhất vẫn được giữ."))return;
  try{
    const result=await realtimeEngine?.cleanupAuditLogs(30);
    toast(`Đã dọn ${result?.deletedCount||0} nhật ký cũ`);
    await forceSync();
  }catch(e){toast(e?.message||"Không thể dọn nhật ký",6000);}
}

function relevantTaskSubmissions(){
  return (taskSubmissions||[]).filter(sub=>{
    const schedule=state.schedules.find(s=>s.weekStart===sub.weekStart&&(!sub.scheduleId||s.id===sub.scheduleId));
    if(!schedule)return false;
    return (schedule.assignments||[]).some(a=>!a.cut&&a.taskId===sub.taskId&&a.personId===sub.memberId);
  });
}

function roomScheduleToday(){
  const today=P708BillingCycle.roomDateKey();
  return state.schedules.find(s=>s.weekStart<=today&&dateValue(addDays(parseDate(s.weekStart),6))>=today)||null;
}

function renderHome(){
  const bills=[...state.billing.months].sort((a,b)=>b.month.localeCompare(a.month));
  const bill=bills.find(item=>item.closed)||bills[0]||{people:[],electricity:0,water:0,month:state.billing.selectedMonth,closed:false};
  const calc=billCalc(bill),schedule=roomScheduleToday(),myId=myMemberId();
  const mine=myId?calc.people.find(p=>p.memberId===myId):null;
  const balance=person=>{
    if(!person)return 0;
    const due=calc.due[person.id]||0;
    return Math.max(0,due-Math.max(0,Number(person.paidAmount)||0));
  };
  const taskTotal=schedule?.assignments.filter(a=>!a.cut).length||0;
  const taskDone=schedule?.assignments.filter(a=>!a.cut&&a.completed).length||0;
  const present=state.members.filter(m=>state.presence[m.id]!==false).length;
  const unpaidPeople=calc.people.filter(p=>balance(p)>0);
  const unpaid=unpaidPeople.reduce((sum,p)=>sum+balance(p),0);
  const validSubmissions=relevantTaskSubmissions();
  const submitted=validSubmissions.filter(s=>s.status==="submitted").length;

  $("#homeDate").textContent=new Intl.DateTimeFormat("vi-VN",{dateStyle:"full",timeZone:"Asia/Ho_Chi_Minh"}).format(new Date());
  const displayName=authSession.access?.displayName||myMember()?.name;
  $("#homeGreeting").textContent=displayName?`P708 · ${displayName}`:"Phòng P708";
  $("#homePresence").innerHTML=state.members.length?state.members.map(member=>`<div class="room-presence"><b>${esc(member.name)}</b><span>${state.presence[member.id]===false?"Vắng":"Có mặt"}</span></div>`).join(""):'<p class="empty">Chưa có thành viên.</p>';
  const activity=isAdmin()?auditLogs.slice(0,4).map(item=>({label:item.summary,at:auditTimeMs(item)})):
    validSubmissions.filter(item=>item.memberId===myId&&item.status==="approved").slice(0,4).map(item=>({label:`Đã xác nhận: ${item.taskName}`,at:item.updatedAt?.toMillis?.()||0}));
  $("#homeActivity").innerHTML=activity.length?activity.map(item=>`<div class="room-presence"><b>${esc(item.label)}</b><span>${item.at?P708BillingCycle.roomDateKey(item.at):""}</span></div>`).join(""):'<p class="empty">Chưa có hoạt động.</p>';
  $("#kpiMembers").textContent=state.members.length;
  $("#kpiPresent").textContent=`${present} có mặt · ${state.members.length-present} vắng`;
  $("#kpiTasks").textContent=`${taskDone}/${taskTotal}`;
  $("#kpiTaskHint").textContent=schedule?weekRange(schedule.weekStart):"Chưa có lịch";
  $("#homeBalanceLabel").textContent=isAdmin()?"Còn phải thu":"Bạn còn phải đóng";
  $("#kpiUnpaid").textContent=bills.length?money(isAdmin()?unpaid:balance(mine)):"—";
  $("#kpiUnpaidPeople").textContent=bills.length?monthLabel(bill.month):"Chưa có hóa đơn";
  const pendingMine=validSubmissions.filter(sub=>myId&&sub.memberId===myId&&sub.status==="submitted").length;
  $("#kpiPending").textContent=isAdmin()?accessRequests.length+submitted:pendingMine;
  $("#kpiPendingHint").textContent=isAdmin()?`${accessRequests.length} tài khoản · ${submitted} việc`:"Việc chờ xác nhận";

  const manager=[];
  if(accessRequests.length)manager.push({
    icon:"👤",title:`${accessRequests.length} yêu cầu tham gia đang chờ`,
    detail:"Mở Tài khoản để duyệt và liên kết đúng thành viên.",action:"account",label:"Duyệt"
  });
  const pendingTasks=validSubmissions.filter(s=>s.status==="submitted");
  if(pendingTasks.length)manager.push({
    icon:"🧹",title:`${pendingTasks.length} công việc chờ xác nhận`,
    detail:"Thành viên đã báo hoàn thành.",action:"cleaning",label:"Kiểm tra"
  });
  if(bill.closed&&unpaidPeople.length)manager.push({
    icon:"💰",title:`Còn ${money(unpaid)} chưa thu`,
    detail:`${unpaidPeople.map(p=>p.name).slice(0,3).join(", ")}${unpaidPeople.length>3?"…":""}`,
    action:"billing",label:"Thu tiền"
  });
  if(calc.people.length&&!bill.closed)manager.push({
    icon:"🔓",title:`${monthLabel(bill.month)} chưa chốt sổ`,
    detail:"Kiểm tra ngày ở và hóa đơn trước khi chốt.",action:"billing",label:"Xem"
  });
  const integrityIssues=typeof reportDataIntegrity==="function"?reportDataIntegrity():[];
  if(integrityIssues.length)manager.unshift({
    icon:"⚠️",title:`${integrityIssues.length} vấn đề dữ liệu cần kiểm tra`,
    detail:integrityIssues.slice(0,2).join(" · "),action:"account",label:"Kiểm tra"
  });

  $("#managerActionList").innerHTML=manager.length
    ?manager.map((item,i)=>`<div class="action-item"><span class="action-icon">${item.icon}</span><span><b>${esc(item.title)}</b><small>${esc(item.detail)}</small></span><button class="btn small soft" data-manager-action="${i}" type="button">${esc(item.label)}</button></div>`).join("")
    :'<div class="empty">Không có việc quản trị cần xử lý.</div>';
  $$('[data-manager-action]').forEach(btn=>btn.addEventListener("click",()=>{
    const item=manager[Number(btn.dataset.managerAction)];
    if(item.action==="account"){renderAccessModal();openModal("accessModal");}
    else showPage(item.action);
  }));

  const reminders=[];
  if(authSession.status==="active"){
    const sharedReminder=state.settings?.cleaningReminder;
    if(myId&&sharedReminder?.memberIds?.includes(myId)){
      const reminderSchedule=state.schedules.find(item=>item.weekStart===sharedReminder.weekStart);
      const pending=(reminderSchedule?.assignments||[]).filter(assignment=>{
        if(assignment.personId!==myId||assignment.cut||assignment.completed)return false;
        const submission=submissionFor(reminderSchedule,assignment);
        return submission?.status!=="submitted"&&submission?.status!=="approved";
      });
      if(pending.length)reminders.push({
        icon:"🔔",title:`${sharedReminder.senderName||"Trưởng phòng"} nhắc bạn hoàn thành việc trực`,
        detail:`${pending.map(item=>item.task).join(" · ")} · ${weekRange(sharedReminder.weekStart)}`,
        action:"cleaning",label:"Xem việc"
      });
    }
    if(myId&&schedule){
      schedule.assignments.forEach((a,index)=>{
        if(a.personId!==myId||a.cut||a.completed)return;
        const sub=submissionFor(schedule,a);
        reminders.push({
          icon:sub?.status==="submitted"?"⏳":"🧹",
          title:sub?.status==="submitted"?`${a.task}: đang chờ xác nhận`:`Bạn có việc: ${a.task}`,
          detail:weekRange(schedule.weekStart),action:"cleaning",label:"Mở",scheduleId:schedule.id
        });
      });
    }
    if(myId){
      if(balance(mine)>0){
        reminders.push({
          icon:"💳",title:`Điện nước: ${money(balance(mine))}`,
          detail:bill.closed?"Kỳ đã chốt · số tiền còn lại":"Số tiền tạm tính",
          action:"billing",label:"Xem"
        });
      }
    }
  }
  if(isAdmin()&&!reminders.length)reminders.push({
    icon:"✅",title:"Không có nhắc việc cá nhân",detail:"Các việc quản trị nằm ở cột bên trái.",action:null,label:null
  });
  $("#personalReminderList").innerHTML=reminders.length
    ?reminders.map((r,i)=>`<div class="action-item"><span class="action-icon">${r.icon}</span><span><b>${esc(r.title)}</b><small>${esc(r.detail)}</small></span>${r.action?`<button class="btn small" data-reminder-action="${i}" type="button">${r.label}</button>`:""}</div>`).join("")
    :'<div class="empty">Bạn chưa có việc cần nhắc.</div>';
  $$('[data-reminder-action]').forEach(btn=>btn.addEventListener("click",()=>{
    const item=reminders[Number(btn.dataset.reminderAction)];
    if(item.scheduleId)selectSchedule(item.scheduleId);
    if(item.action==="billing")setBillMonth(bill.month);
    showPage(item.action);
  }));
}
