// Runtime integrity guards loaded after core/actions/render and before app start.
// These guards keep account mappings one-to-one and surface data inconsistencies
// before they become silent billing/realtime errors.

function activeAccountUsingMember(memberId,exceptUid=""){
  if(!memberId)return null;
  return (accessAccounts||[]).find(x=>x.uid!==exceptUid&&x.active!==false&&x.memberId===memberId)||null;
}
function requireOnlineAction(){
  if(navigator.onLine)return true;
  toast("Đang ngoại tuyến · thao tác quản trị tạm khóa để tránh xung đột dữ liệu",5000);
  return false;
}

async function approveAccess(targetUid){
  if(!requireOnlineAction())return;
  const memberId=$(`[data-approve-member="${CSS.escape(targetUid)}"]`)?.value||"";
  const role=$(`[data-approve-role="${CSS.escape(targetUid)}"]`)?.value||"member";
  const req=accessRequests.find(x=>x.uid===targetUid);
  if(!req)return toast("Yêu cầu này không còn tồn tại");
  if(memberId){
    const conflict=activeAccountUsingMember(memberId,targetUid);
    if(conflict)return toast(`Thành viên này đang liên kết với ${conflict.displayName||conflict.email||"một tài khoản khác"}. Hãy gỡ liên kết cũ trước.`,6000);
  }else if(role!=="admin"&&!confirm("Tài khoản thành viên chưa được liên kết với người trong phòng nên sẽ không thể tự sửa trạng thái/ngày ở. Vẫn duyệt?"))return;
  try{
    await realtimeEngine?.approveRequest({uid:targetUid,memberId,role,displayName:req.displayName||""});
    toast("Đã duyệt tài khoản");
  }catch(e){toast(e?.message||"Không thể duyệt");}
}

async function saveAccess(targetUid){
  if(!requireOnlineAction())return;
  const memberId=$(`[data-access-member="${CSS.escape(targetUid)}"]`)?.value||"";
  let role=$(`[data-access-role="${CSS.escape(targetUid)}"]`)?.value||"member";
  if(targetUid===authSession.user?.uid&&isAdmin())role="admin";
  const item=accessAccounts.find(x=>x.uid===targetUid);
  if(!item)return toast("Không tìm thấy tài khoản");
  if(memberId){
    const conflict=activeAccountUsingMember(memberId,targetUid);
    if(conflict)return toast(`Thành viên này đang liên kết với ${conflict.displayName||conflict.email||"một tài khoản khác"}. Mỗi thành viên chỉ nên có một tài khoản hoạt động.`,6000);
  }else if(role!=="admin"&&!confirm("Bỏ liên kết thành viên? Tài khoản này sẽ chỉ xem và không thể sửa dữ liệu cá nhân. Vẫn lưu?"))return;
  try{
    await realtimeEngine?.updateAccess({uid:targetUid,memberId,role,displayName:item.displayName||"",active:true});
    toast("Đã cập nhật quyền");
  }catch(e){toast(e?.message||"Không thể cập nhật");}
}

function reportDataIntegrity(){
  if(!isAdmin())return [];
  const issues=[];
  const active=(accessAccounts||[]).filter(x=>x.active!==false);
  const byMember=new Map();
  active.filter(x=>x.memberId).forEach(x=>{const arr=byMember.get(x.memberId)||[];arr.push(x);byMember.set(x.memberId,arr);});
  for(const [memberId,accounts] of byMember){
    if(accounts.length>1){const m=state.members.find(x=>x.id===memberId);issues.push(`Trùng liên kết tài khoản: ${m?.name||memberId} (${accounts.length})`);}
  }
  for(const account of active){
    if(account.memberId&&!state.members.some(m=>m.id===account.memberId))issues.push(`Tài khoản ${account.displayName||account.email||account.uid} đang liên kết tới thành viên đã bị xóa`);
    if(account.role!=="admin"&&!account.memberId)issues.push(`Tài khoản ${account.displayName||account.email||account.uid} chưa liên kết thành viên`);
  }

  const monthCounts=new Map();
  for(const b of state.billing?.months||[]){
    monthCounts.set(b.month,(monthCounts.get(b.month)||0)+1);
    const seen=new Map();
    for(const p of b.people||[]){if(!p.memberId)continue;seen.set(p.memberId,(seen.get(p.memberId)||0)+1);}
    for(const [memberId,count] of seen){
      if(count>1){const m=state.members.find(x=>x.id===memberId);issues.push(`${monthLabel(b.month)} có ${count} bản ghi cho ${m?.name||memberId}`);}
    }
  }
  for(const [month,count] of monthCounts){if(count>1)issues.push(`${monthLabel(month)} có ${count} bảng hóa đơn trùng tháng`);}

  const weekCounts=new Map();
  for(const schedule of state.schedules||[])weekCounts.set(schedule.weekStart,(weekCounts.get(schedule.weekStart)||0)+1);
  for(const [week,count] of weekCounts){if(count>1)issues.push(`Tuần ${week} có ${count} lịch trực trùng`);}

  if(typeof relevantTaskSubmissions==="function"){
    const validIds=new Set(relevantTaskSubmissions().map(x=>x.id));
    const stale=(taskSubmissions||[]).filter(x=>!validIds.has(x.id));
    if(stale.length)issues.push(`Có ${stale.length} báo công việc cũ không còn khớp phân công`);
  }
  return issues;
}
