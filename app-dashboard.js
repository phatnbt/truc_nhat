async function cleanupAudit(){if(!requireAdmin())return;if(!confirm("Xóa tất cả nhật ký cũ hơn 30 ngày? Nhật ký trong 30 ngày gần nhất vẫn được giữ."))return;try{const result=await realtimeEngine?.cleanupAuditLogs(30);toast(`Đã dọn ${result?.deletedCount||0} nhật ký cũ`);await forceSync();}catch(e){toast(e?.message||"Không thể dọn nhật ký",6000);}}

function renderHome(){
  const bill=currentBill()||{people:[],electricity:0,water:0,month:state.billing.selectedMonth,closed:false},calc=billCalc(bill),schedule=currentSchedule(),taskTotal=schedule?.assignments.filter(a=>!a.cut).length||0,taskDone=schedule?.assignments.filter(a=>!a.cut&&a.completed).length||0,present=state.members.filter(m=>state.presence[m.id]!==false).length,unpaidPeople=calc.people.filter(p=>(calc.due[p.id]||0)>0&&!isBillPaid(p,calc.due[p.id]||0)),unpaid=unpaidPeople.reduce((sum,p)=>sum+(calc.due[p.id]||0),0),submitted=taskSubmissions.filter(s=>s.status==="submitted").length;
  $("#kpiMembers").textContent=state.members.length;$("#kpiPresent").textContent=`${present} có mặt`;
  $("#kpiTasks").textContent=`${taskDone}/${taskTotal}`;$("#kpiTaskHint").textContent=schedule?`${weekRange(schedule.weekStart)}`:"Chưa có lịch";
  $("#kpiUnpaid").textContent=money(unpaid);$("#kpiUnpaidPeople").textContent=`${unpaidPeople.length} người chưa đóng`;
  $("#kpiPending").textContent=isAdmin()?accessRequests.length+submitted:0;$("#kpiPendingHint").textContent=isAdmin()?`${accessRequests.length} tài khoản · ${submitted} việc` : "—";
  const manager=[];
  if(accessRequests.length)manager.push({icon:"👤",title:`${accessRequests.length} yêu cầu tham gia đang chờ`,detail:"Mở Tài khoản để duyệt và liên kết đúng thành viên.",action:"account",label:"Duyệt"});
  const pendingTasks=taskSubmissions.filter(s=>s.status==="submitted");if(pendingTasks.length)manager.push({icon:"🧹",title:`${pendingTasks.length} công việc chờ xác nhận`,detail:"Thành viên đã báo hoàn thành.",action:"cleaning",label:"Kiểm tra"});
  if(bill.closed&&unpaidPeople.length)manager.push({icon:"💰",title:`Còn ${money(unpaid)} chưa thu`,detail:`${unpaidPeople.map(p=>p.name).slice(0,3).join(", ")}${unpaidPeople.length>3?"…":""}`,action:"billing",label:"Thu tiền"});
  if(calc.people.length&& !bill.closed)manager.push({icon:"🔓",title:`${monthLabel(bill.month)} chưa chốt sổ`,detail:"Kiểm tra ngày ở và hóa đơn trước khi chốt.",action:"billing",label:"Xem"});
  $("#managerActionList").innerHTML=manager.length?manager.map((item,i)=>`<div class="action-item"><span class="action-icon">${item.icon}</span><span><b>${esc(item.title)}</b><small>${esc(item.detail)}</small></span><button class="btn small soft" data-manager-action="${i}" type="button">${esc(item.label)}</button></div>`).join(""):'<div class="empty">Không có việc quản trị cần xử lý.</div>';
  $$('[data-manager-action]').forEach(btn=>btn.addEventListener("click",()=>{const item=manager[Number(btn.dataset.managerAction)];if(item.action==="account"){renderAccessModal();openModal("accessModal");}else showPage(item.action);}));
  const reminders=[];
  if(authSession.status==="active"){
    const myId=myMemberId();if(myId&&schedule){schedule.assignments.forEach((a,index)=>{if(a.personId!==myId||a.cut||a.completed)return;const sub=submissionFor(schedule,a);reminders.push({icon:sub?.status==="submitted"?"⏳":"🧹",title:sub?.status==="submitted"?`${a.task}: đang chờ xác nhận`:`Bạn có việc: ${a.task}`,detail:weekRange(schedule.weekStart),action:"cleaning",label:"Mở"});});}
    if(myId){const mine=calc.people.find(p=>p.memberId===myId);if(mine&&(calc.due[mine.id]||0)>0&&!isBillPaid(mine,calc.due[mine.id]||0))reminders.push({icon:"💳",title:`Điện nước: ${money(calc.due[mine.id])}`,detail:bill.closed?"Tháng đã chốt · chưa ghi nhận thanh toán":"Số tiền tạm tính",action:"billing",label:"Xem"});}
  }
  if(isAdmin()&&!reminders.length)reminders.push({icon:"✅",title:"Không có nhắc việc cá nhân",detail:"Các việc quản trị nằm ở cột bên trái.",action:null,label:null});
  $("#personalReminderList").innerHTML=reminders.length?reminders.map((r,i)=>`<div class="action-item"><span class="action-icon">${r.icon}</span><span><b>${esc(r.title)}</b><small>${esc(r.detail)}</small></span>${r.action?`<button class="btn small" data-reminder-action="${i}" type="button">${r.label}</button>`:""}</div>`).join(""):'<div class="empty">Bạn chưa có việc cần nhắc.</div>';
  $$('[data-reminder-action]').forEach(btn=>btn.addEventListener("click",()=>showPage(reminders[Number(btn.dataset.reminderAction)].action)));
}
