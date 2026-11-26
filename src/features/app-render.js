let cleaningTaskPress=null;
let cleaningRenderQueued=false;
let cleaningScheduleMarkup="";
let cleaningMemberMarkup="";
function cleaningTaskKey(assignment,index){
  return `${assignment.taskId}:${assignment.personId}:${index}`;
}

function renderCleaning(){
  // An incoming snapshot can move a pressed button before the browser delivers its click.
  if(cleaningTaskPress){cleaningRenderQueued=true;return;}
  cleaningRenderQueued=false;
  const list=$("#cleanMemberList");if(!list)return;
  const memberMarkup=state.members.length?state.members.map(m=>{
    const mine=m.id===myMemberId(),editable=canEditMember(m.id);
    const totalPoints=historicalPoints(m.id);
    const pointText=isAdmin()?` · <b>${formatCleaningPoints(totalPoints)} điểm</b>`:"";
    return `<div class="member-row"><button class="presence ${state.presence[m.id]===false?"off":""}" data-presence="${m.id}" type="button" ${editable?"":"disabled"} aria-label="${state.presence[m.id]===false?"Đánh dấu có mặt":"Đánh dấu vắng"}: ${esc(m.name)}"></button><div><b>${esc(m.name)} ${mine?'<span class="badge success">Bạn</span>':""}</b><small>${state.presence[m.id]===false?"⚪ Vắng":"🟢 Có mặt"}${pointText}${editable?"":" · Chỉ xem"}</small></div>${isAdmin()?`<button class="btn small danger" data-remove-member="${m.id}" type="button">Xóa</button>`:""}</div>`;
  }).join(""):'<div class="empty">Chưa có thành viên.</div>';
  if(cleaningMemberMarkup!==memberMarkup){
    cleaningMemberMarkup=memberMarkup;
    list.innerHTML=memberMarkup;
    list.querySelectorAll('[data-presence]').forEach(btn=>btn.addEventListener("click",()=>togglePresence(btn.dataset.presence)));
    list.querySelectorAll('[data-remove-member]').forEach(btn=>btn.addEventListener("click",()=>removeMember(btn.dataset.removeMember)));
  }

  const s=currentSchedule(),box=$("#cleanScheduleBox");
  $("#manualScheduleButton").disabled=!!s?.locked;
  renderRoomCalendar();
  if(!s){
    cleaningScheduleMarkup="";
    delete box.dataset.scheduleId;
    box.innerHTML=`<div class="empty" style="margin-top:14px">${isAdmin()?"Chọn tuần rồi tạo lịch công bằng.":"Trưởng phòng chưa tạo lịch."}</div>`;
  }else{
    const done=s.assignments.filter(a=>!a.cut&&a.completed).length,total=s.assignments.filter(a=>!a.cut).length;
    const replacements=isAdmin()&&s===roomScheduleToday()?suggestReplacements(s):{};
    const filter=$("#cleanFilter").value;
    const rows=s.assignments.map((a,index)=>{
      if(filter==="mine"&&(a.cut||a.personId!==myMemberId()))return "";
      if(filter==="pending"&&(a.cut||a.completed))return "";
      const sub=submissionFor(s,a),mine=a.personId===myMemberId();let action="—";
      if(!a.cut){
        if(a.completed){
          const confirmed='<span class="badge success">✅ Đã xác nhận</span>';
          action=isAdmin()&&a.personId?`<div class="task-actions">${confirmed}<button class="btn small danger" data-reopen-task="${index}" data-schedule-version="${esc(s.updatedAt||"")}" type="button">Yêu cầu làm lại</button></div>`:confirmed;
        }
        else if(sub?.status==="approved")action=isAdmin()?`<button class="btn small soft" data-admin-task="${index}" type="button">Đồng bộ trạng thái</button>`:'<span class="badge success">✅ Đã duyệt · chờ đồng bộ</span>';
        else if(isAdmin()&&sub?.status==="submitted"){
          const review=`data-review-id="${esc(sub.id)}" data-review-version="${esc(`${sub.submittedAt?.seconds}:${sub.submittedAt?.nanoseconds}`)}"`;
          action=`<div class="task-actions"><button class="btn small green" ${review} data-review-approve="${index}" type="button">Xác nhận</button><button class="btn small danger" ${review} data-review-reject="${index}" type="button">Làm lại</button></div>`;
        }
        else if(isAdmin())action=`<button class="btn small soft" data-admin-task="${index}" type="button">Đánh dấu xong</button>`;
        else if(mine&&sub?.status==="submitted")action='<span class="badge warning">⏳ Chờ xác nhận</span>';
        else if(mine)action=`<div class="task-actions">${sub?"":`<button class="btn small soft" data-start-task="${index}" type="button">Bắt đầu</button><button class="btn small" data-swap-task="${index}" type="button">Đổi việc</button>`}<button class="btn small primary" data-submit-task="${index}" type="button">✓ Tôi đã làm</button></div>`;
        else action='<span class="badge">Chỉ xem</span>';
      }
      const overdue=dateValue(addDays(parseDate(s.weekStart),6))<P708BillingCycle.roomDateKey();
      const status=a.cut?"Được miễn":a.completed?"Đã xong":sub?.status==="approved"?"Đã duyệt · chưa khớp lịch":sub?.status==="submitted"?"Chờ xác nhận":sub?.status==="rejected"||a.needsRedo?"Cần làm lại":overdue?"Quá hạn":sub?.status==="in_progress"?"Đang thực hiện":"Chưa thực hiện";
      const suggestion=replacements[a.taskId];
      const task=TASKS.find(t=>t.id===a.taskId);
      const weight=P708CleaningFairness.effectiveTaskWeight(a.taskId,state.settings.weights,task?.w);
      return `<tr data-task-key="${esc(cleaningTaskKey(a,index))}" class="${mine?"own-task ":""}${a.completed?"done-row":sub?.status==="submitted"?"submitted-row":""}"><td data-label="Công việc"><div><b>${task?.emoji||""} ${esc(a.task)}</b>${a.cut?"":`<small class="task-weight">${formatCleaningPoints(weight)} điểm${mine?" · Việc của bạn":""}</small>`}</div></td><td data-label="Phụ trách"><div class="task-assignee">${a.cut?'<span class="unpaid-text">Tạm cắt</span>':`<span class="task-initial" aria-hidden="true">${esc((a.personName||"?").trim().split(/\\s+/).pop()?.charAt(0)||"?")}</span>${esc(a.personName)}`}${a.reassigned?" · Đã đổi":""}${suggestion?`<small class="replacement-hint">Đề xuất: ${esc(suggestion)}</small>`:""}</div></td><td data-label="Trạng thái">${esc(status)}</td><td data-label="Thao tác">${action}</td></tr>`;
    }).join("");
    const mine=s.assignments.filter(a=>!a.cut&&a.personId===myMemberId());
    const heading=`<div class="schedule-head"><div><h3>${weekRange(s.weekStart)}</h3><p>${s.absentNames?.length?`Vắng: ${esc(s.absentNames.join(", "))}`:"Tất cả thành viên có mặt"}</p>${mine.length?`<p>Việc của bạn: ${mine.filter(a=>a.completed).length}/${mine.length}</p>`:""}</div><span class="badge ${done===total&&total?"success":""}">${done}/${total} xác nhận</span></div>`;
    const table=rows?`<div class="table-wrap"><table><thead><tr><th>Công việc</th><th>Phụ trách</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>${rows}</tbody></table></div>`:'<p class="empty">Không có công việc khớp bộ lọc.</p>';
    const markup=`<div class="schedule-card">${heading}${table}</div>`;
    if(box.dataset.scheduleId!==s.id||cleaningScheduleMarkup!==markup){
      box.dataset.scheduleId=s.id;
      cleaningScheduleMarkup=markup;
      box.innerHTML=markup;
    }
  }
  const swaps=taskSwaps.filter(item=>item.scheduleId===s?.id);
  $("#taskSwapList").innerHTML=swaps.length?swaps.map(item=>{
    const name=id=>state.members.find(member=>member.id===id)?.name||"Thành viên";
    const task=id=>TASKS.find(task=>task.id===id)?.name||"Công việc";
    const status={pending:"Chờ duyệt",approved:"Đã đổi",rejected:"Đã từ chối"}[item.status];
    return `<div class="room-presence"><div><b>${esc(name(item.memberId))} · ${esc(task(item.taskId))}</b><div>↔ ${esc(name(item.otherMemberId))} · ${esc(task(item.otherTaskId))}</div><small>${esc(status)}</small></div>${isAdmin()&&item.status==="pending"?`<div class="task-actions"><button class="btn small primary" data-review-swap="${esc(item.id)}" data-approved="true" type="button">Duyệt đổi</button><button class="btn small" data-review-swap="${esc(item.id)}" type="button">Từ chối</button></div>`:""}</div>`;
  }).join(""):'<p class="empty">Chưa có yêu cầu đổi việc.</p>';
  $$("[data-review-swap]").forEach(button=>button.addEventListener("click",async()=>{
    button.disabled=true;
    try{await realtimeEngine.reviewTaskSwap(button.dataset.reviewSwap,button.dataset.approved==="true");toast("Đã xử lý yêu cầu");}
    catch(e){toast(e.message);}
    finally{button.disabled=false;}
  }));
  renderCleaningHistory();
  runOptionalFeature("pet-cleaning",globalThis.P708PetWidget?.decorateMemberRows);
  runOptionalFeature("pet-widget",globalThis.P708PetWidget?.refresh);
}

function renderCleaningHistory(){
  const query=$("#cleanHistorySearch").value.trim();
  const schedules=state.schedules.filter(item=>!query||item.weekStart.includes(query)||weekRange(item.weekStart).includes(query));
  $("#cleanHistory").innerHTML=schedules.length?schedules.sort((a,b)=>b.weekStart.localeCompare(a.weekStart)).map(x=>`<button class="history-btn ${x.id===ui.selectedScheduleId?"active":""}" data-schedule-id="${esc(x.id)}" type="button">${weekRange(x.weekStart)}</button>`).join(""):'<div class="empty">Không tìm thấy lịch trực.</div>';
  $$('[data-schedule-id]').forEach(btn=>btn.addEventListener("click",()=>selectSchedule(btn.dataset.scheduleId)));
}

function renderCleaningRules(){
  const list=$("#cleaningRulesTaskList");
  if(!list)return;
  list.innerHTML=TASKS.map(task=>{
    const configured=Number(state.settings?.weights?.[task.id]);
    const points=Number.isFinite(configured)&&configured>=0?configured:task.w;
    return `<div class="cleaning-rule-row"><span class="cleaning-rule-icon" aria-hidden="true">${task.emoji}</span><b>${esc(task.name)}</b><span class="cleaning-rule-points">${formatCleaningPoints(points)} điểm</span></div>`;
  }).join("");
}

function paymentLabel(person,due){
  const status=billPaymentState(person,due);
  return status==="none"?"Không phát sinh":status==="paid"?"Đã đóng":"Chưa đóng";
}
function paymentMarkup(person,due){
  const status=billPaymentState(person,due);
  const partial=Math.min(due,Number(person.paidAmount)||0);
  if(status==="unpaid"&&partial>0)return `<span>Đã thu ${money(partial)} · Còn ${money(due-partial)}</span>`;
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
  $("#billRangePanel").hidden=!editable;
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

const auditDateFormat=new Intl.DateTimeFormat("vi-VN",{timeZone:"Asia/Ho_Chi_Minh",day:"2-digit",month:"2-digit",year:"numeric"});
const auditClockFormat=new Intl.DateTimeFormat("vi-VN",{timeZone:"Asia/Ho_Chi_Minh",hour:"2-digit",minute:"2-digit",hour12:false});
const auditPageSize=12;
const auditVisibleCounts=new Map();
let previousAuditFilters="";
function renderAudit(){
  const groups=$("#auditGroups");
  if(!groups)return;
  if(!isAdmin()){groups.replaceChildren();auditVisibleCounts.clear();return;}
  const filterKey=JSON.stringify(auditFilters),filtersChanged=filterKey!==previousAuditFilters;
  previousAuditFilters=filterKey;
  if(filtersChanged)auditVisibleCounts.clear();
  const existing=new Map(Array.from(groups.querySelectorAll(".audit-group"),group=>[group.dataset.auditActor,group.open]));
  const logs=filteredLogs(),actorMap=new Map(),allActors=new Map();
  for(const log of logs){
    const key=auditActorKey(log);
    if(!actorMap.has(key))actorMap.set(key,{key,name:auditActorName(log),email:log.actorEmail||"",logs:[]});
    actorMap.get(key).logs.push(log);
  }
  for(const log of auditLogs)allActors.set(auditActorKey(log),auditActorName(log));
  const actions=[...new Set(auditLogs.map(log=>log.action||"UPDATE_DATA"))].sort();
  const memberSelect=$("#auditMemberFilter"),actionSelect=$("#auditActionFilter");
  const allOption='<option value="all">Tất cả</option>';
  memberSelect.innerHTML=allOption+[...allActors].map(([key,name])=>`<option value="${esc(key)}">${esc(name)}</option>`).join("");
  actionSelect.innerHTML=allOption+actions.map(action=>`<option value="${esc(action)}">${esc(auditActionLabel(action))}</option>`).join("");
  memberSelect.value=auditFilters.member;actionSelect.value=auditFilters.action;
  if($("#auditSearch").value!==auditFilters.query)$("#auditSearch").value=auditFilters.query;
  $("#auditStatTotal").textContent=logs.length;
  $("#auditStatActors").textContent=actorMap.size;
  $("#auditStatLatest").textContent=logs[0]?auditDateFormat.format(auditTimeMs(logs[0])):"—";
  groups.innerHTML=actorMap.size?[...actorMap.values()].map((actor,index)=>{
    const open=!filtersChanged&&existing.has(actor.key)?existing.get(actor.key):index===0;
    const visible=auditVisibleCounts.get(actor.key)||auditPageSize;
    const entries=actor.logs.slice(0,visible).map(log=>{
      const time=auditTimeMs(log),label=auditActionLabel(log.action);
      return `<li class="audit-item"><time class="audit-time" datetime="${new Date(time).toISOString()}">${auditDateFormat.format(time)} <span>${auditClockFormat.format(time)}</span></time><div><b>${esc(log.summary||label)}</b><small>${esc(label)}</small></div></li>`;
    }).join("");
    const more=actor.logs.length-visible;
    return `<details class="audit-group" data-audit-actor="${esc(actor.key)}" ${open?"open":""}><summary><span class="avatar" aria-hidden="true">${esc(actor.name.charAt(0).toUpperCase())}</span><span class="audit-actor"><b>${esc(actor.name)}</b>${actor.email?`<small>${esc(actor.email)}</small>`:""}</span><span class="audit-count">${actor.logs.length} mục</span></summary><ol class="audit-timeline">${entries}</ol>${more>0?`<button type="button" class="btn small audit-more" data-audit-more="${esc(actor.key)}">Xem thêm (${more})</button>`:""}</details>`;
  }).join(""):'<div class="empty">Không tìm thấy hoạt động phù hợp.</div>';
}

function renderSync(){
  const home=$("#homeSyncText");if(home)home.textContent=`Phòng ${ROOM_CODE} · ${syncStatus.text}`;
  ["#homeSyncButton","#cleanSyncButton","#billSyncButton","#auditSyncButton"].forEach(id=>{const el=$(id);if(el)el.disabled=syncStatus.mode==="syncing";});
}
function renderAll(){
  state=normalizeState(state);ui.selectedMonth=state.billing.selectedMonth;
  renderPermission();renderAccountButton();renderHome();renderCleaning();renderCleaningRules();renderBilling();renderRoomResources();
  if(document.body.dataset.page==="audit"||!isAdmin())renderAudit();
  if($("#accessModal").classList.contains("show"))renderAccessModal();
  renderSync();saveLocal();renderOptionalNotifications();
  runOptionalFeature("install-guide",globalThis.P708RefreshInstallGuide);
}
