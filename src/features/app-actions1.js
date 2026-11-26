function cleaningPointsResetThrough(){
  return validDateKey(state.settings?.cleaningPointsResetThrough)?state.settings.cleaningPointsResetThrough:"";
}
function memberCleaningPoints(memberId,beforeWeek="9999-99-99"){
  const options={
    schedules:state.schedules,
    memberId,
    beforeWeek,
    afterWeek:cleaningPointsResetThrough(),
    weights:state.settings.weights
  };
  if(globalThis.P708CleaningFairness?.actualCleaningPoints)return globalThis.P708CleaningFairness.actualCleaningPoints(options);
  return state.schedules
    .filter(s=>s.weekStart<beforeWeek&&(!options.afterWeek||s.weekStart>options.afterWeek))
    .reduce((sum,s)=>sum+s.assignments
      .filter(a=>a.personId===memberId&&!a.cut)
      .reduce((z,a)=>z+(state.settings.weights[a.taskId]??3),0),0);
}
function historicalPoints(memberId,beforeWeek="9999-99-99"){
  const adjustment=P708CleaningFairness.cleaningPointAdjustment(state.settings?.cleaningPointAdjustments?.[memberId]);
  return memberCleaningPoints(memberId,beforeWeek)+adjustment;
}
function formatCleaningPoints(value){
  return new Intl.NumberFormat("vi-VN",{maximumFractionDigits:1}).format(Math.max(0,Number(value)||0));
}
async function resetAllCleaningPoints(){
  if(!requireAdmin())return;
  const latestWeek=state.schedules.reduce((latest,s)=>s.weekStart>latest?s.weekStart:latest,"");
  const hasAdjustment=Object.values(state.settings?.cleaningPointAdjustments||{}).some(value=>Number(value)>0);
  if(!latestWeek&&!hasAdjustment)return toast("Chưa có điểm trực nhật để reset");
  if(!confirm("Reset điểm trực nhật của tất cả thành viên về 0? Lịch sử phân công vẫn được giữ lại."))return;
  if(latestWeek)state.settings.cleaningPointsResetThrough=latestWeek;
  state.settings.cleaningPointsResetAt=nowIso();
  state.settings.cleaningPointAdjustments={};
  await persist("Đã reset điểm trực nhật",{
    action:"RESET_CLEANING_POINTS",
    summary:latestWeek?`Reset điểm trực nhật của tất cả thành viên qua tuần ${latestWeek}`:"Reset điểm cộng trực nhật của tất cả thành viên"
  });
}
function addMember(){
  if(!requireAdmin())return;
  const input=$("#cleanMemberName"),name=input.value.trim().replace(/\s+/g," ");
  if(!name)return toast("Nhập tên thành viên");
  if(name.length>80)return toast("Tên thành viên quá dài");
  if(state.members.some(m=>m.name.toLowerCase()===name.toLowerCase()))return toast("Tên này đã có");
  const t=nowIso(),m={id:uid(),name,createdAt:t,updatedAt:t};
  state.members.push(m);state.presence[m.id]=true;input.value="";
  persist("Đã thêm thành viên",{action:"ADD_MEMBER",summary:`Thêm thành viên ${name}`,targetMemberId:m.id});
}
function removeMember(memberId){
  if(!requireAdmin())return;
  const member=state.members.find(m=>m.id===memberId);
  if(!member)return;
  const linked=(accessAccounts||[]).filter(x=>x.memberId===memberId);
  if(linked.length)return toast(`${member.name} còn ${linked.length} tài khoản đang liên kết. Hãy gỡ/đổi liên kết trong Tài khoản trước.`,6000);
  if(!confirm(`Xóa ${member.name} khỏi danh sách thành viên? Dữ liệu hóa đơn cũ vẫn được giữ.`))return;
  state.members=state.members.filter(m=>m.id!==memberId);
  delete state.presence[memberId];
  persist("Đã xóa thành viên",{action:"REMOVE_MEMBER",summary:`Xóa thành viên ${member.name}`,targetMemberId:memberId});
}
function togglePresence(memberId){
  if(!canEditMember(memberId))return toast("Bạn chỉ được chỉnh trạng thái của chính mình");
  const member=state.members.find(m=>m.id===memberId),next=state.presence[memberId]===false;
  if(!member)return toast("Không tìm thấy thành viên");
  if(!next&&!confirm(`Đánh dấu ${isAdmin()?member.name:"bạn"} vắng?`))return;
  state.presence[memberId]=next;
  persist(next?"Đã đánh dấu có mặt":"Đã đánh dấu vắng",{
    action:"UPDATE_PRESENCE",summary:`${member.name}: ${next?"Có mặt":"Vắng"}`,targetMemberId:memberId
  });
}
function setAllPresent(){
  if(!requireAdmin())return;
  state.members.forEach(m=>state.presence[m.id]=true);
  persist("Đã đánh dấu tất cả có mặt",{action:"SET_ALL_PRESENCE",summary:"Đánh dấu tất cả có mặt"});
}
async function sendCleaningReminder(){
  if(!requireAdmin())return;
  const schedule=currentSchedule();
  if(!schedule)return toast("Chưa có lịch để nhắc");
  const pending=(schedule.assignments||[]).filter(assignment=>{
    if(!assignment?.personId||assignment.cut||assignment.completed)return false;
    const submission=submissionFor(schedule,assignment);
    return submission?.status!=="submitted"&&submission?.status!=="approved";
  });
  const memberIds=[...new Set(pending.map(assignment=>assignment.personId))];
  if(!memberIds.length)return toast("Không có thành viên nào còn việc cần nhắc");
  const names=memberIds.map(id=>state.members.find(member=>member.id===id)?.name).filter(Boolean);
  const preview=names.length<=4?names.join(", "):`${names.slice(0,4).join(", ")} và ${names.length-4} người khác`;
  if(!confirm(`Gửi nhắc việc trực tuần này tới ${preview||memberIds.length+" thành viên"}?`))return;
  state.settings.cleaningReminder={
    id:uid(),createdAt:nowIso(),weekStart:schedule.weekStart,memberIds,
    senderName:String(authSession.access?.displayName||authSession.user?.displayName||"Trưởng phòng").trim().slice(0,80)||"Trưởng phòng"
  };
  await persist(`Đã nhắc ${memberIds.length} thành viên`,{
    action:"SEND_CLEANING_REMINDER",
    summary:`Nhắc ${memberIds.length} thành viên hoàn thành việc trực tuần ${schedule.weekStart}`
  });
}
let schedulePreview=null;

function createSchedule(){
  if(!requireAdmin())return;
  const week=$("#cleanWeek").value;
  if(!P708BillingCycle.parseDateKey(week))return toast("Chọn tuần bắt đầu");
  if(state.schedules.some(s=>s.weekStart===week))return toast("Tuần này đã có lịch.");
  const assignments=P708CleaningFairness.proposeCleaningSchedule({
    members:state.members,presence:state.presence,tasks:TASKS,schedules:state.schedules,week,
    weights:state.settings.weights,adjustments:state.settings.cleaningPointAdjustments,resetThrough:cleaningPointsResetThrough()
  });
  if(!assignments.length)return toast("Không có thành viên có mặt");
  const present=state.members.filter(m=>state.presence[m.id]!==false);
  const absent=state.members.filter(m=>state.presence[m.id]===false);
  schedulePreview={week,assignments,absent,tombstone:clone(state._sync?.deletedSchedules?.[week]||null),actor:authSession.user?.uid};
  $("#schedulePreviewTitle").textContent=weekRange(week);
  $("#schedulePreviewFields").innerHTML=assignments.map(a=>{
    const reason=a.reason.kind==="proposal"
      ? `${formatCleaningPoints(a.reason.load)} điểm xếp lịch · Lần trực gần nhất: ${a.reason.lastAny||"chưa có"}`
      : "Được miễn trong tuần này";
    const options=present.map(m=>`<option value="${esc(m.id)}" ${m.id===a.personId?"selected":""}>${esc(m.name)}</option>`).join("");
    return `<label class="field schedule-preview-field"><b>${esc(a.task)}</b><select data-preview-task="${esc(a.taskId)}"><option value="">Tạm miễn</option>${options}</select><small>${esc(reason)}</small></label>`;
  }).join("");
  openModal("schedulePreviewModal");
}

async function confirmSchedule(){
  const preview=schedulePreview;
  if(!requireAdmin()||!preview||preview.actor!==authSession.user?.uid)return;
  const {week,absent,tombstone}=preview;
  if(state.schedules.some(s=>s.weekStart===week))return toast("Tuần này vừa có lịch trên thiết bị khác.");
  const assignments=preview.assignments.map(a=>{
    const selected=$(`[data-preview-task="${a.taskId}"]`).value;
    if((a.personId||"")===selected)return a;
    const member=state.members.find(m=>m.id===selected);
    return {...a,personId:selected||null,personName:member?.name||"Tạm cắt",cut:!selected,reason:{kind:selected?"fixed":"exempt"}};
  });
  if(assignments.some(a=>a.personId&&(!state.members.some(m=>m.id===a.personId)||state.presence[a.personId]===false)))return toast("Danh sách có mặt đã đổi. Hãy tạo đề xuất mới.");
  const t=nowIso(),schedule={
    id:uid(),weekStart:week,createdAt:t,updatedAt:t,locked:true,assignments,
    absentNames:absent.map(m=>m.name),absentMemberIds:absent.map(m=>m.id),
    fairnessPolicy:{longAbsenceMinWeeks:2,longAbsenceCredit:"present_average_load",version:2}
  };
  if(state._sync?.deletedSchedules)delete state._sync.deletedSchedules[week];
  state.schedules.push(schedule);
  state.schedules.sort((a,b)=>a.weekStart.localeCompare(b.weekStart));
  ui.selectedScheduleId=schedule.id;
  schedulePreview=null;closeModal("schedulePreviewModal");
  await persist("Đã xác nhận lịch trực",{action:"CREATE_SCHEDULE",summary:`Tạo lịch tuần ${week}`,week,tombstone});
}
function selectSchedule(scheduleId){
  ui.selectedScheduleId=scheduleId;
  const s=currentSchedule();
  if(s)$("#cleanWeek").value=s.weekStart;
  saveLocal();renderCleaning();
}
async function deleteSchedule(){
  if(!requireAdmin())return;
  const s=currentSchedule();
  if(!s)return toast("Chưa có lịch");
  if(!confirm(`Xóa lịch ${weekRange(s.weekStart)}?`))return;
  const weekStart=s.weekStart;
  state.schedules=state.schedules.filter(x=>x.id!==s.id);
  ui.selectedScheduleId=null;
  const ok=await persist("Đã xóa lịch",{action:"DELETE_SCHEDULE",summary:`Xóa lịch tuần ${weekStart}`});
  if(ok)await realtimeEngine?.deleteTaskSubmissionsForWeek(weekStart).catch(()=>{});
}
function openManual(){
  if(!requireAdmin())return;
  const s=currentSchedule();
  if(!s)return toast("Hãy tạo lịch trước");
  if(s.locked)return toast("Lịch đã xác nhận.");
  $("#manualFields").innerHTML=TASKS.map(task=>{
    const a=s.assignments.find(x=>x.taskId===task.id);
    return `<div class="field"><label>${task.emoji} ${esc(task.name)}</label><select data-manual-task="${task.id}"><option value="__CUT__" ${a?.cut?"selected":""}>Tạm cắt</option>${state.members.map(m=>`<option value="${m.id}" ${a?.personId===m.id?"selected":""}>${esc(m.name)}</option>`).join("")}</select></div>`;
  }).join("");
  openModal("manualModal");
}
async function saveManual(){
  if(!requireAdmin())return;
  const s=currentSchedule();
  if(!s)return;
  if(s.locked)return toast("Lịch đã xác nhận.");
  const oldByTask=Object.fromEntries((s.assignments||[]).map(a=>[a.taskId,a]));
  s.assignments=TASKS.map(task=>{
    const value=$(`[data-manual-task="${task.id}"]`)?.value,old=oldByTask[task.id];
    if(value==="__CUT__")return {taskId:task.id,task:task.name,personId:null,personName:"Tạm cắt",completed:false,cut:true};
    const m=state.members.find(x=>x.id===value),unchanged=!!m&&old&&!old.cut&&old.personId===m.id;
    return {taskId:task.id,task:task.name,personId:m?.id||null,personName:m?.name||"Không rõ",completed:unchanged?!!old.completed:false,cut:!m};
  });
  s.updatedAt=nowIso();
  closeModal("manualModal");
  const ok=await persist("Đã lưu phân công",{action:"UPDATE_SCHEDULE",summary:`Chỉnh phân công tuần ${s.weekStart}`});
  if(ok)await realtimeEngine?.reconcileTaskSubmissions({weekStart:s.weekStart,assignments:s.assignments}).catch(()=>{});
}
async function submitTask(index,status="submitted"){
  if(!navigator.onLine)return toast("Đang ngoại tuyến · hãy kết nối mạng trước khi báo hoàn thành",5000);
  const s=currentSchedule(),a=s?.assignments?.[index];
  if(!s||!a||a.cut)return;
  if(a.personId!==myMemberId())return toast("Bạn chỉ được báo hoàn thành việc của mình");
  const existing=submissionFor(s,a);
  if(existing?.status==="submitted")return toast("Công việc này đã báo hoàn thành và đang chờ xác nhận");
  if(existing?.status==="approved")return toast("Công việc đã được xác nhận");
  try{
    await realtimeEngine?.submitTask({scheduleId:s.id,weekStart:s.weekStart,taskId:a.taskId,taskName:a.task,memberId:a.personId,status});
    toast(status==="in_progress"?"Đã bắt đầu công việc":"Đã báo hoàn thành, chờ trưởng phòng xác nhận");
  }catch(e){toast(e?.message||"Không thể báo hoàn thành");}
}
async function reviewTask(index,approved){
  if(!requireAdmin())return;
  const s=currentSchedule(),a=s?.assignments?.[index];
  if(!s||!a)return;
  const sub=submissionFor(s,a);
  if(!sub||sub.status!=="submitted")return toast("Không có báo hoàn thành đang chờ");
  try{
    await realtimeEngine?.reviewTask({
      submissionId:sub.id,status:approved?"approved":"rejected",note:approved?"Đã xác nhận":"Yêu cầu làm lại"
    });
    toast(approved?"Đã xác nhận công việc":"Đã yêu cầu làm lại");
  }catch(e){toast(e?.message||"Không thể cập nhật xác nhận");}
}
function adminToggleTask(index){
  if(!requireAdmin())return;
  const s=currentSchedule(),a=s?.assignments?.[index];
  if(!s||!a||a.cut)return;
  const sub=submissionFor(s,a);
  if(sub?.status==="submitted")return toast("Thành viên đang chờ xác nhận. Hãy dùng Xác nhận hoặc Làm lại.");
  a.completed=!a.completed;s.updatedAt=nowIso();
  persist(a.completed?"Đã đánh dấu hoàn thành":"Đã bỏ hoàn thành",{
    action:"UPDATE_TASK",summary:`${a.task}: ${a.completed?"Đã xong":"Chưa xong"}`,targetMemberId:a.personId
  });
}
function scheduleText(){
  const s=currentSchedule();
  if(!s)return "";
  return [
    "📌 LỊCH TRỰC NHẬT",
    `🗓️ ${weekRange(s.weekStart)}`,
    s.absentNames?.length?`🚫 Vắng: ${s.absentNames.join(", ")}`:"✅ Tất cả có mặt",
    "",
    ...s.assignments.map(a=>`${TASKS.find(t=>t.id===a.taskId)?.emoji||"•"} ${a.task}: ${a.personName}${a.completed?" ✅":""}`)
  ].join("\n");
}
async function copyText(text,message){
  if(!text)return toast("Không có nội dung");
  try{await navigator.clipboard.writeText(text);toast(message);}
  catch{
    const t=document.createElement("textarea");t.value=text;document.body.appendChild(t);t.select();
    document.execCommand("copy");t.remove();toast(message);
  }
}
