function renderCleaning(){
  const list=$("#cleanMemberList");if(!list)return;
  list.innerHTML=state.members.length?state.members.map(m=>{
    const mine=m.id===myMemberId(),editable=canEditMember(m.id);
    return `<div class="member-row"><button class="presence ${state.presence[m.id]===false?"off":""}" data-presence="${m.id}" type="button" ${editable?"":"disabled"} aria-label="${state.presence[m.id]===false?"Đánh dấu có mặt":"Đánh dấu vắng"}: ${esc(m.name)}"></button><div><b>${esc(m.name)} ${mine?'<span class="badge success">Bạn</span>':""}</b><small>${state.presence[m.id]===false?"⚪ Vắng":"🟢 Có mặt"}${editable?"":" · Chỉ xem"}</small></div>${isAdmin()?`<button class="btn small danger" data-remove-member="${m.id}" type="button">Xóa</button>`:""}</div>`;
  }).join(""):'<div class="empty">Chưa có thành viên.</div>';
  $$('[data-presence]').forEach(btn=>btn.addEventListener("click",()=>togglePresence(btn.dataset.presence)));
  $$('[data-remove-member]').forEach(btn=>btn.addEventListener("click",()=>removeMember(btn.dataset.removeMember)));

  const s=currentSchedule(),box=$("#cleanScheduleBox");
  if(!s){
    box.innerHTML=`<div class="empty" style="margin-top:14px">${isAdmin()?"Chọn tuần rồi tạo lịch công bằng.":"Trưởng phòng chưa tạo lịch."}</div>`;
  }else{
    const done=s.assignments.filter(a=>!a.cut&&a.completed).length,total=s.assignments.filter(a=>!a.cut).length;
    const rows=s.assignments.map((a,index)=>{
      const sub=submissionFor(s,a),mine=a.personId===myMemberId();let action="—";
      if(!a.cut){
        if(a.completed)action='<span class="badge success">✅ Đã xác nhận</span>';
        else if(sub?.status==="approved")action=isAdmin()?`<button class="btn small soft" data-admin-task="${index}" type="button">Đồng bộ trạng thái</button>`:'<span class="badge success">✅ Đã duyệt · chờ đồng bộ</span>';
        else if(isAdmin()&&sub?.status==="submitted")action=`<div class="task-actions"><button class="btn small green" data-review-approve="${index}" type="button">Xác nhận</button><button class="btn small danger" data-review-reject="${index}" type="button">Làm lại</button></div>`;
        else if(isAdmin())action=`<button class="btn small soft" data-admin-task="${index}" type="button">Đánh dấu xong</button>`;
        else if(mine&&sub?.status==="submitted")action='<span class="badge warning">⏳ Chờ xác nhận</span>';
        else if(mine)action=`<button class="btn small primary" data-submit-task="${index}" type="button">✓ Tôi đã làm</button>`;
        else action='<span class="badge">Chỉ xem</span>';
      }
      const status=a.cut?"—":a.completed?"Đã xong":sub?.status==="approved"?"Đã duyệt · chưa khớp lịch":sub?.status==="submitted"?"Đã báo hoàn thành":sub?.status==="rejected"?"Cần làm lại":"Chưa xong";
      return `<tr class="${a.completed?"done-row":sub?.status==="submitted"?"submitted-row":""}"><td data-label="Công việc"><b>${TASKS.find(t=>t.id===a.taskId)?.emoji||""} ${esc(a.task)}</b></td><td data-label="Phụ trách">${a.cut?'<span class="unpaid-text">Tạm cắt</span>':esc(a.personName)}</td><td data-label="Trạng thái">${esc(status)}</td><td data-label="Thao tác">${action}</td></tr>`;
    }).join("");
    box.innerHTML=`<div class="schedule-card"><div class="schedule-head"><div><h3>${weekRange(s.weekStart)}</h3><p>${s.absentNames?.length?`Vắng: ${esc(s.absentNames.join(", "))}`:"Tất cả thành viên có mặt"}</p></div><span class="badge ${done===total&&total?"success":""}">${done}/${total} xác nhận</span></div><div class="table-wrap"><table><thead><tr><th>Công việc</th><th>Phụ trách</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
    $$('[data-submit-task]').forEach(btn=>btn.addEventListener("click",()=>submitTask(Number(btn.dataset.submitTask))));
    $$('[data-review-approve]').forEach(btn=>btn.addEventListener("click",()=>reviewTask(Number(btn.dataset.reviewApprove),true)));
    $$('[data-review-reject]').forEach(btn=>btn.addEventListener("click",()=>reviewTask(Number(btn.dataset.reviewReject),false)));
    $$('[data-admin-task]').forEach(btn=>btn.addEventListener("click",()=>adminToggleTask(Number(btn.dataset.adminTask))));
  }
  $("#cleanHistory").innerHTML=state.schedules.length?[...state.schedules].sort((a,b)=>b.weekStart.localeCompare(a.weekStart)).map(x=>`<button class="history-btn ${x.id===ui.selectedScheduleId?"active":""}" data-schedule-id="${x.id}" type="button">${weekRange(x.weekStart)}</button>`).join(""):'<div class="empty">Chưa có lịch sử.</div>';
  $$('[data-schedule-id]').forEach(btn=>btn.addEventListener("click",()=>selectSchedule(btn.dataset.scheduleId)));
}

function paymentLabel(person,due){
  const status=billPaymentState(person,due);
  return status==="none"?"Không phát sinh":status==="paid"?"Đã đóng":"Chưa đóng";
}
function paymentMarkup(person,due){
  const status=billPaymentState(person,due);
  if(status==="none")return '<span class="badge">— Không phát sinh</span>';
  return status==="paid"?'<span class="paid-text">✅ Đã đóng</span>':'<span class="unpaid-text">🔴 Chưa đóng</span>';
}
function renderBilling(){
  const b=currentBill()||{month:state.billing.selectedMonth,electricity:0,water:0,closed:false,people:[]},c=billCalc(b);
  let p=activeBillPerson(currentBill());
  if(!isAdmin()&&myMemberId()){
    const own=c.people.find(x=>x.memberId===myMemberId());
    if(own&&(!p||!canEditBillingPerson(p))){ui.activeBillPersonId=own.id;p=own;}
  }
  $("#billMonth").value=b.month;
  $("#billElectricity").value=b.electricity||"";$("#billWater").value=b.water||"";
  $("#billTotalDays").textContent=c.totalDays;$("#billTotalMoney").textContent=money(b.electricity+b.water);
  $("#billClosedBadge").textContent=b.closed?"🔒 Đã chốt":"Đang mở";$("#billClosedBadge").className=`badge ${b.closed?"warning":"success"}`;

  $("#billPeopleList").innerHTML=c.people.length?c.people.map(x=>{
    const due=c.due[x.id]||0;
    return `<button class="person-pick ${p?.id===x.id?"active":""}" data-person="${x.id}" type="button"><span class="avatar">${esc(x.name.charAt(0).toUpperCase())}</span><span><b>${esc(x.name)}${x.memberId===myMemberId()?" · Bạn":""}</b><small>${stayCount(x,b)} ngày · ${esc(paymentLabel(x,due))}</small></span><span class="person-amount">${money(due)}</span></button>`;
  }).join(""):'<div class="empty">Chưa có người trong tháng.</div>';
  $$('[data-person]').forEach(btn=>btn.addEventListener("click",()=>selectBillPerson(btn.dataset.person)));

  const editable=canEditBillingPerson(p)&&!b.closed;
  $("#calendarPersonTitle").textContent=p?`Lịch ở của ${p.name}`:"Chọn một người";
  $("#calendarPersonHint").textContent=p?(editable?"Bấm từng ngày hoặc chọn khoảng ngày.":"Chỉ xem — bạn không thể sửa người này."):"Chọn người ở danh sách bên trái.";
  $("#billRangePanel").style.display=editable?"block":"none";
  const [y,m]=String(b.month).split("-").map(Number),n=monthDays(b.month),first=n?(new Date(y,m-1,1).getDay()+6)%7:0;
  let cells="";for(let i=0;i<first;i++)cells+='<span class="day-cell blank"></span>';
  for(let d=1;d<=n;d++){
    const stay=!!p?.days?.[String(d)];
    cells+=`<button class="day-cell ${stay?"stay":""}" data-day="${d}" type="button" ${p&&editable?"":"disabled"} aria-pressed="${stay}"><b>${d}</b><small>${stay?"✓ Có ở":"Vắng"}</small></button>`;
  }
  $("#billCalendar").innerHTML=cells;
  $$('[data-day]').forEach(btn=>btn.addEventListener("click",()=>setBillDay(Number(btn.dataset.day))));
  if(p){
    const due=c.due[p.id]||0,status=billPaymentState(p,due),suffix=status==="none"?" · Không phát sinh":status==="paid"?" · ✅ Đã đóng":" · 🔴 Chưa đóng";
    $("#billPersonSummary").innerHTML=`<b>${esc(p.name)}</b><span>${stayCount(p,b)} ngày · ${money(due)}${suffix}</span>`;
  }else $("#billPersonSummary").innerHTML='<b>Chưa chọn người</b><span>0 ngày</span>';

  const min=`${b.month}-01`,max=`${b.month}-${String(n||1).padStart(2,"0")}`;
  ["#stayFrom","#stayTo"].forEach(id=>{
    const el=$(id);if(!el)return;el.min=min;el.max=max;el.disabled=!editable;
    if(!el.value||!el.value.startsWith(b.month))el.value=id==="#stayFrom"?min:max;
  });
  $("#billCloseButton").textContent=b.closed?"🔓 Mở khóa":"🔒 Chốt sổ";

  const rows=c.people.length?c.people.map(x=>{
    const due=c.due[x.id]||0,status=billPaymentState(x,due),button=status==="none"?'<span class="badge">—</span>':`<button class="btn small ${status==="paid"?"":"green"} payment-button" data-payment="${x.id}" type="button">${status==="paid"?"Hủy đã đóng":"Đã thu tiền"}</button>`;
    return `<tr><td data-label="Tên"><b>${esc(x.name)}</b></td><td data-label="Ngày ở">${stayCount(x,b)}</td><td data-label="Điện">${money(c.electric[x.id])}</td><td data-label="Nước">${money(c.water[x.id])}</td><td data-label="Tổng"><b>${money(due)}</b></td><td data-label="Thanh toán">${paymentMarkup(x,due)}</td><td data-label="Thao tác">${isAdmin()?button:"—"}</td></tr>`;
  }).join(""):'<tr><td colspan="7">Chưa có dữ liệu.</td></tr>';
  const collected=c.people.reduce((sum,x)=>{
    const due=c.due[x.id]||0;return sum+(billPaymentState(x,due)==="paid"?due:Math.min(Math.max(0,Number(x.paidAmount)||0),due));
  },0);
  $("#billingTable").innerHTML=`<table><thead><tr><th>Tên</th><th>Ngày</th><th>Điện</th><th>Nước</th><th>Tổng</th><th>Thanh toán</th><th></th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td data-label="Tổng"><b>TỔNG</b></td><td data-label="Ngày">${c.totalDays}</td><td data-label="Điện">${money(b.electricity)}</td><td data-label="Nước">${money(b.water)}</td><td data-label="Tổng">${money(b.electricity+b.water)}</td><td data-label="Đã thu"><b>${money(collected)}</b></td><td data-label="Còn thiếu"><b>${money(Math.max(0,b.electricity+b.water-collected))}</b></td></tr></tfoot></table>`;
  $$('[data-payment]').forEach(btn=>btn.addEventListener("click",()=>togglePayment(btn.dataset.payment)));
}

function renderAudit(){
  if(!isAdmin())return;
  const logs=filteredLogs(),actorMap=new Map();
  logs.forEach(l=>{const key=auditActorKey(l);if(!actorMap.has(key))actorMap.set(key,{key,name:auditActorName(l),email:l.actorEmail||"",logs:[]});actorMap.get(key).logs.push(l);});
  const allActors=new Map();auditLogs.forEach(l=>{const key=auditActorKey(l);if(!allActors.has(key))allActors.set(key,auditActorName(l));});
  const actions=[...new Set(auditLogs.map(l=>l.action||"UPDATE_DATA"))].sort(),memberSelect=$("#auditMemberFilter"),actionSelect=$("#auditActionFilter");
  if(!memberSelect||!actionSelect)return;
  memberSelect.innerHTML=`<option value="all">Tất cả</option>${[...allActors].map(([key,name])=>`<option value="${esc(key)}">${esc(name)}</option>`).join("")}`;
  actionSelect.innerHTML=`<option value="all">Tất cả</option>${actions.map(a=>`<option value="${esc(a)}">${esc(auditActionLabel(a))}</option>`).join("")}`;
  memberSelect.value=auditFilters.member;actionSelect.value=auditFilters.action;$("#auditSearch").value=auditFilters.query;
  $("#auditStatTotal").textContent=logs.length;$("#auditStatActors").textContent=actorMap.size;$("#auditStatLatest").textContent=logs[0]?new Date(auditTimeMs(logs[0])).toLocaleDateString("vi-VN"):"—";
  $("#auditGroups").innerHTML=actorMap.size?[...actorMap.values()].map((actor,index)=>`<details class="audit-group" ${index===0?"open":""}><summary><span class="avatar">${esc(actor.name.charAt(0).toUpperCase())}</span><span><b>${esc(actor.name)}</b><small>${esc(actor.email||"Không hiển thị email")}</small></span><span class="audit-count">${actor.logs.length} log</span></summary><div class="audit-timeline">${actor.logs.map(log=>{const d=new Date(auditTimeMs(log));return `<div class="audit-item"><span class="audit-time">${d.toLocaleDateString("vi-VN")}<br>${d.toLocaleTimeString("vi-VN",{hour:"2-digit",minute:"2-digit"})}</span><span><b>${esc(log.summary||auditActionLabel(log.action))}</b><small>${esc(auditActionLabel(log.action))}</small></span></div>`;}).join("")}</div></details>`).join(""):'<div class="empty">Không có nhật ký phù hợp.</div>';
}

function renderSync(){
  const home=$("#homeSyncText");if(home)home.textContent=`Phòng ${ROOM_CODE} · ${syncStatus.text}`;
  ["#homeSyncButton","#cleanSyncButton","#billSyncButton","#auditSyncButton"].forEach(id=>{const el=$(id);if(el)el.disabled=syncStatus.mode==="syncing";});
}
function renderAll(){
  state=normalizeState(state);ui.selectedMonth=state.billing.selectedMonth;
  renderPermission();renderAccountButton();renderHome();renderCleaning();renderBilling();renderAudit();renderAccessModal();renderSync();saveLocal();scheduleReminderNotifications();
}
